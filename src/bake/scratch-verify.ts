/**
 * Scratch browser verification for the bake-glb-assets change (GPU-side
 * checks that cannot run in Node). Open /scratch-verify.html on the dev
 * server. Not part of the production build.
 */
import { bakePrimitive, PAD_PX, applySlotModelRotation, type BakeResult } from './bake.js';
import { groundToScreen, SCREEN_UP, slotAzimuthDeg, VIEW_DIR, VIEW_SLOTS, yawRotatedBoxSize } from '../shared/iso.js';
import { buildBundle, parseBake } from './bundle.js';
import { Renderer as WorldRenderer, meshYawMat, type MeshDraw } from '../runtime/renderer.js';
import { bakeFloatToHalf, layersToSet, RUNTIME_PPU, type SpriteLayer } from '../runtime/assets.js';
import { CharacterPlayer, parseCharacterAsset } from '../runtime/meshAsset.js';
import cesiumManUrl from '../app/assets/CesiumMan.glb?url';
import { decodeBundle } from '../app/bundleView.js';
import {
  strToU8,
  zipSync,
} from 'three/examples/jsm/libs/fflate.module.js';
import { frameIsoBox, projectBoxFrame, type Vec3 } from './iso.js';
import { loadGltf } from './gltf.js';
import {
  getCapsule,
  getCube,
  getCylinder,
  getDonut,
  getPlane,
  getSlab,
  getSphere,
} from './primitives.js';
import {
  GradientEquirectTexture,
  WebGLPathTracer,
} from 'three-gpu-pathtracer';
import {
  Mesh,
  MeshStandardMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type OrthographicCamera,
  type WebGLRenderTarget,
} from 'three';

const out = document.getElementById('out')!;
let passed = 0;
let failed = 0;

function log(msg: string, cls?: 'pass' | 'fail'): void {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  out.appendChild(line);
  console.log(msg);
}

function ok(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    log(`  ok - ${msg}`, 'pass');
  } else {
    failed++;
    log(`  FAIL - ${msg}`, 'fail');
  }
}

function approx(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

// ---------- fixture construction ----------

async function pngBytes(
  fill: (x: number, y: number) => [number, number, number, number],
): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(2, 2);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * 2 + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob!.arrayBuffer());
}

const SOLID_RED = () => [255, 0, 0, 255] as [number, number, number, number];
const MASK_TEX = (x: number): [number, number, number, number] =>
  x === 0 ? [255, 0, 0, 255] : [0, 255, 0, 0];

interface SimpleBuilder {
  bytes: Uint8Array<ArrayBuffer>;
  dv: DataView;
  views: Record<string, unknown>[];
  accessors: Record<string, unknown>[];
  offset: number;
}

function sb(): SimpleBuilder {
  const bytes = new Uint8Array(1 << 20);
  return { bytes, dv: new DataView(bytes.buffer), views: [], accessors: [], offset: 0 };
}

function sbView(b: SimpleBuilder, arr: Float32Array | Uint16Array | Uint8Array, target: number): number {
  while (b.offset % 4 !== 0) b.offset++;
  const byteOffset = b.offset;
  const bytesPerEl = arr instanceof Float32Array ? 4 : arr instanceof Uint16Array ? 2 : 1;
  for (let i = 0; i < arr.length; i++) {
    if (arr instanceof Float32Array) b.dv.setFloat32(b.offset, arr[i], true);
    else if (arr instanceof Uint16Array) b.dv.setUint16(b.offset, arr[i], true);
    else b.dv.setUint8(b.offset, arr[i]);
    b.offset += bytesPerEl;
  }
  b.views.push({ buffer: 0, byteOffset, byteLength: arr.length * bytesPerEl, target });
  return b.views.length - 1;
}

function acc(b: SimpleBuilder, arr: Float32Array | Uint16Array, componentType: number, type: string, withBounds: boolean): number {
  const view = sbView(b, arr, 34962);
  const accessor: Record<string, unknown> = {
    bufferView: view,
    componentType,
    count: type === 'SCALAR' ? arr.length : arr.length / (type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 4),
    type,
  };
  if (withBounds) {
    const n = type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
    const min: number[] = [];
    const max: number[] = [];
    for (let c = 0; c < n; c++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = c; i < arr.length; i += n) {
        lo = Math.min(lo, arr[i]);
        hi = Math.max(hi, arr[i]);
      }
      min.push(lo);
      max.push(hi);
    }
    accessor.min = min;
    accessor.max = max;
  }
  b.accessors.push(accessor);
  return b.accessors.length - 1;
}

interface QuadSpec {
  x0: number;
  material: number;
  name: string;
}

