import { DataUtils, HalfFloatType, RGBAFormat } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { bakePrimitive } from '../bake/bake.js';
import { parseBake } from '../bake/bundle.js';
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
  albedo: Uint8Array;
  gbuffer: Uint16Array;
}

export interface SpriteSet {
  ids: string[];
  maxW: number;
  maxH: number;
  sizes: [number, number][];
  origins: [number, number][];
  ppus: number[];
  albedoLayers: Uint8Array[];
  gbufferLayers: Uint16Array[];
}

export function bakeSpriteLayers(): SpriteLayer[] {
  const prims = [
    getSphere(),
    getDonut(),
    getCube(),
    getCylinder(),
    getCapsule(),
    getPlane(),
    getSlab(),
  ];
  return prims.map((prim) => {
    const result = bakePrimitive(prim, RUNTIME_PPU);
    return {
      id: result.id,
      pxPerUnit: RUNTIME_PPU,
      width: result.width,
      height: result.height,
      originPx: result.originPx,
      albedo: bakeFloatToBytes(result.albedo, result.width, result.height),
      gbuffer: bakeFloatToHalf(result.gbuffer, result.width, result.height),
    };
  });
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
    albedoLayers: layers.map((l) => padBytes(l.albedo, l.width, l.height, maxW, maxH)),
    gbufferLayers: layers.map((l) => padHalf(l.gbuffer, l.width, l.height, maxW, maxH)),
  };
}

export async function layerFromBundle(buffer: ArrayBuffer): Promise<SpriteLayer> {
  const { manifest, albedo, gbuffer } = parseBake(buffer);
  const w = manifest.sprite.width;
  const h = manifest.sprite.height;
  return {
    id: manifest.id,
    pxPerUnit: manifest.pxPerUnit,
    width: w,
    height: h,
    originPx: manifest.sprite.originPx,
    albedo: await decodePng(albedo, w, h),
    gbuffer: decodeExrGbuffer(await gbuffer.arrayBuffer(), w, h),
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
    throw new Error(`albedo is ${got}, manifest says ${w}x${h}`);
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
function bakeFloatToBytes(rgba: Float32Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const s = (srcRow + x) * 4;
      const d = (y * w + x) * 4;
      out[d] = quantize(rgba[s]);
      out[d + 1] = quantize(rgba[s + 1]);
      out[d + 2] = quantize(rgba[s + 2]);
      out[d + 3] = quantize(rgba[s + 3]);
    }
  }
  return out;
}

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

function quantize(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}
