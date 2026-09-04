import {
  ACESFilmicToneMapping,
  ClampToEdgeWrapping,
  Color,
  Euler,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { PAD_PX, PX_PER_UNIT } from './bake.js';
import { frameIsoBox, type IsoFrame } from './iso.js';
import type { MaterialGroup, Primitive } from './primitives.js';

export { PT_NAME } from './pt-version.js';

/**
 * `WebGLPathTracer.isCompiling` exists in the pinned release's JavaScript (a
 * getter over the internal path tracer) but is missing from its index.d.ts —
 * read it through this narrowed view.
 */
type CompilingTracer = WebGLPathTracer & { readonly isCompiling: boolean };

export interface PtSettings {
  /** Target accumulated sample count for the render pass. */
  samples: number;
  /** Max light bounces for the render pass. */
  bounces: number;
  /** Edge length of the packed texture array the PT repacks materials into. */
  textureSize: number;
  /** Recorded in the manifest; the screen-space denoiser ships disabled. */
  denoise: boolean;
  /**
   * Tile-grid edge (the grid is N x N) derived from the frame size at pass
   * start. Not user-editable and not preset material — the grid shapes the
   * accumulated bytes, so it is recorded in provenance and re-derived
   * (identically) on re-bake.
   */
  tiles?: number;
}

/** Per-tile GPU-work budget: a tile draws at most ~this many frame pixels. */
const TILE_BUDGET_PX = 512 * 512;
/** Tile-grid ceiling; bounds the per-sample draw count for the largest frames. */
const TILE_GRID_MAX = 8;

/**
 * Tile-grid edge for a frame size — a pure function of the pixel count, so
 * the same frame always renders (and re-bakes) with the same grid: the
 * accumulated bytes depend on the grid, never on how tiles are grouped
 * across animation frames.
 */
export function tileGridFor(width: number, height: number): number {
  const px = Math.max(1, width) * Math.max(1, height);
  return Math.min(TILE_GRID_MAX, Math.max(1, Math.ceil(Math.sqrt(px / TILE_BUDGET_PX))));
}

export const DEFAULT_PT_SETTINGS: PtSettings = {
  samples: 32,
  bounces: 5,
  textureSize: 1024,
  denoise: false,
};

export interface PtEnvironment {
  /** Equirectangular HDR texture, or null while nothing is loaded. */
  texture: Texture | null;
  name: string;
  rotationDeg: number;
  intensity: number;
  exposure: number;
  /** Display-referred saturation multiplier (0 = gray, 1 = neutral). */
  saturation: number;
}

export const DEFAULT_ENVIRONMENT: PtEnvironment = {
  texture: null,
  name: '',
  rotationDeg: 0,
  intensity: 1,
  exposure: 1,
  saturation: 1,
};

/**
 * One produced pass image, in GL readback order (rows bottom-up), ready for
 * preview and PNG export through the shared flip helpers.
 */
export interface PtImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** Path-traced passes plus the provenance recorded alongside them. */
export interface PtExtras {
  render?: PtImage;
  environment?: PtEnvironment;
  settings?: PtSettings;
}

const TONEMAP_FRAG = `
uniform sampler2D uMap;
uniform float uSaturation;
varying vec2 vUv;
vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
void main() {
  vec4 texel = texture2D(uMap, vUv);
  gl_FragColor = vec4(texel.rgb, texel.a);
  // Three's ACES fit + exposure, exactly what the on-screen path uses.
  #include <tonemapping_fragment>
  // Rendering into a plain RGBA8 target leaves <colorspace_fragment> a
  // no-op, so the sRGB transfer is applied explicitly.
  gl_FragColor.rgb = linearToSrgb(max(gl_FragColor.rgb, vec3(0.0)));
  // Display-referred saturation: mix toward Rec.709 luminance.
  float lum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = mix(vec3(lum), gl_FragColor.rgb, uSaturation);
}
`;

const TONEMAP_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** PT ignores material color management; bake.ts already disabled it. */

/** The library requires uniform wrap/filter flags across all scene textures. */
function normalizeTextures(scene: Scene): void {
  scene.traverse((obj) => {
    const material = (obj as Mesh).material as MeshStandardMaterial | undefined;
    if (!material || !(material as MeshStandardMaterial).isMeshStandardMaterial) return;
    for (const tex of [
      material.map,
      material.normalMap,
      material.roughnessMap,
      material.metalnessMap,
      material.aoMap,
      material.emissiveMap,
    ]) {
      if (!tex) continue;
      tex.wrapS = ClampToEdgeWrapping;
      tex.wrapT = ClampToEdgeWrapping;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
    }
  });
}

function fallbackMaterialForGroup(group: MaterialGroup): MeshStandardMaterial {
  const material = new MeshStandardMaterial();
  if (group.albedoTexture) material.map = group.albedoTexture;
  const [r, g, b, a] = group.baseColorFactor;
  material.color = new Color(r, g, b);
  // Never set `transparent` — the path tracer treats it as transmission.
  // MASK coverage comes through alphaTest; BLEND bakes opaque (bake
  // pipeline convention).
  if (group.alphaMode === 'mask') material.alphaTest = group.alphaCutoff || 0.5;
  material.opacity = a;
  return material;
}

let sharedRenderer: WebGLRenderer | null = null;

/** One WebGL context for the page; sized per bake (PT targets follow it). */
function getRenderer(): WebGLRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new WebGLRenderer({ antialias: false, stencil: false });
    sharedRenderer.toneMapping = ACESFilmicToneMapping;
    sharedRenderer.outputColorSpace = SRGBColorSpace;
  }
  return sharedRenderer;
}