// Builds a model of unit quads in the x/y plane (normal +z) plus two PNGs.
async function buildQuadModel(
  quads: QuadSpec[],
): Promise<{ glb: File; gltfSet: File[] }> {
  const red = await pngBytes(SOLID_RED);
  const mask = await pngBytes(MASK_TEX);

  const b = sb();
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  for (const q of quads) {
    const positions = new Float32Array([q.x0, 0, 0, q.x0 + 1, 0, 0, q.x0 + 1, 1, 0, q.x0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const prim = {
      attributes: {
        POSITION: acc(b, positions, 5126, 'VEC3', true),
        NORMAL: acc(b, normals, 5126, 'VEC3', false),
        TEXCOORD_0: acc(b, uvs, 5126, 'VEC2', false),
      },
      indices: acc(b, indices, 5123, 'SCALAR', false),
      material: q.material,
    };
    meshes.push({ primitives: [prim], name: q.name });
    nodes.push({ mesh: meshes.length - 1, name: q.name });
  }

  const binLength = b.offset;
  const bin = b.bytes.slice(0, binLength);

  const materials: Record<string, unknown>[] = [
    {
      name: 'texred',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [1, 1, 1, 1] },
    },
    {
      name: 'darkred',
      pbrMetallicRoughness: { baseColorFactor: [0.5, 0, 0, 1] },
    },
    {
      name: 'cutout',
      pbrMetallicRoughness: { baseColorTexture: { index: 1 } },
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
    },
  ];
  const samplers = [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }];

  // GLB: images embedded as bufferViews after the attribute bin.
  const glbBuffer = new Uint8Array(binLength + red.length + mask.length + 8);
  glbBuffer.set(bin, 0);
  let imgOff = Math.ceil(binLength / 4) * 4;
  const redViewOffset = imgOff;
  glbBuffer.set(red, imgOff);
  imgOff += red.length;
  imgOff = Math.ceil(imgOff / 4) * 4;
  const maskViewOffset = imgOff;
  glbBuffer.set(mask, imgOff);
  const totalBin = imgOff + mask.length;

  const glbViews = [
    ...b.views,
    { buffer: 0, byteOffset: redViewOffset, byteLength: red.length },
    { buffer: 0, byteOffset: maskViewOffset, byteLength: mask.length },
  ];
  const glbJson: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    textures: [{ source: 0 }, { source: 1 }],
    images: [
      { bufferView: b.views.length, mimeType: 'image/png' },
      { bufferView: b.views.length + 1, mimeType: 'image/png' },
    ],
    samplers,
    buffers: [{ byteLength: totalBin }],
    bufferViews: glbViews,
    accessors: b.accessors,
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(glbJson));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (totalBin % 4)) % 4;
  const glbTotal = 12 + 8 + jsonBytes.length + jsonPad + 8 + totalBin + binPad;
  const glb = new Uint8Array(glbTotal);
  const gdv = new DataView(glb.buffer);
  gdv.setUint32(0, 0x46546c67, true);
  gdv.setUint32(4, 2, true);
  gdv.setUint32(8, glbTotal, true);
  gdv.setUint32(12, jsonBytes.length + jsonPad, true);
  gdv.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) glb[20 + jsonBytes.length + i] = 0x20;
  const binChunkOff = 20 + jsonBytes.length + jsonPad;
  gdv.setUint32(binChunkOff, totalBin + binPad, true);
  gdv.setUint32(binChunkOff + 4, 0x004e4942, true); // 'BIN'
  glb.set(glbBuffer, binChunkOff + 8);

  // .gltf: same attributes in an external .bin; images as external PNGs.
  const gltfJson: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    textures: [{ source: 0 }, { source: 1 }],
    images: [{ uri: 'red.png' }, { uri: 'mask.png' }],
    samplers,
    buffers: [{ byteLength: binLength, uri: 'model.bin' }],
    bufferViews: b.views,
    accessors: b.accessors,
  };

  return {
    glb: new File([glb], 'quads.glb', { type: 'model/gltf-binary' }),
    gltfSet: [
      new File([JSON.stringify(gltfJson)], 'quads.gltf', { type: 'model/gltf+json' }),
      new File([bin], 'model.bin', { type: 'application/octet-stream' }),
      new File([red], 'red.png', { type: 'image/png' }),
      new File([mask], 'mask.png', { type: 'image/png' }),
    ],
  };
}

/** UV sphere with smooth normals, untextured white material. */
function buildSphereGltf(): File {
  const b = sb();
  const rings = 12;
  const segments = 16;
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const theta = (i / rings) * Math.PI;
    for (let j = 0; j <= segments; j++) {
      const phi = (j / segments) * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(0.45 * x, 0.45 * y, 0.45 * z);
      normals.push(x, y, z);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const bb = (i + 1) * (segments + 1) + j;
      indices.push(a, bb, a + 1, bb, bb + 1, a + 1);
    }
  }
  const prim = {
    attributes: {
      POSITION: acc(b, new Float32Array(positions), 5126, 'VEC3', true),
      NORMAL: acc(b, new Float32Array(normals), 5126, 'VEC3', false),
    },
    indices: acc(b, new Uint16Array(indices), 5123, 'SCALAR', false),
    material: 0,
  };
  const json: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'sphere' }],
    meshes: [{ primitives: [prim], name: 'sphere' }],
    materials: [{ name: 'white', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    buffers: [
      {
        byteLength: b.offset,
        uri: `data:application/octet-stream;base64,${btoa(
          String.fromCharCode(...b.bytes.slice(0, b.offset)),
        )}`,
      },
    ],
    bufferViews: b.views,
    accessors: b.accessors,
  };
  return new File([JSON.stringify(json)], 'sphere.gltf', { type: 'model/gltf+json' });
}

// ---------- pixel sampling helpers ----------

function worldToPixel(
  result: BakeResult,
  world: [number, number, number],
  camera: OrthographicCamera,
): [number, number] {
  const v = new Vector3(...world).project(camera);
  return [
    Math.floor((v.x * 0.5 + 0.5) * result.width),
    Math.floor((1 - (v.y * 0.5 + 0.5)) * result.height),
  ];
}

