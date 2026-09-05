import { VIEW_DIR, type ViewSlot } from '../shared/iso.js';

export interface Placement {
  x: number;
  z: number;
  /** Height above the ground plane (world units, >= 0). */
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

  place(x: number, z: number, primId: string, y = 0, dir: ViewSlot = 'n'): void {
    this.items.push({ x, z, y, primId, dir, key: depthOf(x, y, z) });
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

  clear(): void {
    this.items.length = 0;
  }

  list(): Placement[] {
    return [...this.items].sort((a, b) => a.key - b.key);
  }
}
