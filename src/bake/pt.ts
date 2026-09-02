import {
  ACESFilmicToneMapping,
  ClampToEdgeWrapping,
  Color,
  Euler,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  NoBlending,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  FloatType,
  HalfFloatType,
  WebGLRenderTarget,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PathTracingSceneGenerator, WebGLPathTracer } from 'three-gpu-pathtracer';
import { AmbientOcclusionMaterial } from 'three-gpu-pathtracer/src/materials/surface/AmbientOcclusionMaterial.js';
import type { AmbientOcclusionMaterial as AmbientOcclusionMaterialType } from 'three-gpu-pathtracer/src/materials/surface/AmbientOcclusionMaterial.js';
import { MeshBVHUniformStruct } from 'three-mesh-bvh';
import { halfToFloat, PAD_PX, PX_PER_UNIT } from './bake.js';
import { frameIsoBox, type IsoFrame } from './iso.js';
import type { MaterialGroup, Primitive } from './primitives.js';

export { PT_NAME } from './pt-version.js';

export interface PtSettings {
  /** Target accumulated sample count for the render pass. */
  samples: number;
  /** Max light bounces for the render pass. */
  bounces: number;
  /** Edge length of the packed texture array the PT repacks materials into. */
  textureSize: number;
  /** AO hemisphere ray count per pixel (total across accumulation frames). */
  aoSamples: number;
  /** AO occlusion radius in world units. */
  aoRadius: number;
  /** Recorded in the manifest; the screen-space denoiser ships disabled. */
  denoise: boolean;
}