// GL readback is bottom-up. Coverage derives from g-buffer emptiness
// (zero-length normal = background) — there is no separate coverage pass.
function sample(
  result: BakeResult,
  px: number,
  py: number,
): { coverage: number; nx: number; ny: number; nz: number; depth: number } {
  const i = ((result.height - 1 - py) * result.width + px) * 4;
  const g = result.gbuffer;
  return {
    coverage: Math.min(1, Math.hypot(g[i], g[i + 1], g[i + 2])),
    nx: g[i],
    ny: g[i + 1],
    nz: g[i + 2],
    depth: g[i + 3],
  };
}

function frameFor(result: BakeResult): OrthographicCamera {
  return frameIsoBox(result.size, result.pxPerUnit, PAD_PX).camera;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- path-tracer spike (ortho camera + transparent background) ----------

/** Render to a WebGL target, don't touch the DOM, one full sample per call. */
function spikePathTracer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: OrthographicCamera,
): WebGLPathTracer {
  const pt = new WebGLPathTracer(renderer);
  pt.renderToCanvas = false;
  pt.rasterizeScene = false;
  pt.renderDelay = 0;
  pt.minSamples = 1;
  pt.bounces = 3;
  pt.renderScale = 1;
  pt.tiles.set(1, 1);
  pt.setScene(scene, camera);
  return pt;
}

async function accumulate(pt: WebGLPathTracer, samples: number): Promise<void> {
  const t0 = performance.now();
  while (pt.samples < samples && performance.now() - t0 < 60_000) {
    pt.renderSample();
    // Yield so the async shader compile can resolve before sampling continues.
    await new Promise((r) => setTimeout(r, 0));
  }
  if (pt.samples < samples) {
    throw new Error(`path tracer stalled at ${pt.samples}/${samples} samples`);
  }
}

function readTarget(renderer: WebGLRenderer, target: WebGLRenderTarget): Float32Array {
  const px = new Float32Array(target.width * target.height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, px);
  return px;
}

function pixelAt(px: Float32Array, w: number, x: number, yBottomUp: number): [number, number, number, number] {
  const i = (yBottomUp * w + x) * 4;
  return [px[i], px[i + 1], px[i + 2], px[i + 3]];
}

async function runPtSpike(): Promise<void> {
  const PRIM = 128;
  const frame = frameIsoBox([1, 1, 1], PRIM, PAD_PX);
  const w = frame.width;
  const h = frame.height;

  const renderer = new WebGLRenderer({ antialias: false, stencil: false });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const mesh = new Mesh(getCube().geometry, new MeshStandardMaterial({ color: 0x4f9e5c }));
  mesh.position.set(0.5, 0.5, 0.5);
  scene.add(mesh);
  scene.background = null;
  const env = new GradientEquirectTexture(16);
  env.topColor.set(0xffffff);
  env.bottomColor.set(0x202020);
  env.update();
  scene.environment = env;
  scene.environmentIntensity = 1;

  log('test: PT spike — ortho camera + transparent background');
  const pt = spikePathTracer(renderer, scene, frame.camera);
  ok(pt.target.width === w && pt.target.height === h,
    `PT target is the sprite rect ${w}x${h} (got ${pt.target.width}x${pt.target.height})`);

  await accumulate(pt, 32);
  const read32 = readTarget(renderer, pt.target);
  await accumulate(pt, 128);
  const read128 = readTarget(renderer, pt.target);

  // Determinism: reset and re-accumulate to 32 must reproduce read32.
  pt.reset();
  await accumulate(pt, 32);
  const read32again = readTarget(renderer, pt.target);
  let maxDelta = 0;
  for (let i = 0; i < read32.length; i++) {
    maxDelta = Math.max(maxDelta, Math.abs(read32[i] - read32again[i]));
  }
  ok(maxDelta === 0, `deterministic re-accumulation (max delta ${maxDelta})`);

  // Background: corners alpha 0 (GL readback is bottom-up).
  const corners: [number, number, number, number][] = [
    pixelAt(read128, w, 0, 0),
    pixelAt(read128, w, w - 1, 0),
    pixelAt(read128, w, 0, h - 1),
    pixelAt(read128, w, w - 1, h - 1),
  ];
  ok(corners.every(([r, g, b, a]) => a === 0 && r === 0 && g === 0 && b === 0),
    `corners fully transparent black (got ${JSON.stringify(corners[0])})`);

  // Object: center pixel opaque and lit.
  const center = pixelAt(read128, w, w >> 1, h >> 1);
  ok(center[3] > 0.99, `center pixel opaque (alpha ${center[3].toFixed(3)})`);
  ok(center[0] + center[1] + center[2] > 0.1,
    `center pixel lit (rgb sum ${sum(center).toFixed(3)})`);

  // AA: partial-coverage pixels exist on silhouettes and convergence improves.
  const partial = (px: Float32Array): number => {
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = pixelAt(px, w, x, y)[3];
        if (a > 0.02 && a < 0.98) n++;
      }
    }
    return n;
  };
  ok(partial(read128) > 5, `soft AA edge pixels present (${partial(read128)})`);

  // Convergence: 32 -> 128 samples moves the alpha field.
  let alphaDiff = 0;
  for (let i = 3; i < read32.length; i += 4) {
    alphaDiff += Math.abs(read32[i] - read128[i]);
  }
  alphaDiff /= w * h;
  ok(alphaDiff > 0.0005 && alphaDiff < 0.05,
    `32->128 samples refines edges (mean alpha delta ${alphaDiff.toFixed(4)})`);

  // Alignment with the raster bake: same rect, matching coverage footprint.
  const raster = bakePrimitive(getCube(), PRIM);
  ok(raster.width === w && raster.height === h, 'raster bake shares the sprite rect');
  let massPt = 0;
  let cxPt = 0;
  let cyPt = 0;
  let massRa = 0;
  let cxRa = 0;
  let cyRa = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = pixelAt(read128, w, x, y)[3];
      massPt += a;
      cxPt += x * a;
      cyPt += y * a;
      const g = pixelAt(raster.gbuffer, w, x, y);
      const ra = Math.min(1, Math.hypot(g[0], g[1], g[2]));
      massRa += ra;
      cxRa += x * ra;
      cyRa += y * ra;
    }
  }
  const relMass = Math.abs(massPt - massRa) / massRa;
  const centroidPx = Math.hypot(cxPt / massPt - cxRa / massRa, cyPt / massPt - cyRa / massRa);
  ok(relMass < 0.02, `coverage mass within 2% of raster (got ${(relMass * 100).toFixed(2)}%)`);
  ok(centroidPx < 1.5, `coverage centroid within 1.5 px of raster (got ${centroidPx.toFixed(2)} px)`);

  pt.dispose();
  renderer.dispose();
}

