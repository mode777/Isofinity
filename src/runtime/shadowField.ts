import { DataUtils } from 'three';
import { SCREEN_RIGHT, SCREEN_UP, VIEW_DIR, type Vec3 } from '../shared/iso.js';

/**
 * The reconstructed world-space occluder field (add-dynamic-directional-shadows,
 * design D1/D5): a vertical height field built by resampling the placed
 * sprites' baked g-buffer coverage. Pure, Node-runnable math — the runtime
 * uploads the result and the deferred pass ray-marches it; this module also
 * provides the CPU reference march used by `verify:shadows`.
 *
 * A sprite's g-buffer is a 2.5D relief from the fixed camera. A per-layer
 * point cloud in placement-local space is cached once (`buildLayerShadowPoints`)
 * and offset by each placement, then splatted to max height per ground cell.
 * The point cloud is frame-independent: the anchored draw minus the baked
 * depth and the orthonormal iso frame make every texel's world offset a pure
 * function of the layer.
 */

/** Occluder field grid cell size target (world units); ~half a bake texel. */
export const SHADOW_CELL_SIZE = 1 / 16;
/** Hard per-axis grid cap (keeps the CPU build and the texture bounded). */
export const SHADOW_FIELD_TEXEL_CAP = 2048;
/** Default normal-offset bias (world units) for the shadow ray start. */
export const SHADOW_BIAS = 0.06;
/** Small height epsilon on the compare (avoids coplanar re-hits). */
export const SHADOW_BIAS_EPSILON = 0.005;
/** March cap, in cells (bounds the worst-case per-pixel cost). */
export const SHADOW_MAX_STEPS = 256;

/** Structural subset of `SpriteSet` the field builder needs. */
export interface ShadowLayerSource {
  sizes: [number, number][];
  origins: [number, number][];
  anchors: Vec3[];
  ppus: number[];
  gbufferLayers: Uint16Array[];
  maxW: number;
}

export interface ShadowPlacement {
  x: number;
  y: number;
  z: number;
  /** Layer index into the sprite set, or -1 when the layer is missing. */
  layer: number;
}

export interface ShadowField {
  /** Max surface height per cell, row-major, row 0 = world z 0. */
  data: Float32Array;
  width: number;
  height: number;
  /** World x/z of cell (0,0)'s corner. */
  originX: number;
  originZ: number;
  cellX: number;
  cellZ: number;
  /** Tallest splatted surface (world units); 0 when empty. */
  maxHeight: number;
}

/**
 * The per-layer point cloud in placement-local space: for every covered
 * g-buffer texel, the world offset from the placement point `(x, y, z)` to
 * that texel's reconstructed surface point. Flat `[x, y, z, ...]`.
 */
export function buildLayerShadowPoints(
  set: ShadowLayerSource,
  layerIndex: number,
): Float32Array {
  const g = set.gbufferLayers[layerIndex];
  if (!g) return new Float32Array(0);
  const [w, h] = set.sizes[layerIndex];
  const [ox, oy] = set.origins[layerIndex];
  const [ax, ay, az] = set.anchors[layerIndex];
  const ppu = set.ppus[layerIndex];
  const stride = set.maxW;
  const invPpu = 1 / ppu;
  const anchorDepth = VIEW_DIR[0] * ax + VIEW_DIR[1] * ay + VIEW_DIR[2] * az;
  const pts: number[] = [];
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const o = (ty * stride + tx) * 4;
      const nx = DataUtils.fromHalfFloat(g[o]);
      const ny = DataUtils.fromHalfFloat(g[o + 1]);
      const nz = DataUtils.fromHalfFloat(g[o + 2]);
      if (nx * nx + ny * ny + nz * nz === 0) continue; // empty / masked out
      const d = DataUtils.fromHalfFloat(g[o + 3]) - anchorDepth;
      const u = (tx - ox) * invPpu;
      const v = (oy - ty) * invPpu;
      pts.push(
        SCREEN_RIGHT[0] * u + SCREEN_UP[0] * v + VIEW_DIR[0] * d,
        SCREEN_RIGHT[1] * u + SCREEN_UP[1] * v + VIEW_DIR[1] * d,
        SCREEN_RIGHT[2] * u + SCREEN_UP[2] * v + VIEW_DIR[2] * d,
      );
    }
  }
  return Float32Array.from(pts);
}

/** Grid dimensions/cell size for a ground extent under the texel cap. */
export function shadowFieldSize(
  extentX: number,
  extentZ: number,
): { width: number; height: number; cellX: number; cellZ: number } {
  const width = Math.min(
    SHADOW_FIELD_TEXEL_CAP,
    Math.max(1, Math.round(extentX / SHADOW_CELL_SIZE)),
  );
  const height = Math.min(
    SHADOW_FIELD_TEXEL_CAP,
    Math.max(1, Math.round(extentZ / SHADOW_CELL_SIZE)),
  );
  return { width, height, cellX: extentX / width, cellZ: extentZ / height };
}

