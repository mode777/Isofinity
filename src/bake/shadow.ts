import { PAD_PX, type BakeResult } from './bake.js';
import { ISO_AZIMUTH_DEG, frameIsoBox, reconstructWorldPos, type IsoFrame } from './iso.js';
import { Vector3 } from 'three';
import type { PtImage } from './pt.js';

/**
 * The baked grounding shadow (optional render-pass feature): a soft,
 * direction-agnostic ground darkening derived purely from the baked
 * g-buffer — each covered pixel's unprojected world position is splatted
 * onto a ground-plane footprint grid, blurred, and composited into the
 * render pass's fully empty pixels as a dark blue-tinted, mid-alpha
 * grounding patch. The blue tint (POE shadow-color matching) doubles as
 * the runtime's pixel classifier: g-buffer-empty render pixels that are
 * blue-dominant near-black are the grounding shadow, everything else
 * keeps the historical semantics.
 */

/** How far the patch spreads past the footprint (world units). */
export const GROUND_SHADOW_REACH = 0.25;
/** Peak darkening of the composited patch (alpha scale). */
export const GROUND_SHADOW_STRENGTH = 0.55;
/**
 * Grounding tint in the RGBA8 render pass — deliberately blue-dominant
 * and near-black so the runtime can classify it (r < b) and so it reads
 * as a cool occlusion rather than a hole.
 */
export const GROUND_SHADOW_TINT: readonly [number, number, number] = [2, 6, 14];
/** Decal grid resolution (cells per world unit) before the blur. */
const DECAL_PPU = 32;

/** Sprite-rect padding (px) a grounding-shadow bake adds to a frame. */
export function groundShadowPadPx(pxPerUnit: number): number {
  return GROUND_SHADOW_REACH * pxPerUnit;
}

/**
 * Separable box blur over a single-channel float grid, in place across a
 * scratch buffer. Two passes approximate a smooth (tent-like) kernel.
 * Windows normalize by the full kernel size (not the clamped sample
 * count), so values near the grid border fade toward zero instead of
 * leaking — the grounding patch must die out with distance. Pure array
 * math — Node-runnable and deterministic.
 */
export function boxBlur(
  grid: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes = 2,
): void {
  if (radius < 1) return;
  const scratch = new Float32Array(grid.length);
  const r = Math.round(radius);
  const norm = 1 / ((2 * r + 1) * (2 * r + 1));
  for (let p = 0; p < passes; p++) {
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= width) continue;
          sum += grid[row + xx];
        }
        scratch[row + x] = sum;
      }
    }
    // Vertical pass
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= height) continue;
          sum += scratch[yy * width + x];
        }
        grid[y * width + x] = sum * norm;
      }
    }
  }
}

/** The blur radius (grid cells) the grounding mask smooths with. */
const blurRadiusCells = (): number => GROUND_SHADOW_REACH * DECAL_PPU;

/**
 * Footprint mask in ground space: every g-buffer-covered pixel's
 * unprojected world position splats one sample onto a decal grid covering
 * the slot's box footprint expanded by the shadow reach, then the grid is
 * box-blurred into a soft occlusion patch (solid over the footprint,
 * fading to zero by the reach). Alpha-masked-out texels read empty in the
 * g-buffer and so cast no shadow, mirroring the coverage convention.
 */