/**
 * Slot alignment + normal semantics: the e slot turns the model +90° about
 * the vertical axis (camera fixed), so the path-traced render of the
 * rotated model must share the slot's sprite rect and coverage footprint
 * with the slot's raster g-buffer, and the stored normals must be the
 * ROTATED model's world normals — not the unrotated model's (which would
 * mean the camera was rotated instead).
 */
async function runSlotAlignmentSpike(): Promise<void> {
  const PRIM = 128;
  const AZIMUTH = 135; // the e slot
  const yaw = AZIMUTH - 45;
  const prim = getSlab(); // [2, 0.5, 1] — asymmetric, so rotation is visible
  const boxSize = yawRotatedBoxSize(prim.size, yaw);
  const frame = frameIsoBox(boxSize, PRIM, PAD_PX); // fixed world camera
  const w = frame.width;
  const h = frame.height;

  const renderer = new WebGLRenderer({ antialias: false, stencil: false });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const mesh = new Mesh(prim.geometry, new MeshStandardMaterial({ color: 0x4f9e5c }));
  mesh.position.set(prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2);
  applySlotModelRotation(mesh, prim.size, yaw);
  scene.add(mesh);
  scene.background = null;
  const env = new GradientEquirectTexture(16);
  env.topColor.set(0xffffff);
  env.bottomColor.set(0x202020);
  env.update();
  scene.environment = env;
  scene.environmentIntensity = 1;

  log('test: PT slot alignment + rotated-normal semantics (e slot)');
  const pt = spikePathTracer(renderer, scene, frame.camera);
  await accumulate(pt, 32);
  const read = readTarget(renderer, pt.target);

  const raster = bakePrimitive(prim, PRIM, AZIMUTH);
  ok(raster.camera.azimuthDeg === AZIMUTH && raster.width === w && raster.height === h,
    `raster e-slot bake shares the slot rect ${w}x${h}`);
  let massPt = 0;
  let cxPt = 0;
  let cyPt = 0;
  let massRa = 0;
  let cxRa = 0;
  let cyRa = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = pixelAt(read, w, x, y)[3];
      massPt += a;
      cxPt += x * a;
      cyPt += y * a;
      const g = pixelAt(raster.gbuffer, w, x, y);
      const ra = Math.min(1, Math.hypot(g[0], g[1], g[2]));
      massRa += ra;
      cxRa += x * ra;
      cyRa += y * ra;
    }
  }
  const relMass = Math.abs(massPt - massRa) / massRa;
  const centroidPx = Math.hypot(cxPt / massPt - cxRa / massRa, cyPt / massPt - cyRa / massRa);
  ok(relMass < 0.02, `e-slot coverage mass within 2% of raster (got ${(relMass * 100).toFixed(2)}%)`);
  ok(centroidPx < 1.5, `e-slot coverage centroid within 1.5 px of raster (got ${centroidPx.toFixed(2)} px)`);

  // Normal semantics: the slab's original +z face must store the world +x
  // normal, and the original -x face the world +z normal — the rotated
  // model's frame. A stored (-1,0,0) would mean the camera was rotated
  // instead of the model.
  const seen = new Set<string>();
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const s = sample(raster, x, y);
      if (s.coverage > 0.999) {
        seen.add([s.nx, s.ny, s.nz].map((v) => Math.round(v)).join(','));
      }
    }
  }
  ok(seen.has('1,0,0'), `original +z face stores world +x normal (got [${[...seen].join(' ')}])`);
  ok(seen.has('0,0,1'), 'original -x face stores world +z normal');
  ok(seen.has('0,1,0'), 'top face keeps world +y normal');
  ok(!seen.has('-1,0,0'), 'no unrotated -x normal remains — the model rotated, not the camera');

  pt.dispose();
  renderer.dispose();
}

function sum(v: [number, number, number, number]): number {
  return v[0] + v[1] + v[2];
}

// ---------- tests ----------

/**
 * Mesh-in-scene spike: the runtime compositor with a baked-cube sprite and
 * a skinned, animated CesiumMan interpenetrating it — the golden hash for
 * the pre/post-change regression diff of the dynamic-mesh path. Fixed
 * camera, light, placements and a fixed animation time keep it
 * deterministic.
 */
