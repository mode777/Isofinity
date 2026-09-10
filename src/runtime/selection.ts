import { DataUtils } from 'three';
import { VIEW_DIR } from '../shared/iso.js';
import type { SpriteSet } from './assets.js';

/**
 * CPU-side placement picking for the world editor's Select tool. Sprites
 * are picked by their baked g-buffer silhouette (not their ground
 * footprint), using the exact padded-stride texel indexing and
 * per-fragment depth the compositor uses (see `surfaceSnap.ts`); meshes
 * and point lights are picked by screen-space proximity to their
 * projected anchor. No GPU readback is involved.
 */

/** One sprite placement participating in a pick. */
export interface PickSprite {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Sprite-set layer index of the view the placement is drawn with. */
  layer: number;
}

/** One mesh placement; `x`/`y`/`z` is the drawn origin (feet, offset applied). */
export interface PickMesh {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Rendered height in world units (the vertical pick extent). */
  height: number;
}

/** One point light placement; `x`/`z` are the footprint corner. */
export interface PickLight {
  id: number;
  x: number;
  y: number;
  z: number;
}

export type PickResult =
  | { kind: 'sprite'; id: number }
  | { kind: 'mesh'; id: number }
  | { kind: 'light'; id: number };

export interface PickOptions {
  /** Mesh pick rectangle half-width in world units (default 0.45). */
  meshHalfWidthUnits?: number;
  /** Mesh pick vertical slack in world-image pixels (default 6). */
  meshVerticalTolerancePx?: number;
  /** Point-light pick radius in world-image pixels (default 14). */
  lightPickPx?: number;
}

/** A sprite hit: the winning id and its per-fragment reference depth. */
export interface SpriteHit {
  id: number;
  depth: number;
}

/** Reference-plane depth of a ground position (the World's `depthOf`). */
function referenceDepth(x: number, y: number, z: number): number {
  return VIEW_DIR[0] * (x + 0.5) + VIEW_DIR[1] * y + VIEW_DIR[2] * (z + 0.5);
}

/**
 * Nearest sprite under the world-image pixel `(wx, wy)`, resolving the
 * baked g-buffer silhouette and per-fragment depth (`g.a + offset`, max =
 * nearest). G-buffer-empty pixels — including grounding-shadow fragments —
 * are not selectable. Returns null when no sprite covers the pixel.
 */
export function pickSpriteAt(
  set: SpriteSet,
  sprites: readonly PickSprite[],
  wx: number,
  wy: number,
  ppu: number,
  project: (x: number, z: number, y: number) => readonly [number, number],
): SpriteHit | null {
  let best: SpriteHit | null = null;
  for (const p of sprites) {
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
    // Same anchor correction as the draw path: baked depth is measured
    // from the box corner, the image is drawn from the anchor.
    const d =
      DataUtils.fromHalfFloat(g[o + 3]) +
      VIEW_DIR[0] * (p.x - ax) +
      VIEW_DIR[1] * (p.y - ay) +
      VIEW_DIR[2] * (p.z - az);
    if (!best || d > best.depth) best = { id: p.id, depth: d };
  }
  return best;
}

/**
 * Nearest placement of any kind at the world-image pixel `(wx, wy)`:
 * sprite silhouette + per-fragment depth, mesh and point-light
 * screen-space proximity. Cross-kind candidates compare by depth so the
 * visually nearest wins.
 */
export function pickPlacementAt(
  set: SpriteSet,
  sprites: readonly PickSprite[],
  meshes: readonly PickMesh[],
  lights: readonly PickLight[],
  wx: number,
  wy: number,
  ppu: number,
  project: (x: number, z: number, y: number) => readonly [number, number],
  options: PickOptions = {},
): PickResult | null {
  const sprite = pickSpriteAt(set, sprites, wx, wy, ppu, project);
  let best: { result: PickResult; depth: number } | null = sprite
    ? { result: { kind: 'sprite', id: sprite.id }, depth: sprite.depth }
    : null;

  const meshHalfW = (options.meshHalfWidthUnits ?? 0.45) * ppu;
  const meshTol = options.meshVerticalTolerancePx ?? 6;
  for (const m of meshes) {
    const [fx, fy] = project(m.x, m.z, m.y);
    const [, topY] = project(m.x, m.z, m.y + m.height);
    const yMin = Math.min(fy, topY) - meshTol;
    const yMax = Math.max(fy, topY) + meshTol;
    if (wx < fx - meshHalfW || wx > fx + meshHalfW || wy < yMin || wy > yMax) continue;
    const depth = referenceDepth(m.x, m.y, m.z);
    if (!best || depth > best.depth) best = { result: { kind: 'mesh', id: m.id }, depth };
  }

  const lightPx = options.lightPickPx ?? 14;
  for (const l of lights) {
    const [lx, ly] = project(l.x + 0.5, l.z + 0.5, l.y);
    const dx = lx - wx;
    const dy = ly - wy;
    if (dx * dx + dy * dy > lightPx * lightPx) continue;
    const depth = referenceDepth(l.x, l.y, l.z);
    if (!best || depth > best.depth) best = { result: { kind: 'light', id: l.id }, depth };
  }

  return best?.result ?? null;
}
