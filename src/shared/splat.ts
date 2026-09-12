/**
 * Pure terrain-coverage splat math: resolution, the default mirror, the
 * normalized-replace brush stamp, resampling, and the persisted-alpha
 * derivation. No DOM/GL — Node-verifiable (see `src/app/terrain-verify.ts`).
 *
 * Coverage layout: rgb = material slots 0-2, alpha = slot 3 (derived as
 * `1 - r - g - b`). The four weights form a partition of unity.
 */

/** Default painted-coverage resolution: 16 texels per world unit. */
export const DEFAULT_PAINT_TEXELS_PER_UNIT = 16;

/** Cap on either splat dimension (128 world units × 16 = 2048). */
export const MAX_SPLAT_DIM = 2048;

export interface Splat {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Texel dimensions of a splat at the given ground size and resolution. */
export function splatDimensions(
  width: number,
  depth: number,
  texelsPerUnit: number,
): { width: number; height: number } {
  const tpu =
    Number.isFinite(texelsPerUnit) && texelsPerUnit > 0
      ? texelsPerUnit
      : DEFAULT_PAINT_TEXELS_PER_UNIT;
  return {
    width: Math.max(1, Math.min(MAX_SPLAT_DIM, Math.round(width * tpu))),
    height: Math.max(1, Math.min(MAX_SPLAT_DIM, Math.round(depth * tpu))),
  };
}

/** A fresh default coverage mirror: material slot 0 everywhere. */
export function defaultSplatBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    bytes[i * 4] = 255; // slot 0 coverage 1; slots 1-3 zero (alpha derived)
  }
  return bytes;
}

/** Write slot 3 coverage into alpha (derived from the painted rgb). */
export function withDerivedAlpha(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  out.set(data);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[o + 3] = Math.max(0, 255 - (out[o] + out[o + 1] + out[o + 2]));
  }
  return out;
}

/** Nearest-resample a splat to new texel dimensions (ground resize). */
export function resampleSplat(src: Splat, width: number, height: number): Uint8Array {
  const sw = src.width;
  const sh = src.height;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / width));
      const s = (sy * sw + sx) * 4;
      const d = (y * width + x) * 4;
      out[d] = src.data[s];
      out[d + 1] = src.data[s + 1];
      out[d + 2] = src.data[s + 2];
      out[d + 3] = src.data[s + 3];
    }
  }
  return out;
}

/** A normalized brush falloff in [0, 1] for a 0..1 radius ratio. */
export function brushFalloff(distance: number, hardness: number): number {
  if (distance >= 1) return 0;
  if (distance <= hardness) return 1;
  const t = (distance - hardness) / Math.max(1e-4, 1 - hardness);
  return 1 - t * t * (3 - 2 * t);
}

export function unionRect(rect: Rect | null, other: Rect): Rect {
  if (!rect) return other;
  const x1 = Math.max(rect.x + rect.w, other.x + other.w);
  const y1 = Math.max(rect.y + rect.h, other.y + other.h);
  const x = Math.min(rect.x, other.x);
  const y = Math.min(rect.y, other.y);
  return { x, y, w: x1 - x, h: y1 - y };
}

/**
 * Stamp one normalized-replace dab into the coverage mirror: the rgb slots
 * move toward the painted slot's coverage by the falloff (slot 3 clears
 * rgb), and alpha is re-derived so the four coverages keep summing to 1.
 * Mutates `splat.data` and returns the changed texel rectangle (null when
 * the dab was entirely off-plane).
 *
 * `opacity` scales the dab. With `accumulate` false and a `before`/`stroke`
 * pair supplied, each texel's applied coverage is `opacity × max(falloff over
 * the stroke)` — so overlapping dabs cannot push a stroke past its opacity.
 * With `accumulate` true (or no stroke state) the dab compounds on the
 * current value, so repeated passes build toward full coverage.
 */
export function stampSplatDab(
  splat: Splat,
  groundWidth: number,
  groundDepth: number,
  wx: number,
  wz: number,
  radius: number,
  hardness: number,
  slot: number,
  opacity: number,
  accumulate: boolean,
  before: Uint8Array | null,
  stroke: Uint8Array | null,
): Rect | null {
  const W = splat.width;
  const H = splat.height;
  const cx = (wx / groundWidth) * W;
  const cy = (wz / groundDepth) * H;
  const r = Math.max(1, (radius / groundWidth) * W);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  if (x1 < x0 || y1 < y0) return null;
  const target = slot < 3 ? slot : -1;
  const data = splat.data;
  const useStroke = !accumulate && before !== null && stroke !== null;
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      const falloff = brushFalloff(dist, hardness);
      if (falloff <= 0) continue;
      const o = (y * W + x) * 4;
      let a: number;
      let base: Uint8Array;
      if (useStroke) {
        const idx = y * W + x;
        const s = Math.max(stroke![idx] / 255, falloff);
        stroke![idx] = Math.round(s * 255);
        a = clamp01(opacity) * s;
        base = before!;
      } else {
        a = clamp01(opacity) * falloff;
        base = data;
      }
      let sum = 0;
      for (let c = 0; c < 3; c++) {
        const dst = base[o + c] / 255;
        const tgt = c === target ? 1 : 0;
        data[o + c] = Math.round(clamp01(dst * (1 - a) + tgt * a) * 255);
        sum += data[o + c];
      }
      data[o + 3] = Math.max(0, 255 - sum);
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
