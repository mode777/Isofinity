import { DataUtils } from 'three';
import { bakePrimitive } from '../bake/bake.js';
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

export interface SpriteSet {
  ids: string[];
  maxW: number;
  maxH: number;
  sizes: [number, number][];
  origins: [number, number][];
  albedoLayers: Uint8Array[];
  gbufferLayers: Uint16Array[];
}

export function bakeSprites(): SpriteSet {
  const prims = [
    getSphere(),
    getDonut(),
    getCube(),
    getCylinder(),
    getCapsule(),
    getPlane(),
    getSlab(),
  ];
  const results = prims.map((prim) => bakePrimitive(prim, RUNTIME_PPU));
  const maxW = Math.max(...results.map((r) => r.width));
  const maxH = Math.max(...results.map((r) => r.height));
  const ids: string[] = [];
  const sizes: [number, number][] = [];
  const origins: [number, number][] = [];
  const albedoLayers: Uint8Array[] = [];
  const gbufferLayers: Uint16Array[] = [];
  for (const result of results) {
    ids.push(result.id);
    sizes.push([result.width, result.height]);
    origins.push(result.originPx);
    albedoLayers.push(albedoToBytes(result.albedo, result.width, result.height, maxW, maxH));
    gbufferLayers.push(gbufferToHalf(result.gbuffer, result.width, result.height, maxW, maxH));
  }
  return { ids, maxW, maxH, sizes, origins, albedoLayers, gbufferLayers };
}

function albedoToBytes(
  rgba: Float32Array,
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): Uint8Array {
  const out = new Uint8Array(maxW * maxH * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const s = (srcRow + x) * 4;
      const d = (y * maxW + x) * 4;
      out[d] = quantize(rgba[s]);
      out[d + 1] = quantize(rgba[s + 1]);
      out[d + 2] = quantize(rgba[s + 2]);
      out[d + 3] = quantize(rgba[s + 3]);
    }
  }
  return out;
}

function gbufferToHalf(
  rgba: Float32Array,
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): Uint16Array {
  const out = new Uint16Array(maxW * maxH * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const s = (srcRow + x) * 4;
      const d = (y * maxW + x) * 4;
      out[d] = DataUtils.toHalfFloat(rgba[s]);
      out[d + 1] = DataUtils.toHalfFloat(rgba[s + 1]);
      out[d + 2] = DataUtils.toHalfFloat(rgba[s + 2]);
      out[d + 3] = DataUtils.toHalfFloat(rgba[s + 3]);
    }
  }
  return out;
}

function quantize(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}