export function groundShadowMask(result: BakeResult, frame: IsoFrame): {
  mask: Float32Array;
  width: number;
  height: number;
  /** World x/z of grid cell (0,0)'s corner. */
  x0: number;
  z0: number;
} {
  const x0 = -GROUND_SHADOW_REACH;
  const z0 = -GROUND_SHADOW_REACH;
  const width = Math.max(1, Math.ceil((result.size[0] + 2 * GROUND_SHADOW_REACH) * DECAL_PPU));
  const height = Math.max(1, Math.ceil((result.size[2] + 2 * GROUND_SHADOW_REACH) * DECAL_PPU));
  const grid = new Float32Array(width * height);
  const pos = new Vector3();
  const { width: w, height: h, gbuffer } = result;
  for (let yGl = 0; yGl < h; yGl++) {
    const yTop = h - 1 - yGl; // GL readback rows are bottom-up
    for (let x = 0; x < w; x++) {
      const s = (yGl * w + x) * 4;
      const nx = gbuffer[s];
      const ny = gbuffer[s + 1];
      const nz = gbuffer[s + 2];
      if (nx * nx + ny * ny + nz * nz < 0.5) continue; // empty pixel
      const depth = gbuffer[s + 3];
      reconstructWorldPos(frame, x + 0.5, yTop + 0.5, depth, pos);
      const gx = Math.floor((pos.x - x0) * DECAL_PPU);
      const gz = Math.floor((pos.z - z0) * DECAL_PPU);
      if (gx < 0 || gx >= width || gz < 0 || gz >= height) continue;
      grid[gz * width + gx] = 1;
    }
  }
  boxBlur(grid, width, height, blurRadiusCells());
  return { mask: grid, width, height, x0, z0 };
}

/**
 * Composite the grounding mask into a finished (tonemapped, sRGB) render
 * pass: only fully empty pixels (alpha 0) receive the grounding tint with
 * alpha = mask · strength, sampled at each empty pixel's ray∩ground (x/z)
 * — an analytic intersection, independent of the (empty) stored depth.
 * Object pixels and their AA fringe stay byte-identical. Both arrays are
 * in GL readback order (rows bottom-up). Returns a new PtImage.
 */
export function composeGroundShadow(
  render: PtImage,
  result: BakeResult,
  frame: IsoFrame,
): PtImage {
  const { mask, width: mw, height: mh, x0, z0 } = groundShadowMask(result, frame);
  const { width: w, height: h } = render;
  const rgba = render.rgba.slice();
  const origin = new Vector3();
  for (let yGl = 0; yGl < h; yGl++) {
    const yTop = h - 1 - yGl;
    for (let x = 0; x < w; x++) {
      const i = (yGl * w + x) * 4;
      if (rgba[i + 3] !== 0) continue;
      // Ray through this pixel: origin at depth 0 on the reference plane,
      // direction viewDir; hit y = 0 at t = -origin.y / viewDir.y.
      reconstructWorldPos(frame, x + 0.5, yTop + 0.5, 0, origin);
      const t = -origin.y / frame.viewDir.y;
      const gx = origin.x + t * frame.viewDir.x;
      const gz = origin.z + t * frame.viewDir.z;
      const cx = Math.floor((gx - x0) * DECAL_PPU);
      const cz = Math.floor((gz - z0) * DECAL_PPU);
      if (cx < 0 || cx >= mw || cz < 0 || cz >= mh) continue;
      const m = mask[cz * mw + cx];
      if (m <= 0) continue;
      const a = Math.min(255, Math.round(m * GROUND_SHADOW_STRENGTH * 255));
      if (a === 0) continue;
      rgba[i] = GROUND_SHADOW_TINT[0];
      rgba[i + 1] = GROUND_SHADOW_TINT[1];
      rgba[i + 2] = GROUND_SHADOW_TINT[2];
      rgba[i + 3] = a;
    }
  }
  return { width: w, height: h, rgba };
}

/**
 * The frame a grounding-shadow bake's passes were framed with (grown rect):
 * shared by the splat and the composition so both unproject through the
 * same camera. `result` carries the slot's rotated box and rect.
 */
export function groundShadowFrame(result: BakeResult, anchor: [number, number, number] = [0, 0, 0]): IsoFrame {
  return frameIsoBox(
    result.size,
    result.pxPerUnit,
    PAD_PX,
    ISO_AZIMUTH_DEG,
    anchor,
    groundShadowPadPx(result.pxPerUnit),
  );
}
