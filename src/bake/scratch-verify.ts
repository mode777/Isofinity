/**
 * Scratch browser verification for the bake-glb-assets change (GPU-side
 * checks that cannot run in Node). Open /scratch-verify.html on the dev
 * server. Not part of the production build.
 */
import { bakePrimitive, PAD_PX, type BakeResult } from './bake.js';
import { buildBundle, parseBake } from './bundle.js';
import { frameIsoBox } from './iso.js';
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
import { OrthographicCamera, Vector3 } from 'three';

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

// GL readback is bottom-up.
function sample(
  result: BakeResult,
  px: number,
  py: number,
): { r: number; g: number; b: number; coverage: number; nx: number; ny: number; nz: number; depth: number } {
  const i = ((result.height - 1 - py) * result.width + px) * 4;
  const a = result.albedo;
  const g = result.gbuffer;
  return {
    r: a[i],
    g: a[i + 1],
    b: a[i + 2],
    coverage: a[i + 3],
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

function countPixels(result: BakeResult, pred: (s: ReturnType<typeof sample>) => boolean): number {
  let n = 0;
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      if (pred(sample(result, x, y))) n++;
    }
  }
  return n;
}

// ---------- tests ----------

async function main(): Promise<void> {
  const { glb, gltfSet } = await buildQuadModel([
    { x0: 0, material: 0, name: 'texred' },
    { x0: 1, material: 1, name: 'darkred' },
    { x0: 2, material: 2, name: 'cutout' },
  ]);

  // 1. Textured + factor albedo from the .glb path.
  let glbResult: BakeResult | null = null;
  {
    log('test: .glb textured albedo + base-color factor');
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
    ok(a.r > 0.95 && a.g < 0.05 && a.b < 0.05 && a.coverage > 0.95,
      `tex-red quad bakes red (got rgb=${[a.r, a.g, a.b].map((v) => v.toFixed(2))})`);
    const f = at([1.5, 0.5, 0]);
    const expect = 1.055 * Math.pow(0.5, 1 / 2.4) - 0.055;
    ok(Math.abs(f.r - expect) < 0.03 && f.g < 0.05 && f.b < 0.05,
      `linear factor 0.5 encodes to sRGB ~${expect.toFixed(3)} (got ${f.r.toFixed(3)})`);
    const cl = at([2.25, 0.5, 0]);
    ok(cl.r > 0.95 && cl.coverage > 0.95, `mask kept half bakes red (got cov=${cl.coverage.toFixed(2)})`);
    const cr = at([2.75, 0.5, 0]);
    ok(cr.coverage < 0.05 && cr.nx === 0 && cr.ny === 0 && cr.nz === 0 && cr.depth === 0,
      `masked-out half is empty in both passes (cov=${cr.coverage.toFixed(2)})`);
    const green = countPixels(glbResult, (s) => s.coverage > 0.5 && s.g > 0.5 && s.r < 0.3);
    ok(green === 0, `no green (alpha-cleared) pixels baked (got ${green})`);
  }

  // 2. Same model via .gltf + .bin + textures bakes byte-identically.
  {
    log('test: .gltf file set bakes identically to .glb');
    const src = await loadGltf(gltfSet);
    ok(src.label === 'quads.gltf', `label from .gltf (got ${src.label})`);
    const gltfResult = bakePrimitive(src.primitive(1));
    ok(gltfResult.width === glbResult!.width && gltfResult.height === glbResult!.height, 'same sprite size');
    let identical = true;
    for (let i = 0; i < gltfResult.albedo.length; i++) {
      if (gltfResult.albedo[i] !== glbResult!.albedo[i] || gltfResult.gbuffer[i] !== glbResult!.gbuffer[i]) {
        identical = false;
        break;
      }
    }
    ok(identical, 'albedo + gbuffer passes byte-identical between containers');
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
    ok(parsed.manifest.format === 'isoinfinity-bake/3', `manifest format (got ${parsed.manifest.format})`);
    ok(approx(parsed.manifest.cube.size[0], 6, 1e-3) && approx(parsed.manifest.cube.size[1], 2, 1e-3),
      `manifest cube.size records scaled box (got [${parsed.manifest.cube.size}])`);
    ok(parsed.albedo.size > 0 && parsed.gbuffer.size > 0, 'albedo + gbuffer entries present');
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

  log(`\n${passed} passed, ${failed} failed`, failed === 0 ? 'pass' : 'fail');
}

void main();
