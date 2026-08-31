import { VIEW_DIR } from '../shared/iso.js';

export const GRID_N = 12;

export interface Placement {
  i: number;
  j: number;
  primId: string;
  key: number;
}

export function depthOfCell(i: number, j: number): number {
  return VIEW_DIR[0] * (i + 0.5) + VIEW_DIR[2] * (j + 0.5);
}

export class World {
  private cells: (string | null)[] = new Array(GRID_N * GRID_N).fill(null);

  place(i: number, j: number, primId: string): void {
    this.cells[i * GRID_N + j] = primId;
  }

  erase(i: number, j: number): void {
    this.cells[i * GRID_N + j] = null;
  }

  clear(): void {
    this.cells.fill(null);
  }

  list(): Placement[] {
    const out: Placement[] = [];
    for (let i = 0; i < GRID_N; i++) {
      for (let j = 0; j < GRID_N; j++) {
        const primId = this.cells[i * GRID_N + j];
        if (primId) {
          out.push({ i, j, primId, key: depthOfCell(i, j) });
        }
      }
    }
    out.sort((a, b) => a.key - b.key);
    return out;
  }
}