/** Callbacks driving an accumulating render pass. */
export interface PtRenderCallbacks {
  /**
   * Sample progress, reported when the completed-sample count or the
   * compiling state changes. `samples` is floored — the library's counter
   * advances fractionally within a sample while tiles render.
   */
  onProgress?: (samples: number, total: number, compiling: boolean) => void;
  /** Throttled low-res tonemap of the partial accumulation (live preview). */
  onPreview?: (image: PtImage) => void;
  /** Checked before every draw batch; a true return cancels the pass. */
  isCancelled?: () => boolean;
}

/** Per-animation-frame draw budget for tile rendering (pacing only). */
const TICK_BUDGET_MS = 10;
/** Minimum interval between live-preview readbacks. */
const PREVIEW_INTERVAL_MS = 100;
/** Long-axis cap of the live-preview image. */
const PREVIEW_MAX_PX = 512;
/** Without sample progress (or while compiling: excluded) a pass errors. */
const STALL_TIMEOUT_MS = 120_000;

export class PtBaker {
  private scene = new Scene();
  private frame: IsoFrame;
  private meshes: Mesh[] = [];
  private settings: PtSettings;
  private env: PtEnvironment = { ...DEFAULT_ENVIRONMENT };

  private tracer: WebGLPathTracer | null = null;
  private sceneDirty = true;
  /** Set by dispose(); the running pass checks it between draw batches. */
  private disposed = false;
  private previewTarget: WebGLRenderTarget | null = null;
  private previewPixels: Uint8Array | null = null;

  private tonemapMaterial: ShaderMaterial;
  private tonemapQuad: FullScreenQuad;

  pxPerUnit: number;

  constructor(settings: PtSettings, pxPerUnit: number = PX_PER_UNIT) {
    this.pxPerUnit = pxPerUnit;
    this.settings = { ...settings };
    this.frame = frameIsoBox([1, 1, 1], pxPerUnit, PAD_PX);
    this.tonemapMaterial = new ShaderMaterial({
      vertexShader: TONEMAP_VERT,
      fragmentShader: TONEMAP_FRAG,
      uniforms: { uMap: { value: null }, uSaturation: { value: 1 } },
      depthTest: false,
      depthWrite: false,
    });
    this.tonemapQuad = new FullScreenQuad(this.tonemapMaterial);
  }