async function runMeshSpike(): Promise<void> {
  log('test: mesh-in-scene golden hash (runtime compositor)');
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const asset = await parseCharacterAsset(await (await fetch(cesiumManUrl)).arrayBuffer());

  // One baked-cube sprite with a neutral "render pass" (the compositor
  // only shades it; the g-buffer carries the real bake data).
  const cube = bakePrimitive(getCube());
  const w = cube.width;
  const h = cube.height;
  const layer: SpriteLayer = {
    id: 'cube',
    pxPerUnit: cube.pxPerUnit,
    width: w,
    height: h,
    originPx: cube.originPx,
    gbuffer: bakeFloatToHalf(cube.gbuffer, w, h),
    render: new Uint8Array(w * h * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 200)),
  };
  const set = layersToSet([layer]);
  const renderer = new WorldRenderer(canvas, set.renderLayers, set.gbufferLayers, set.maxW, set.maxH);

  // Fixed world-image frame (arbitrary but deterministic).
  const PPU = RUNTIME_PPU;
  const ORIGIN_X = 300;
  const ORIGIN_Y = 500;
  renderer.setMeshFrame(ORIGIN_X, ORIGIN_Y, PPU);
  renderer.setLight({ dir: [0.5, 0.7071, 0.5], key: [1.2, 1.1, 0.9], ambient: [0.3, 0.3, 0.35] });

  const toPx = (x: number, z: number, y: number): [number, number] => {
    const [u, v] = groundToScreen(x, z);
    return [ORIGIN_X + u * PPU, ORIGIN_Y - (v + y * SCREEN_UP[1]) * PPU];
  };

  const spriteScale = PPU / cube.pxPerUnit;
  const [cx, cy] = toPx(2, 2, 0);
  const instances = new Float32Array(8);
  instances[0] = cx - cube.originPx[0] * spriteScale;
  instances[1] = cy - cube.originPx[1] * spriteScale;
  instances[2] = 0;
  instances[3] = VIEW_DIR[0] * 2 + VIEW_DIR[1] * 0 + VIEW_DIR[2] * 2;
  instances[4] = w * spriteScale;
  instances[5] = h * spriteScale;
  instances[6] = w;
  instances[7] = h;

  // The character stands inside the cube's cell at a fixed animation time.
  const player = new CharacterPlayer(asset);
  player.update(1.5);
  player.skinInto(player.skinnedPositions(), player.skinnedNormals());
  const off = asset.worldOffset;
  const meshDraws: MeshDraw[] = [
    {
      positions: player.skinnedPositions(),
      normals: player.skinnedNormals(),
      origin: [2.1 + off[0], 0 + off[1], 2.2 + off[2]],
      yawMat: meshYawMat(0.4),
    },
  ];

  const px = new Uint8Array(canvas.width * canvas.height * 4);
  const renderFrame = (): void => {
    renderer.render(instances, 1, null, null, { zoom: 1, panX: 0, panY: 0 }, meshDraws);
    renderer.readPixels(px);
  };
  renderFrame();
  const hash1 = await sha256(px);

  // Determinism: an immediate re-render must produce the identical frame.
  renderFrame();
  const hash2 = await sha256(px);
  ok(hash1 === hash2, `render is deterministic (${hash1.slice(0, 16)}…)`);
  ok(hash1 !== await sha256(new Uint8Array(px.length)), 'frame has content');

  // The mesh participates: dropping its palette (bind pose) must change
  // the frame; so must depth-only moves (the offset places the body
  // relative to the cube).
  player.update(0.9);
  player.skinInto(player.skinnedPositions(), player.skinnedNormals());
  meshDraws[0] = { ...meshDraws[0], positions: player.skinnedPositions(), normals: player.skinnedNormals() };
  renderFrame();
  const hash3 = await sha256(px);
  ok(hash3 !== hash1, `animation time changes the frame (${hash3.slice(0, 16)}…)`);

  meshDraws[0] = { ...meshDraws[0], origin: [meshDraws[0].origin[0], meshDraws[0].origin[1] + 0.9, meshDraws[0].origin[2]] };
  renderFrame();
  const hash4 = await sha256(px);
  ok(hash4 !== hash3, `raising the character changes the frame (${hash4.slice(0, 16)}…)`);

  log(`  mesh-in-scene golden hash: sha256 ${hash1}`);
  log(`  (t+0.9s: ${hash3.slice(0, 16)}… / raised: ${hash4.slice(0, 16)}…)`);
  renderer.dispose();
}

