import { VIEW_DIR, type ViewSlot } from '../shared/iso.js';

export interface Placement {
  x: number;
  z: number;
  /**
   * Height offset from the ground plane (world units; negative sinks the
   * placement below the plane).
   */
  y: number;
  primId: string;
  /**
   * Which baked view slot the placement stands in (the rotated asset's
   * direction, ADR 0005). Depth/sort stays direction-independent: every
   * slot is rendered from the same fixed camera.
   */
  dir: ViewSlot;
  /**
   * Grounding-shadow strength of this placement (0 = off, 1 = full).
   * Persisted per placement in `isoinfinity-world/5` (omitted at the
   * default 1).
   */
  shadow: number;
  key: number;
}

/**
 * A placed dynamic mesh (the built-in character). Editor-session state
 * only — never serialized into world files (ADR 0006). Depth/sort use the
 * same reference-plane key as sprite placements, so erase resolves the
 * topmost placement across kinds.
 */
export interface MeshPlacement {
  /** Stable per-document id; keys the engine-side animation players. */
  id: number;
  meshId: string;
  x: number;
  z: number;
  /** Height offset from the ground plane (world units). */
  y: number;
  /** Facing, radians about +Y. */
  yaw: number;
  key: number;
}

/**
 * A placed point light (deferred-lighting placement kind). `x`/`z` are the
 * footprint min corner — the emitting position sits at the cell center
 * (x+0.5, y, z+0.5), exactly where the cursor was — so erase/picking ride
 * the shared unit-cell machinery. `colorHex` is the sRGB picker value; the
 * renderer receives it converted to linear. Persisted in
 * `isoinfinity-world/6`.
 */
export interface LightPlacement {
  /** Stable per-document id (unique across meshes and lights). */
  id: number;
  x: number;
  z: number;
  /** Emitter height above the ground plane (world units). */
  y: number;
  /** Falloff radius (world units; contribution reaches zero at the edge). */
  radius: number;
  /** Radiance scale. */
  energy: number;
  /** Emitted color as sRGB hex (#rrggbb). */
  colorHex: string;
  key: number;
}

/**
 * Painter sort key: the cell-center depth against the global reference
 * plane, including the height term. Far → near drawing order keeps the
 * alpha-blended antialiased edges correct; the per-pixel depth test does
 * the rest regardless of order.
 */
export function depthOf(x: number, y: number, z: number): number {
  return VIEW_DIR[0] * (x + 0.5) + VIEW_DIR[1] * y + VIEW_DIR[2] * (z + 0.5);
}

export class World {
  private items: Placement[] = [];
  private meshItems: MeshPlacement[] = [];
  private lightItems: LightPlacement[] = [];
  private nextMeshId = 1;

  place(x: number, z: number, primId: string, y = 0, dir: ViewSlot = 'n', shadow = 1): void {
    this.items.push({ x, z, y, primId, dir, shadow, key: depthOf(x, y, z) });
  }

  /** Place a dynamic mesh; returns its stable placement id. */
  placeMesh(meshId: string, x: number, z: number, y = 0, yaw = 0): number {
    const id = this.nextMeshId++;
    this.meshItems.push({ id, meshId, x, z, y, yaw, key: depthOf(x, y, z) });
    return id;
  }

  /**
   * Place a point light at the given footprint corner (the emitter sits at
   * the cell center); returns its stable placement id.
   */
  placeLight(
    x: number,
    z: number,
    y: number,
    radius: number,
    energy: number,
    colorHex: string,
  ): number {
    const id = this.nextMeshId++;
    this.lightItems.push({ id, x, z, y, radius, energy, colorHex, key: depthOf(x, y, z) });
    return id;
  }

