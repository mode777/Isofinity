import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  EquirectangularReflectionMapping,
  FloatType,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
} from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { bakePrimitive } from '../bake/bake.js';
import { parseBake } from '../bake/bundle.js';
import { DEFAULT_PT_SETTINGS, PtBaker, type PtEnvironment } from '../bake/pt.js';
import {
  getCapsule,
  getCube,
  getCylinder,
  getDonut,
  getPlane,
  getSlab,
  getSphere,
} from '../bake/primitives.js';

export const RUNTIME_PPU = 64;

/**
 * One sprite in upload orientation: rows top-down, row 0 = sprite top.
 * Boot bakes flip the raw bottom-up GL readback. Bundle PNGs decode
 * top-down and upload as-is; the bundle EXR decodes to GL order
 * (EXRLoader re-flips the file's top-down scanlines) and needs the same
 * flip as a boot bake.
 */
export interface SpriteLayer {
  id: string;
  pxPerUnit: number;
  width: number;
  height: number;
  originPx: [number, number];
  gbuffer: Uint16Array;
  /** Path-traced lit render (sRGB RGBA, top-down). Required: the runtime
   *  only displays shaded prerendered images. */
  render: Uint8Array;
}

export interface SpriteSet {
  ids: string[];
  maxW: number;
  maxH: number;
  sizes: [number, number][];
  origins: [number, number][];
  ppus: number[];
  gbufferLayers: Uint16Array[];
  renderLayers: Uint8Array[];
}

/**
 * Built-in boot environment: equirect gradient sky with a warm sun disc.
 * The sun sits at the runtime's default key light direction (azimuth 60°,
 * elevation 45° — keep in sync with main.ts) so the baked light agrees
 * with the dynamic key light. Pure function, no external HDRI asset.
 */
function proceduralEnvironment(): PtEnvironment {
  const w = 128;
  const h = 64;
  const az = (60 * Math.PI) / 180;
  const el = (45 * Math.PI) / 180;
  const sun: [number, number, number] = [
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az),
  ];
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const theta = (((y + 0.5) / h - 0.5) * Math.PI);
    const dy = Math.sin(theta);
    const r = Math.cos(theta);
    for (let x = 0; x < w; x++) {
      const phi = ((x + 0.5) / w - 0.5) * Math.PI * 2;
      const dx = r * Math.cos(phi);
      const dz = r * Math.sin(phi);
      const dot = dx * sun[0] + dy * sun[1] + dz * sun[2];
      // Sky above the horizon, dark neutral ground below.
      const sky = dy > 0;
      let cr: number;
      let cg: number;
      let cb: number;
      if (sky) {
        const t = dy; // 0 at horizon, 1 at zenith
        cr = 0.9 + (0.25 - 0.9) * t;
        cg = 0.85 + (0.35 - 0.85) * t;
        cb = 0.8 + (0.55 - 0.8) * t;
      } else {
        cr = 0.15;
        cg = 0.12;
        cb = 0.1;
      }
      // Sun disc plus a broad warm glow.
      const disc = Math.pow(Math.max(dot, 0), 150) * 30;
      const glow = Math.pow(Math.max(dot, 0), 4) * 0.3;
      const o = (y * w + x) * 4;
      data[o] = cr + (disc + glow) * 1.0;
      data[o + 1] = cg + (disc + glow) * 0.92;
      data[o + 2] = cb + (disc + glow) * 0.78;
      data[o + 3] = 1;
    }
  }
  const texture = new DataTexture(data, w, h, RGBAFormat, FloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return { texture, name: 'procedural-sky', rotationDeg: 0, intensity: 1, exposure: 1, saturation: 1 };
}

export async function bakeSpriteLayers(): Promise<SpriteLayer[]> {
  const prims = [
    getSphere(),
    getDonut(),
    getCube(),
    getCylinder(),
    getCapsule(),
    getPlane(),
    getSlab(),
  ];
  const pt = new PtBaker(DEFAULT_PT_SETTINGS, RUNTIME_PPU);
  pt.setEnvironment(proceduralEnvironment());
  const layers: SpriteLayer[] = [];
  try {
    for (const prim of prims) {
      const result = bakePrimitive(prim, RUNTIME_PPU);
      pt.setPrimitive(prim, RUNTIME_PPU);
      const image = await pt.renderPass();
      layers.push({
        id: result.id,
        pxPerUnit: RUNTIME_PPU,
        width: result.width,
        height: result.height,
        originPx: result.originPx,
        gbuffer: bakeFloatToHalf(result.gbuffer, result.width, result.height),
        render: ptImageToLayerBytes(image),
      });
    }
  } finally {
    pt.dispose();
  }
  return layers;
}

