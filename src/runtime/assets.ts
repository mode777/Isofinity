import { bakePrimitive } from '../bake/bake.js';
import {
  getCapsule,
  getCube,
  getCylinder,
  getDonut,
  getPlane,
  getSphere,
} from '../bake/primitives.js';

export const RUNTIME_PPU = 64;

export interface SpriteSet {
  ids: string[];
  width: number;
  height: number;
  albedoLayers: Uint8Array[];
  depthLayers: Float32Array[];
  originPx: [number, number];
}

export function bakeSprites(): SpriteSet {
  const prims = [
    getSphere(),
    getDonut(),
    getCube(),
    getCylinder(),
    getCapsule(),
    getPlane(),
  ];
  const ids: string[] = [];
  const albedoLayers: Uint8Array[] = [];
  const depthLayers: Float32Array[] = [];
  let width = 0;
  let height = 0;
  let originPx: [number, number] = [0, 0];
  for (const prim of prims) {
    const result = bakePrimitive(prim, RUNTIME_PPU);
    ids.push(result.id);
    width = result.width;
    height = result.height;
    originPx = result.originPx;
    albedoLayers.push(albedoToBytes(result.albedo, result.width, result.height));
    depthLayers.push(depthToChannel(result.depth, result.width, result.height));
  }
  return { ids, width, height, albedoLayers, depthLayers, originPx };
}

function albedoToBytes(rgba: Float32Array, w: number, h: number): Uint8Array {
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

function depthToChannel(depth: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      out[y * w + x] = depth[(srcRow + x) * 4];
    }
  }
  return out;
}

function quantize(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}