export const DEFAULT_PT_SETTINGS: PtSettings = {
  samples: 32,
  bounces: 5,
  textureSize: 1024,
  aoSamples: 64,
  aoRadius: 0.4,
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
  ao?: PtImage;
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

// Running-average accumulation without hardware blending (same strategy as
// WebGLPathTracer's own manual alpha blending): blending into half-float
// targets proved unreliable across drivers, so each frame overwrites the
// output by mixing the previous average with the new sample on the GPU.
const AO_BLEND_FRAG = `
uniform sampler2D uMap;
uniform sampler2D uPrev;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(uMap, vUv);
  vec4 p = texture2D(uPrev, vUv);
  gl_FragColor = mix(p, s, uWeight);
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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yieldFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Max-alpha / max-value summary of a render target, for console audits. */
function readTargetStats(renderer: WebGLRenderer, target: WebGLRenderTarget): string {
  const isHalf = target.texture.type === HalfFloatType;
  const buffer: Uint16Array | Float32Array = isHalf
    ? new Uint16Array(target.width * target.height * 4)
    : new Float32Array(target.width * target.height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, buffer);
  let maxA = 0;
  let maxV = 0;
  for (let i = 0; i < target.width * target.height; i++) {
    const r = isHalf ? halfToFloat((buffer as Uint16Array)[i * 4]) : (buffer as Float32Array)[i * 4];
    const a = isHalf
      ? halfToFloat((buffer as Uint16Array)[i * 4 + 3])
      : (buffer as Float32Array)[i * 4 + 3];
    maxV = Math.max(maxV, Math.abs(r));
    maxA = Math.max(maxA, a);
  }
  return `maxA=${maxA.toFixed(3)} maxR=${maxV.toFixed(3)}`;
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

export class PtBaker {
  private scene = new Scene();
  private frame: IsoFrame;
  private meshes: Mesh[] = [];
  private settings: PtSettings;
  private env: PtEnvironment = { ...DEFAULT_ENVIRONMENT };

  private tracer: WebGLPathTracer | null = null;
  private sceneDirty = true;

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
   * Accumulates the lit render pass and returns its tone-mapped, sRGB
   * bytes (GL readback order). Requires an environment.
   */
  async renderPass(
    onProgress?: (samples: number, total: number) => void,
  ): Promise<PtImage> {
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
    tracer.tiles.set(1, 1);

    if (this.sceneDirty) {
      tracer.setScene(this.scene, this.frame.camera);
      this.sceneDirty = false;
    } else {
      // Environment rotation/intensity changed since the last pass.
      tracer.updateEnvironment();
    }
    tracer.reset();

    const t0 = performance.now();
    while (tracer.samples < this.settings.samples) {
      if (performance.now() - t0 > 120_000) {
        throw new Error(`render pass stalled at ${tracer.samples} samples`);
      }
      tracer.renderSample();
      onProgress?.(tracer.samples, this.settings.samples);
      await yieldFrame();
    }

    return this.tonemap(tracer.target);
  }

  /** ACES tonemap + sRGB encode into RGBA8, readback in GL order. */
  private tonemap(source: WebGLRenderTarget): PtImage {
    const renderer = getRenderer();
    const w = source.width;
    const h = source.height;
    const target = new WebGLRenderTarget(w, h, {
      format: RGBAFormat,
      type: UnsignedByteType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    this.tonemapMaterial.uniforms.uMap.value = source.texture;
    renderer.setRenderTarget(target);
    this.tonemapQuad.render(renderer);
    const rgba = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, rgba);
    renderer.setRenderTarget(null);
    target.dispose();
    this.tonemapMaterial.uniforms.uMap.value = null;
    return { width: w, height: h, rgba };
  }

  /**
   * Accumulates the AO pass (aoRender pattern: hemisphere rays through a
   * BVH, running average in a second target). Independent of the
   * environment; returns grayscale bytes with coverage alpha.
   */
  async aoPass(onProgress?: (fraction: number) => void): Promise<PtImage> {
    const renderer = getRenderer();
    renderer.setSize(this.frame.width, this.frame.height, false);

    const generator = new PathTracingSceneGenerator();
    generator.setObjects(this.scene);
    const { bvh } = generator.generate();
    const bvhUniform = new MeshBVHUniformStruct();
    bvhUniform.updateFrom(bvh);

    const aoMaterial: AmbientOcclusionMaterialType = new AmbientOcclusionMaterial();
    aoMaterial.bvh = bvhUniform;
    aoMaterial.radius = this.settings.aoRadius;
    const raysPerFrame = 4;
    aoMaterial.setDefine('SAMPLES', raysPerFrame);
    const frames = Math.max(1, Math.round(this.settings.aoSamples / raysPerFrame));

    const saved = this.meshes.map((mesh) => mesh.material);
    for (const mesh of this.meshes) mesh.material = aoMaterial;

    const sampleTarget = new WebGLRenderTarget(this.frame.width, this.frame.height, {
      format: RGBAFormat,
      type: FloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: true,
    });
    const accumTargets = [0, 1].map(() =>
      new WebGLRenderTarget(this.frame.width, this.frame.height, {
        format: RGBAFormat,
        type: HalfFloatType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
      }),
    );
    const blendMaterial = new ShaderMaterial({
      vertexShader: TONEMAP_VERT,
      fragmentShader: AO_BLEND_FRAG,
      uniforms: {
        uMap: { value: null },
        uPrev: { value: null },
        uWeight: { value: 1 },
      },
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    const blendQuad = new FullScreenQuad(blendMaterial);

    const rng = mulberry32(0x9e3779b9);
    const { width, height, camera } = this.frame;
    let accumRead = 0;
    try {
      renderer.setClearColor(0x000000, 0);
      for (let n = 1; n <= frames; n++) {
        // Seeded sub-pixel jitter: deterministic AA for the raster pass.
        camera.setViewOffset(width, height, rng() - 0.5, rng() - 0.5, width, height);
        aoMaterial.seed = n - 1;
        renderer.setRenderTarget(sampleTarget);
        renderer.render(this.scene, camera);
        if (n === 1) {
          // Diagnostics for the "transparent AO" failure mode: did anything
          // rasterize, and did a shader fail to compile?
          const renderInfo = renderer.info.render;
          const diag = (renderer.info.programs ?? [])
            .filter((p) => (p as unknown as { diagnostics?: object }).diagnostics !== undefined)
            .map((p) => JSON.stringify((p as unknown as { diagnostics?: object }).diagnostics))
            .join(' | ');
          const sampleProbe = readTargetStats(renderer, sampleTarget);
          console.log(
            `[pt-audit] ao frame 1: drawCalls=${renderInfo.calls} tris=${renderInfo.triangles} ${sampleProbe}` +
              (diag ? ` SHADER_DIAGNOSTICS: ${diag}` : ''),
          );
        }
        // Overwrite the write target with mix(prevAverage, sample, 1/n).
        // Frame 1 uses the sample as both inputs, so mix() yields the sample.
        const accumWrite = 1 - accumRead;
        renderer.setRenderTarget(accumTargets[accumWrite]);
        renderer.autoClear = false;
        blendMaterial.uniforms.uMap.value = sampleTarget.texture;
        blendMaterial.uniforms.uPrev.value =
          n === 1 ? sampleTarget.texture : accumTargets[accumRead].texture;
        blendMaterial.uniforms.uWeight.value = 1 / n;
        blendQuad.render(renderer);
        renderer.autoClear = true;
        renderer.setRenderTarget(null);
        accumRead = accumWrite;
        onProgress?.(n / frames);
        await yieldFrame();
      }
    } finally {
      camera.clearViewOffset();
      for (let i = 0; i < this.meshes.length; i++) this.meshes[i].material = saved[i];
      blendQuad.dispose();
      blendMaterial.dispose();
      sampleTarget.dispose();
      accumTargets[0].dispose();
      accumTargets[1].dispose();
      aoMaterial.dispose();
      bvhUniform.dispose();
    }

    const half = new Uint16Array(width * height * 4);
    renderer.readRenderTargetPixels(accumTargets[accumRead], 0, 0, width, height, half);
    let nonzeroAlpha = 0;
    let maxValue = 0;
    for (let i = 0; i < width * height; i++) {
      const a = halfToFloat(half[i * 4 + 3]);
      if (a > 0) nonzeroAlpha++;
      maxValue = Math.max(maxValue, Math.abs(halfToFloat(half[i * 4])), a);
    }
    console.log(`[pt-audit] ao accum: frames=${frames} nonzeroAlphaPx=${nonzeroAlpha}/${width * height} maxV=${maxValue.toFixed(4)}`);
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = Math.round(Math.min(1, Math.max(0, halfToFloat(half[i * 4]))) * 255);
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, halfToFloat(half[i * 4 + 3]))) * 255);
    }
    return { width, height, rgba };
  }

  dispose(): void {
    this.tracer?.dispose();
    this.tracer = null;
    this.tonemapQuad.dispose();
    this.tonemapMaterial.dispose();
  }
}