export function layersToSet(layers: SpriteLayer[]): SpriteSet {
  const maxW = Math.max(...layers.map((l) => l.width));
  const maxH = Math.max(...layers.map((l) => l.height));
  return {
    ids: layers.map((l) => l.id),
    maxW,
    maxH,
    sizes: layers.map((l) => [l.width, l.height]),
    origins: layers.map((l) => l.originPx),
    ppus: layers.map((l) => l.pxPerUnit),
    gbufferLayers: layers.map((l) => padHalf(l.gbuffer, l.width, l.height, maxW, maxH)),
    renderLayers: layers.map((l) => padBytes(l.render, l.width, l.height, maxW, maxH)),
  };
}

export async function layerFromBundle(buffer: ArrayBuffer): Promise<SpriteLayer> {
  const { manifest, gbuffer, render } = parseBake(buffer);
  if (!render) {
    throw new Error('bundle has no render pass — re-bake with an environment');
  }
  const w = manifest.sprite.width;
  const h = manifest.sprite.height;
  return {
    id: manifest.id,
    pxPerUnit: manifest.pxPerUnit,
    width: w,
    height: h,
    originPx: manifest.sprite.originPx,
    gbuffer: decodeExrGbuffer(await gbuffer.arrayBuffer(), w, h),
    render: await decodePng(render, w, h),
  };
}

async function decodePng(blob: Blob, w: number, h: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  if (bitmap.width !== w || bitmap.height !== h) {
    const got = `${bitmap.width}x${bitmap.height}`;
    bitmap.close();
    throw new Error(`render is ${got}, manifest says ${w}x${h}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Uint8Array(ctx.getImageData(0, 0, w, h).data);
}

function decodeExrGbuffer(buffer: ArrayBuffer, w: number, h: number): Uint16Array {
  // Decode straight to half floats: EXRLoader converts the float32 scanlines
  // to its configured `type`, and HalfFloatType output (Uint16Array of half
  // bits) is exactly the texture upload format.
  const loader = new EXRLoader();
  loader.type = HalfFloatType;
  const texData = loader.parse(buffer) as {
    width: number;
    height: number;
    format: number;
    type: number;
    data: Uint16Array;
  };
  if (texData.width !== w || texData.height !== h) {
    throw new Error(`g-buffer is ${texData.width}x${texData.height}, manifest says ${w}x${h}`);
  }
  if (texData.type !== HalfFloatType || texData.format !== RGBAFormat) {
    throw new Error(`g-buffer must decode to half-float RGBA (got type=${texData.type} format=${texData.format})`);
  }
  // EXRLoader writes rows bottom-up (GL texture order), same as a raw bake
  // readback; uploads want top-down.
  const src = texData.data;
  const out = new Uint16Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = (h - 1 - y) * w * 4;
    out.set(src.subarray(s, s + w * 4), y * w * 4);
  }
  return out;
}

// GL readback is bottom-up; uploads want top-down (row 0 = sprite top).
function bakeFloatToHalf(rgba: Float32Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const s = (srcRow + x) * 4;
      const d = (y * w + x) * 4;
      out[d] = DataUtils.toHalfFloat(rgba[s]);
      out[d + 1] = DataUtils.toHalfFloat(rgba[s + 1]);
      out[d + 2] = DataUtils.toHalfFloat(rgba[s + 2]);
      out[d + 3] = DataUtils.toHalfFloat(rgba[s + 3]);
    }
  }
  return out;
}

// PtImage bytes are in GL readback order (bottom-up); flip to top-down.
function ptImageToLayerBytes(image: { width: number; height: number; rgba: Uint8Array }): Uint8Array {
  const { width: w, height: h, rgba } = image;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = (h - 1 - y) * w * 4;
    out.set(rgba.subarray(s, s + w * 4), y * w * 4);
  }
  return out;
}

// Layers are already top-down; pad copies rows verbatim (row 0 stays v=0).
function padBytes(src: Uint8Array, w: number, h: number, maxW: number, maxH: number): Uint8Array {
  const out = new Uint8Array(maxW * maxH * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (y * maxW + x) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return out;
}

function padHalf(src: Uint16Array, w: number, h: number, maxW: number, maxH: number): Uint16Array {
  const out = new Uint16Array(maxW * maxH * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (y * maxW + x) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return out;
}