async function main(): Promise<void> {
  const { glb, gltfSet } = await buildQuadModel([
    { x0: 0, material: 0, name: 'texred' },
    { x0: 1, material: 1, name: 'darkred' },
    { x0: 2, material: 2, name: 'cutout' },
  ]);

  // 1. Coverage + mask from the .glb path (color ships via the render pass).
  let glbResult: BakeResult | null = null;
  {
    log('test: .glb coverage + alpha-mask');
    const src = await loadGltf([glb]);
    ok(src.groups.length === 3, `three material groups (got ${src.groups.length})`);
    ok(approx(src.extent[0], 3, 1e-4) && approx(src.extent[1], 1, 1e-4), `extent [3,1,0] (got [${src.extent}])`);
    glbResult = bakePrimitive(src.primitive(1));
    const cam = frameFor(glbResult);
    const at = (w: [number, number, number]) => {
      const [px, py] = worldToPixel(glbResult!, w, cam);
      return sample(glbResult!, px, py);
    };
    const a = at([0.5, 0.5, 0]);
    ok(a.coverage > 0.95, `tex-red quad bakes covered (got cov=${a.coverage.toFixed(2)})`);
    const f = at([1.5, 0.5, 0]);
    ok(f.coverage > 0.95, `factor quad bakes covered (got cov=${f.coverage.toFixed(2)})`);
    const cl = at([2.25, 0.5, 0]);
    ok(cl.coverage > 0.95, `mask kept half bakes covered (got cov=${cl.coverage.toFixed(2)})`);
    const cr = at([2.75, 0.5, 0]);
    ok(cr.coverage < 0.05 && cr.nx === 0 && cr.ny === 0 && cr.nz === 0 && cr.depth === 0,
      `masked-out half is empty in the g-buffer (cov=${cr.coverage.toFixed(2)})`);
  }

  // 2. Same model via .gltf + .bin + textures bakes byte-identically.
  {
    log('test: .gltf file set bakes identically to .glb');
    const src = await loadGltf(gltfSet);
    ok(src.label === 'quads.gltf', `label from .gltf (got ${src.label})`);
    const gltfResult = bakePrimitive(src.primitive(1));
    ok(gltfResult.width === glbResult!.width && gltfResult.height === glbResult!.height, 'same sprite size');
    let identical = true;
    for (let i = 0; i < gltfResult.gbuffer.length; i++) {
      if (gltfResult.gbuffer[i] !== glbResult!.gbuffer[i]) {
        identical = false;
        break;
      }
    }
    ok(identical, 'g-buffer pass byte-identical between containers');
  }

  // 3. Bundle round-trip through the runtime parser, incl. scaled manifest.
  {
    log('test: bundle round-trip via parseBake()');
    const src = await loadGltf([glb]);
    const scaled = src.primitive(2);
    const result = bakePrimitive(scaled);
    ok(approx(result.size[0], 6, 1e-3) && approx(result.size[1], 2, 1e-3), `scale-2 size [6,2,0] (got [${result.size}])`);
    const bytes = await buildBundle(result);
    const parsed = parseBake(bytes.buffer as ArrayBuffer);
    ok(parsed.manifest.format === 'isoinfinity-bake/6', `manifest format (got ${parsed.manifest.format})`);
    ok(parsed.render === null, 'no optional passes in a raster-only bundle');
    ok(approx(parsed.manifest.cube.size[0], 6, 1e-3) && approx(parsed.manifest.cube.size[1], 2, 1e-3),
      `manifest cube.size records scaled box (got [${parsed.manifest.cube.size}])`);
    ok(parsed.gbuffer.size > 0, 'g-buffer entry present');
    ok(parsed.views.length === 0, 'raster-only bundle has no extra views');
    ok((parsed.manifest.views ?? []).length === 1 &&
        parsed.manifest.views![0].slot === 'n' &&
        approx(parsed.manifest.views![0].azimuthDeg, 45, 1e-6),
      `view table records only north (got ${JSON.stringify(parsed.manifest.views)})`);
    const passNames = Object.keys(parsed.manifest.passes);
    ok(!passNames.includes('albedo') && !passNames.includes('ao'),
      `manifest declares no albedo/ao passes (got [${passNames.join(', ')}])`);
  }

  // 3c. Multi-view bundles: per-view entries, azimuths, and removal.
  {
    log('test: /6 multi-view bundle round trip + remove-view omission');
    const cube = getCube();
    const north = bakePrimitive(cube);
    const east = bakePrimitive(cube, undefined, 135);
    ok(north.camera.azimuthDeg === 45 && east.camera.azimuthDeg === 135,
      `slots carry their camera azimuths (n=${north.camera.azimuthDeg}, e=${east.camera.azimuthDeg})`);
    const bytes = await buildBundle(north, undefined, undefined, [
      { slot: 'e', result: east },
    ]);
    const manifest = JSON.parse(new TextDecoder().decode(
      (await import('three/examples/jsm/libs/fflate.module.js')).unzipSync(bytes)['manifest.json'],
    )) as Record<string, unknown>;
    const views = manifest.views as { slot: string; azimuthDeg: number }[];
    ok(views.length === 2 && views[0].slot === 'n' && views[1].slot === 'e' &&
        approx(views[1].azimuthDeg, 135, 1e-6),
      `manifest view table lists n + e with azimuths (got ${JSON.stringify(views)})`);

    const parsed = parseBake(bytes.buffer as ArrayBuffer);
    ok(parsed.views.length === 1 && parsed.views[0].slot === 'e', 'parser exposes the e view blob');
    ok(parsed.views[0].gbuffer.size > 0, 'e g-buffer entry present');
    ok(approx(parsed.views[0].width, east.width, 0) && approx(parsed.views[0].height, east.height, 0),
      'e view keeps its sprite rect');
    // Slot framing is per slot: the cube projects to a taller rect from the
    // rotated camera in general — here assert both slots frame their own
    // padded box rect.
    ok(east.width > PAD_PX * 2 && east.height > PAD_PX * 2, 'e view bakes a real rect');

    // Remove the e view: the next save omits it entirely.
    const bytesAfterRemove = await buildBundle(north);
    const parsedAfterRemove = parseBake(bytesAfterRemove.buffer as ArrayBuffer);
    ok(parsedAfterRemove.views.length === 0 &&
        (parsedAfterRemove.manifest.views ?? []).length === 1,
      'removed view is omitted from the next save');
  }

  // 3d. Open-path decode: a saved /6 bundle restores both views.
  {
    log('test: decodeBundle restores extra views');
    const cube = getCube();
    const north = bakePrimitive(cube);
    const east = bakePrimitive(cube, undefined, 135);
    const bytes = await buildBundle(north, undefined, undefined, [
      { slot: 'e', result: east },
    ]);
    const decoded = await decodeBundle(bytes.buffer as ArrayBuffer);
    ok(decoded.extraViews.length === 1 && decoded.extraViews[0].slot === 'e',
      `decoded one extra view (got ${JSON.stringify(decoded.extraViews.map((v) => v.slot))})`);
    const ev = decoded.extraViews[0];
    ok(approx(ev.result.camera.azimuthDeg, 135, 1e-6), `e view restores its azimuth (got ${ev.result.camera.azimuthDeg})`);
    ok(ev.result.width === east.width && ev.result.height === east.height,
      'e view restores its sprite rect');
    ok(ev.result.gbuffer.length === east.width * east.height * 4, 'e g-buffer decodes to the full rect');
  }

  // 3b. Hand-built fixtures: legacy passes ignored, minimal v5, unknown format.
  {
    log('test: parseBake legacy/minimal fixtures + unknown format rejection');
    const pngRed2x2 = await pngBytes(SOLID_RED);
    const makeZip = (manifest: Record<string, unknown>, extra: Record<string, Uint8Array> = {}): Uint8Array =>
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'x-albedo.png': pngRed2x2,
        'x-gbuffer.exr': new Uint8Array(4),
        ...extra,
      });

    const base = (format: string, passes: Record<string, unknown>): Record<string, unknown> => ({
      format,
      id: 'x',
      pxPerUnit: 128,
      sprite: { width: 2, height: 2, originPx: [0, 0] },
      passes,
    });
    const rasterPasses = {
      albedo: { file: 'x-albedo.png', encoding: 'png-r8-srgb', channels: 'rgb=albedo a=coverage' },
      gbuffer: { file: 'x-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
    };
    // New-shape manifest: g-buffer only.
    const gbufferPasses = {
      gbuffer: rasterPasses.gbuffer,
    };

    const minimal = parseBake(makeZip(base('isoinfinity-bake/5', gbufferPasses)).buffer as ArrayBuffer);
    ok(minimal.render === null, 'minimal g-buffer-only bundle parses');
    ok(minimal.views.length === 0, '/5 bundle reads as single-view (no extra views)');

    // Legacy manifests still recording albedo/ao entries parse; the parser
    // resolves only g-buffer (+ render) and ignores the rest.
    const legacy = parseBake(makeZip(base('isoinfinity-bake/5', rasterPasses)).buffer as ArrayBuffer);
    ok(legacy.render === null, 'legacy manifest with an albedo entry parses (albedo ignored)');

    const v3 = parseBake(makeZip(base('isoinfinity-bake/3', rasterPasses)).buffer as ArrayBuffer);
    ok(v3.render === null, 'v3 bundle parses without optional passes');

    const v4Passes = {
      ...rasterPasses,
      render: { file: 'x-render.png', encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' },
      ao: { file: 'x-ao.png', encoding: 'png-r8-linear', channels: 'rgb=ambient-occlusion a=coverage' },
    };
    const v4 = parseBake(
      makeZip(base('isoinfinity-bake/4', v4Passes), {
        'x-render.png': pngRed2x2,
        'x-ao.png': pngRed2x2,
      }).buffer as ArrayBuffer,
    );
    ok(v4.render !== null, 'v4 bundle exposes the render pass blob when present');

    const broken = base('isoinfinity-bake/7', gbufferPasses);
    let threw = '';
    try {
      parseBake(makeZip(broken).buffer as ArrayBuffer);
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }
    ok(threw.includes('isoinfinity-bake/7'), `unknown format rejected by name (got "${threw}")`);
  }

  // 4. Smooth curved glTF geometry bakes unit-length varying normals.
  {
    log('test: curved glTF normals');
    const src = await loadGltf([buildSphereGltf()]);
    const result = bakePrimitive(src.primitive(1));
    let rendered = 0;
    let nonUnit = 0;
    let dirtyEmpty = 0;
    let minNx = Infinity;
    let maxNx = -Infinity;
    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        const s = sample(result, x, y);
        const len = Math.hypot(s.nx, s.ny, s.nz);
        if (len > 0.5) {
          rendered++;
          if (Math.abs(len - 1) > 0.02) nonUnit++;
          minNx = Math.min(minNx, s.nx);
          maxNx = Math.max(maxNx, s.nx);
        } else if (s.nx !== 0 || s.ny !== 0 || s.nz !== 0 || s.depth !== 0) {
          dirtyEmpty++;
        }
      }
    }
    ok(rendered > 1000, `sphere rendered (got ${rendered} px)`);
    ok(nonUnit === 0, `all rendered normals unit length (got ${nonUnit} off)`);
    ok(maxNx - minNx > 0.5, `normals vary smoothly across the surface (x range ${(maxNx - minNx).toFixed(2)})`);
    ok(dirtyEmpty === 0, `empty pixels all-zero (got ${dirtyEmpty} dirty)`);
  }

  // 4b. Box-frame projection: pixel-space overlay geometry for the viewport.
  {
    log('test: box-frame projection');
    const size: Vec3 = [2, 1, 3];
    const PPU = 64;
    const proj = projectBoxFrame(size, PPU, PAD_PX);
    const frame = frameIsoBox(size, PPU, PAD_PX);
    ok(
      proj.width === frame.width && proj.height === frame.height,
      'projection rect equals the padded frame rect',
    );
    ok(proj.edges.length === 12, `12 box edges (got ${proj.edges.length})`);
    ok(
      proj.origin[0] === frame.originPx[0] && proj.origin[1] === frame.originPx[1],
      'origin projects to originPx',
    );
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [a, b] of proj.edges) {
      for (const p of [a, b]) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
    }
    ok(
      approx(minX, PAD_PX, 0.51) &&
        approx(minY, PAD_PX, 0.51) &&
        approx(maxX, proj.width - PAD_PX, 0.51) &&
        approx(maxY, proj.height - PAD_PX, 0.51),
      `corners sit PAD_PX inside the sprite rect (got [${minX.toFixed(2)}, ${minY.toFixed(2)}, ${maxX.toFixed(2)}, ${maxY.toFixed(2)}])`,
    );
    const segKey = (s: [number, number][]): string => s.map((p) => p.join(',')).join('|');
    const edgeKeys = new Set(proj.edges.map(segKey));
    ok(
      edgeKeys.has(segKey(proj.axes.x)) &&
        edgeKeys.has(segKey(proj.axes.y)) &&
        edgeKeys.has(segKey(proj.axes.z)),
      'axes are origin-adjacent box edges',
    );
    const cube = bakePrimitive(getCube());
    const cubeProj = projectBoxFrame(cube.size, cube.pxPerUnit, PAD_PX);
    ok(
      cubeProj.width === cube.width && cubeProj.height === cube.height,
      'projection matches the cube bake rect',
    );
  }

  // 4c. Clip-volume framing: the projection's depth planes derive from the
  // framed box, so no view slot clips geometry the lateral framing includes
  // (a deep box here would vanish past the old fixed near/far slab).
  {
    log('test: clip-volume framing');
    const size: Vec3 = [8, 4, 8];
    const PPU = 32;
    for (const slot of VIEW_SLOTS) {
      const azimuthDeg = slotAzimuthDeg(slot);
      const frame = frameIsoBox(size, PPU, PAD_PX, azimuthDeg);
      const cam = frame.camera;
      ok(
        cam.near > 0 && cam.far > cam.near,
        `${slot}: 0 < near (${cam.near.toFixed(4)}) < far (${cam.far.toFixed(4)})`,
      );
      let minInner = Infinity;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        const corner = new Vector3(
          (i & 1) * size[0],
          ((i >> 1) & 1) * size[1],
          ((i >> 2) & 1) * size[2],
        );
        corner.applyMatrix4(cam.matrixWorldInverse);
        minInner = Math.min(minInner, cam.far + corner.z, -cam.near - corner.z);
        const px = corner.project(cam);
        const x = (px.x * 0.5 + 0.5) * frame.width;
        const y = (1 - (px.y * 0.5 + 0.5)) * frame.height;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      ok(
        minInner > 0,
        `${slot}: all 8 corners strictly inside the clip slab (margin ${minInner.toFixed(4)})`,
      );
      ok(
        approx(minX, PAD_PX, 0.51) &&
          approx(minY, PAD_PX, 0.51) &&
          approx(maxX, frame.width - PAD_PX, 0.51) &&
          approx(maxY, frame.height - PAD_PX, 0.51),
        `${slot}: lateral framing unchanged — corners sit PAD_PX inside the ${frame.width}x${frame.height} rect`,
      );
    }
    // A box that fits the old parked camera keeps its distance exactly.
    const small = frameIsoBox([2, 1, 3], PPU, PAD_PX);
    const deep = frameIsoBox(size, PPU, PAD_PX);
    const smallDist = small.camera.position.distanceTo(new Vector3(1, 0.5, 1.5));
    ok(
      approx(smallDist, 4, 1e-9),
      `small box keeps the parked camera distance (got ${smallDist.toFixed(6)})`,
    );
    const deepDist = deep.camera.position.distanceTo(new Vector3(4, 2, 4));
    ok(
      deepDist > 4,
      `deep box backs the camera off (distance ${deepDist.toFixed(4)})`,
    );
  }

  // 5. Primitive regression hashes (compare against pre-change bundles).
  {
    log('test: primitive bundle hashes');
    const factories: Record<string, () => ReturnType<typeof getSphere>> = {
      sphere: getSphere,
      donut: getDonut,
      cube: getCube,
      cylinder: getCylinder,
      capsule: getCapsule,
      plane: getPlane,
      slab: getSlab,
    };
    for (const [name, factory] of Object.entries(factories)) {
      const bytes = await buildBundle(bakePrimitive(factory()));
      log(`  ${name}: sha256 ${await sha256(bytes)}`);
    }
  }

  // 6. Path-tracer spike: ortho + transparent background + AA + determinism.
  await runPtSpike();

  // 6b. Path-tracer alignment at a non-default slot camera (e).
  await runSlotAlignmentSpike();

  // 7. Dynamic-mesh spike: skinned character among sprites.
  await runMeshSpike();

  log(`\n${passed} passed, ${failed} failed`, failed === 0 ? 'pass' : 'fail');
}

void main();
