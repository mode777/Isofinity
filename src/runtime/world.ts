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
  private nextMeshId = 1;

  place(x: number, z: number, primId: string, y = 0, dir: ViewSlot = 'n'): void {
    this.items.push({ x, z, y, primId, dir, key: depthOf(x, y, z) });
  }

  /** Place a dynamic mesh; returns its stable placement id. */
  placeMesh(meshId: string, x: number, z: number, y = 0, yaw = 0): number {
    const id = this.nextMeshId++;
    this.meshItems.push({ id, meshId, x, z, y, yaw, key: depthOf(x, y, z) });
    return id;
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
   * within the unit-cell footprint): a sprite placement or a mesh
   * placement, whichever is nearer.
   */
  removeTopAt(
    x: number,
    z: number,
  ): { kind: 'sprite'; placement: Placement } | { kind: 'mesh'; placement: MeshPlacement } | null {
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
    if (bestSprite < 0 && bestMesh < 0) return null;
    if (bestMesh < 0 || (bestSprite >= 0 && this.items[bestSprite].key >= this.meshItems[bestMesh].key)) {
      const [placement] = this.items.splice(bestSprite, 1);
      return { kind: 'sprite', placement };
    }
    const [placement] = this.meshItems.splice(bestMesh, 1);
    return { kind: 'mesh', placement };
  }

  clear(): void {
    this.items.length = 0;
    this.meshItems.length = 0;
  }

  list(): Placement[] {
    return [...this.items].sort((a, b) => a.key - b.key);
  }

  /** Dynamic-mesh placements, far → near. */
  listMeshes(): MeshPlacement[] {
    return [...this.meshItems].sort((a, b) => a.key - b.key);
  }
}