  /** Update a placed light's properties; re-keys its sort depth. */
  updateLight(
    id: number,
    patch: Partial<Pick<LightPlacement, 'x' | 'z' | 'y' | 'radius' | 'energy' | 'colorHex'>>,
  ): void {
    const light = this.lightItems.find((l) => l.id === id);
    if (!light) return;
    Object.assign(light, patch);
    light.key = depthOf(light.x, light.y, light.z);
  }

  lightAt(id: number): LightPlacement | null {
    return this.lightItems.find((l) => l.id === id) ?? null;
  }

  /** Remove a placed light by id; true when one was removed. */
  removeLight(id: number): boolean {
    const k = this.lightItems.findIndex((l) => l.id === id);
    if (k < 0) return false;
    this.lightItems.splice(k, 1);
    return true;
  }

  removeAt(x: number, z: number): Placement | null {
    let best = -1;
    for (let k = 0; k < this.items.length; k++) {
      const p = this.items[k];
      if (x >= p.x && x <= p.x + 1 && z >= p.z && z <= p.z + 1) {
        if (best < 0 || p.key > this.items[best].key) best = k;
      }
    }
    if (best < 0) return null;
    const [removed] = this.items.splice(best, 1);
    return removed;
  }

  /**
   * Topmost placement at the cursor across kinds (greatest depth key
   * within the unit-cell footprint): a sprite placement, a mesh placement,
   * or a point light, whichever is nearer.
   */
  removeTopAt(
    x: number,
    z: number,
  ):
    | { kind: 'sprite'; placement: Placement }
    | { kind: 'mesh'; placement: MeshPlacement }
    | { kind: 'light'; placement: LightPlacement }
    | null {
    let bestSprite = -1;
    for (let k = 0; k < this.items.length; k++) {
      const p = this.items[k];
      if (x >= p.x && x <= p.x + 1 && z >= p.z && z <= p.z + 1) {
        if (bestSprite < 0 || p.key > this.items[bestSprite].key) bestSprite = k;
      }
    }
    let bestMesh = -1;
    for (let k = 0; k < this.meshItems.length; k++) {
      const p = this.meshItems[k];
      if (x >= p.x && x <= p.x + 1 && z >= p.z && z <= p.z + 1) {
        if (bestMesh < 0 || p.key > this.meshItems[bestMesh].key) bestMesh = k;
      }
    }
    let bestLight = -1;
    for (let k = 0; k < this.lightItems.length; k++) {
      const p = this.lightItems[k];
      if (x >= p.x && x <= p.x + 1 && z >= p.z && z <= p.z + 1) {
        if (bestLight < 0 || p.key > this.lightItems[bestLight].key) bestLight = k;
      }
    }
    const best = Math.max(
      bestSprite >= 0 ? this.items[bestSprite].key : -Infinity,
      bestMesh >= 0 ? this.meshItems[bestMesh].key : -Infinity,
      bestLight >= 0 ? this.lightItems[bestLight].key : -Infinity,
    );
    if (best === -Infinity) return null;
    if (bestLight >= 0 && this.lightItems[bestLight].key === best) {
      const [placement] = this.lightItems.splice(bestLight, 1);
      return { kind: 'light', placement };
    }
    if (bestMesh >= 0 && this.meshItems[bestMesh].key === best) {
      const [placement] = this.meshItems.splice(bestMesh, 1);
      return { kind: 'mesh', placement };
    }
    const [placement] = this.items.splice(bestSprite, 1);
    return { kind: 'sprite', placement };
  }

  clear(): void {
    this.items.length = 0;
    this.meshItems.length = 0;
    this.lightItems.length = 0;
  }

  list(): Placement[] {
    return [...this.items].sort((a, b) => a.key - b.key);
  }

  /** Dynamic-mesh placements, far → near. */
  listMeshes(): MeshPlacement[] {
    return [...this.meshItems].sort((a, b) => a.key - b.key);
  }

  /** Point-light placements, far → near (first 16 are the render cap). */
  listLights(): LightPlacement[] {
    return [...this.lightItems].sort((a, b) => a.key - b.key);
  }
}
