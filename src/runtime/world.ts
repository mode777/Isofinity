import { VIEW_DIR } from '../shared/iso.js';

export interface Placement {
  x: number;
  z: number;
  primId: string;
  key: number;
}

export function depthOf(x: number, z: number): number {
  return VIEW_DIR[0] * (x + 0.5) + VIEW_DIR[2] * (z + 0.5);
}

export class World {
  private items: Placement[] = [];

  place(x: number, z: number, primId: string): void {
    this.items.push({ x, z, primId, key: depthOf(x, z) });
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
