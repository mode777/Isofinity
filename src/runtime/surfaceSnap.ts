import { DataUtils } from 'three';
import { SCREEN_UP, VIEW_DIR } from '../shared/iso.js';
import type { SpriteSet } from './assets.js';

/**
 * One placement participating in a surface-snap pick: its world position
 * plus the sprite-set layer index of the direction view it is drawn with
 * (the same layer the compositor draws — the pick reads what is rendered).
 */
export interface SurfacePlacement {
  x: number;
  y: number;
  z: number;
  layer: number;
}

/**
 * World-space height of the visible surface under a world-image pixel, or
 * 0 when nothing covers it (empty ground included).
 *
 * The reconstruction is the exact inverse of the compositor's projection:
 * a world point q decomposes over the orthonormal screen basis as
 * `q = u·SCREEN_RIGHT + s·SCREEN_UP + d·VIEW_DIR` with `(u, s)` the
 * screen coordinates of the pixel and `d = dot(VIEW_DIR, q)` the baked
 * linear ray depth. So `q.y = s·SCREEN_UP[1] + d·VIEW_DIR[1]` exactly
 * (SCREEN_RIGHT[1] is 0). The winning depth per pixel is the max composite
 * across the covering placements — the same nearest-to-camera rule the
 * per-pixel depth test resolves, so the read is the surface actually
 * drawn under the cursor.
 *
 * Texel indexing uses the set's padded stride (`maxW`), matching the GPU
 * texture upload — NOT the layer's own width, which drifts across rows
 * whenever any loaded layer is wider than the picked one.
 */
export function surfaceHeightAt(
  set: SpriteSet,
  placements: readonly SurfacePlacement[],
  wx: number,
  wy: number,
  originYpx: number,
  ppu: number,
  project: (x: number, z: number, y: number) => readonly [number, number],
): number {
  // Surface point = u·SCREEN_RIGHT + s·SCREEN_UP + d·VIEW_DIR; its y
  // component only involves s and d (SCREEN_RIGHT[1] is 0).
  const s = -(wy - originYpx) / ppu;
  let best = -Infinity;
  for (const p of placements) {
    if (p.layer < 0 || p.layer >= set.gbufferLayers.length) continue;
    const scale = ppu / set.ppus[p.layer];
    const [ox, oy] = set.origins[p.layer];
    const [ax, ay, az] = set.anchors[p.layer];
    const [w, h] = set.sizes[p.layer];
    const [cx, cy] = project(p.x, p.z, p.y);
    const bx = cx - ox * scale;
    const by = cy - oy * scale;
    const tx = Math.floor((wx - bx) / scale);
    const ty = Math.floor((wy - by) / scale);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    const g = set.gbufferLayers[p.layer];
    const o = (ty * set.maxW + tx) * 4;
    const nx = DataUtils.fromHalfFloat(g[o]);
    const ny = DataUtils.fromHalfFloat(g[o + 1]);
    const nz = DataUtils.fromHalfFloat(g[o + 2]);
    if (nx * nx + ny * ny + nz * nz === 0) continue;
    // Same anchor correction as the draw path: the baked depth field
    // is measured with the box corner at the placement, the image is
    // drawn from the anchor — subtract the anchor's depth so the
    // reconstructed world position matches the drawn pixel.
    const d =
      DataUtils.fromHalfFloat(g[o + 3]) +
      VIEW_DIR[0] * (p.x - ax) +
      VIEW_DIR[1] * (p.y - ay) +
      VIEW_DIR[2] * (p.z - az);
    if (d > best) best = d;
  }
  if (!Number.isFinite(best)) return 0;
  return Math.max(0, s * SCREEN_UP[1] + best * VIEW_DIR[1]);
}