/**
 * Splat every placement's cached point cloud onto the ground grid, keeping
 * the maximum surface height per cell. Points outside the ground extent are
 * dropped (they cannot shade ground there).
 */
export function buildShadowField(
  set: ShadowLayerSource,
  placements: readonly ShadowPlacement[],
  extentX: number,
  extentZ: number,
  layerPoints: ReadonlyMap<number, Float32Array>,
): ShadowField {
  const { width, height, cellX, cellZ } = shadowFieldSize(extentX, extentZ);
  const data = new Float32Array(width * height);
  let maxHeight = 0;
  for (const p of placements) {
    if (p.layer < 0 || p.layer >= set.sizes.length) continue;
    const pts = layerPoints.get(p.layer);
    if (!pts || pts.length === 0) continue;
    for (let i = 0; i < pts.length; i += 3) {
      const wx = p.x + pts[i];
      if (wx < 0 || wx >= extentX) continue;
      const wz = p.z + pts[i + 2];
      if (wz < 0 || wz >= extentZ) continue;
      const wy = p.y + pts[i + 1];
      if (wy <= 0) continue; // below the ground plane casts nothing upward
      const cx = Math.min(width - 1, Math.floor(wx / cellX));
      const cz = Math.min(height - 1, Math.floor(wz / cellZ));
      const idx = cz * width + cx;
      if (wy > data[idx]) data[idx] = wy;
      if (wy > maxHeight) maxHeight = wy;
    }
  }
  return { data, width, height, originX: 0, originZ: 0, cellX, cellZ, maxHeight };
}

/**
 * Splat extra world-space points (e.g. per-frame skinned mesh vertices) into
 * an existing field, keeping the max height per cell. Returns the new tallest
 * height. The caller decides whether to mutate the static field or a copy.
 */
export function splatWorldPoints(field: ShadowField, pts: ArrayLike<number>): number {
  const extentX = field.width * field.cellX;
  const extentZ = field.height * field.cellZ;
  let maxHeight = field.maxHeight;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i];
    const y = pts[i + 1];
    const z = pts[i + 2];
    if (x < field.originX || z < field.originZ || x >= extentX || z >= extentZ) continue;
    if (y <= 0) continue;
    const cx = Math.min(field.width - 1, Math.floor((x - field.originX) / field.cellX));
    const cz = Math.min(field.height - 1, Math.floor((z - field.originZ) / field.cellZ));
    const idx = cz * field.width + cx;
    if (y > field.data[idx]) field.data[idx] = y;
    if (y > maxHeight) maxHeight = y;
  }
  field.maxHeight = maxHeight;
  return maxHeight;
}

function fieldHeight(field: ShadowField, x: number, z: number): number {
  const extentX = field.width * field.cellX;
  const extentZ = field.height * field.cellZ;
  if (x < field.originX || z < field.originZ) return 0;
  const relX = x - field.originX;
  const relZ = z - field.originZ;
  if (relX >= extentX || relZ >= extentZ) return 0;
  const cx = Math.min(field.width - 1, Math.floor(relX / field.cellX));
  const cz = Math.min(field.height - 1, Math.floor(relZ / field.cellZ));
  return field.data[cz * field.width + cx];
}
/**
 * CPU reference for the deferred height-field march: 1 = key light reaches
 * the receiver, 0 = occluded. Mirrors the GLSL `shadowVisibility` (same
 * normal-offset, step, epsilon, cap and bounds) so the shader can be
 * validated against it. `normal` is the receiver's world-space surface
 * normal (up by default).
 */
export function shadowVisibilityCPU(
  field: ShadowField,
  px: number,
  py: number,
  pz: number,
  dir: Vec3,
  normal: Vec3 = [0, 1, 0],
): number {
  const lxz = Math.hypot(dir[0], dir[2]);
  if (lxz < 1e-5) return 1;
  const hx = dir[0] / lxz;
  const hz = dir[2] / lxz;
  const rise = dir[1] / lxz;
  const ndl = Math.max(dir[0] * normal[0] + dir[1] * normal[1] + dir[2] * normal[2], 0);
  const nlen = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const offset = (SHADOW_BIAS * (1 + 2 * (1 - ndl))) / nlen;
  const ox = px + normal[0] * offset;
  const oy = py + normal[1] * offset;
  const oz = pz + normal[2] * offset;
  if (rise >= 0 && oy >= field.maxHeight) return 1;
  const step = Math.min(field.cellX, field.cellZ);
  let s = step;
  for (let i = 0; i < SHADOW_MAX_STEPS; i++, s += step) {
    const x = ox + hx * s;
    const z = oz + hz * s;
    const fh = fieldHeight(field, x, z);
    const rayH = oy + rise * s;
    if (fh > rayH + SHADOW_BIAS_EPSILON) return 0;
    // The ray only rises (the domain floor guarantees dir.y > 0): once it
    // clears the tallest occluder, nothing further can block it.
    if (rise >= 0 && rayH >= field.maxHeight) break;
  }
  return 1;
}