  get width(): number {
    return this.frame.width;
  }

  get height(): number {
    return this.frame.height;
  }

  /** The tile grid derived for the last (or running) pass; null before one. */
  get tileGrid(): number | null {
    return this.settings.tiles ?? null;
  }

  /** Rebuilds the PT scene for a new source; the next pass regenerates. */
  setPrimitive(prim: Primitive, pxPerUnit: number = this.pxPerUnit): void {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes = [];

    if (prim.groups) {
      for (const group of prim.groups) {
        const mesh = new Mesh(group.geometry, this.materialFor(group));
        mesh.scale.setScalar(prim.scale ?? 1);
        this.meshes.push(mesh);
      }
    } else {
      const material = new MeshStandardMaterial({ color: new Color(prim.albedoHex) });
      const mesh = new Mesh(prim.geometry, material);
      mesh.position.set(prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2);
      this.meshes.push(mesh);
    }
    for (const mesh of this.meshes) this.scene.add(mesh);
    normalizeTextures(this.scene);

    this.pxPerUnit = pxPerUnit;
    this.frame = frameIsoBox(prim.size, pxPerUnit, PAD_PX);
    this.sceneDirty = true;
  }

  private materialFor(group: MaterialGroup): Material {
    return group.pbrMaterial ?? fallbackMaterialForGroup(group);
  }

  setEnvironment(env: PtEnvironment): void {
    this.env = { ...env };
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = env.intensity;
    this.scene.environmentRotation = new Euler(0, (env.rotationDeg * Math.PI) / 180, 0);
    this.scene.background = null;
    getRenderer().toneMappingExposure = env.exposure;
    this.tonemapMaterial.uniforms.uSaturation.value = env.saturation;
  }

  /** Picks up new settings; texture repacking forces a scene rebuild. */
  applySettings(settings: PtSettings): void {
    if (settings.textureSize !== this.settings.textureSize) this.sceneDirty = true;
    this.settings = { ...settings };
  }

  /**
   * Accumulates the lit render pass over a tile grid, one or more tiles per
   * animation frame within a wall-time budget, and returns its tone-mapped,
   * sRGB bytes (GL readback order) — or null when cancelled. Requires an
   * environment. Cancellation and disposal are checked between draw
   * batches, so a superseded pass stops before its next draw.
   */
  async renderPass(callbacks: PtRenderCallbacks = {}): Promise<PtImage | null> {
    const { onProgress, onPreview, isCancelled } = callbacks;
    if (!this.env.texture) {
      throw new Error('render pass needs an HDRI environment — load one first');
    }
    const renderer = getRenderer();
    renderer.setSize(this.frame.width, this.frame.height, false);

    if (!this.tracer) this.tracer = new WebGLPathTracer(renderer);
    const tracer = this.tracer;
    tracer.bounces = this.settings.bounces;
    tracer.renderDelay = 0;
    tracer.minSamples = 1;
    tracer.fadeDuration = 0;
    tracer.renderScale = 1;
    tracer.renderToCanvas = false;
    tracer.rasterizeScene = false;
    tracer.textureSize = new Vector2(this.settings.textureSize, this.settings.textureSize);

    if (this.sceneDirty) {
      tracer.setScene(this.scene, this.frame.camera);
      this.sceneDirty = false;
    } else {
      // Environment rotation/intensity changed since the last pass.
      tracer.updateEnvironment();
    }
    tracer.reset();

    // Derived per pass from the frame size: the grid shapes the accumulated
    // bytes (the RNG state advances per tile draw), so it is deterministic
    // per frame size and recorded in provenance. Pacing below groups tiles
    // freely across frames — that never affects bytes.
    const tiles = tileGridFor(this.frame.width, this.frame.height);
    tracer.tiles.set(tiles, tiles);
    this.settings = { ...this.settings, tiles };

    const total = this.settings.samples;
    let stallT0 = performance.now();
    let reportedSamples = -1;
    let reportedCompiling = false;
    let lastPreview = -Infinity;

    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (this.disposed || isCancelled?.()) return resolve();
        const compiling = (tracer as CompilingTracer).isCompiling;
        const samples = Math.min(total, Math.floor(tracer.samples));
        const now = performance.now();
        // The guard watches for a pass that stops making progress; shader
        // compilation blocks progress legitimately and holds the window.
        if (compiling || samples !== reportedSamples) stallT0 = now;
        if (samples !== reportedSamples || compiling !== reportedCompiling) {
          reportedSamples = samples;
          reportedCompiling = compiling;
          onProgress?.(samples, total, compiling);
        }
        if (now - stallT0 > STALL_TIMEOUT_MS) {
          reject(new Error(`render pass stalled at ${samples} samples`));
          return;
        }
        if (!compiling) {
          const frameT0 = performance.now();
          do {
            tracer.renderSample();
          } while (
            !this.disposed &&
            !isCancelled?.() &&
            tracer.samples < total &&
            performance.now() - frameT0 < TICK_BUDGET_MS
          );
          if (this.disposed || isCancelled?.()) return resolve();
          if (onPreview && now - lastPreview >= PREVIEW_INTERVAL_MS) {
            lastPreview = now;
            onPreview(this.preview(tracer.target));
          }
        }
        if (tracer.samples >= total) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    if (this.disposed || isCancelled?.()) return null;
    return this.tonemap(tracer.target);
  }

  /** ACES tonemap + sRGB encode into RGBA8, readback in GL order. */
  private tonemap(source: WebGLRenderTarget): PtImage {
    const w = source.width;
    const h = source.height;
    const target = new WebGLRenderTarget(w, h, {
      format: RGBAFormat,
      type: UnsignedByteType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    this.tonemapInto(source, target);
    const rgba = new Uint8Array(w * h * 4);
    getRenderer().readRenderTargetPixels(target, 0, 0, w, h, rgba);
    target.dispose();
    return { width: w, height: h, rgba };
  }

  /**
   * Downsampled tonemap of the partial accumulation for the live preview:
   * the same shader at preview resolution, read back into a reused buffer
   * and copied per frame (each image lands in store state as owned data).
   */
  private preview(source: WebGLRenderTarget): PtImage {
    const long = Math.max(source.width, source.height);
    const scale = Math.min(1, PREVIEW_MAX_PX / long);
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    if (
      !this.previewTarget ||
      this.previewTarget.width !== w ||
      this.previewTarget.height !== h
    ) {
      this.previewTarget?.dispose();
      this.previewTarget = new WebGLRenderTarget(w, h, {
        format: RGBAFormat,
        type: UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
      });
      this.previewPixels = new Uint8Array(w * h * 4);
    }
    this.tonemapInto(source, this.previewTarget);
    const rgba = this.previewPixels!;
    getRenderer().readRenderTargetPixels(this.previewTarget, 0, 0, w, h, rgba);
    return { width: w, height: h, rgba: rgba.slice() };
  }

  private tonemapInto(source: WebGLRenderTarget, target: WebGLRenderTarget): void {
    const renderer = getRenderer();
    this.tonemapMaterial.uniforms.uMap.value = source.texture;
    renderer.setRenderTarget(target);
    this.tonemapQuad.render(renderer);
    renderer.setRenderTarget(null);
    this.tonemapMaterial.uniforms.uMap.value = null;
  }

  dispose(): void {
    this.disposed = true;
    this.tracer?.dispose();
    this.tracer = null;
    this.previewTarget?.dispose();
    this.previewTarget = null;
    this.previewPixels = null;
    this.tonemapQuad.dispose();
    this.tonemapMaterial.dispose();
  }
}
