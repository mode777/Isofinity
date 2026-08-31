import { SCREEN_UP, groundToScreen, screenToGround } from '../shared/iso.js';
import { RUNTIME_PPU, bakeSprites } from './assets.js';
import { Renderer } from './renderer.js';
import { GRID_N, World } from './world.js';

const PPU = RUNTIME_PPU;
const MARGIN = 8;

const GRID_COLORS: [number, number, number] = [0.145, 0.153, 0.173];
const GRID_COLORS_ALT: [number, number, number] = [0.169, 0.178, 0.2];
const HIGHLIGHT_COLOR: [number, number, number] = [0.55, 0.62, 0.75];

const statusEl = document.getElementById('status')!;
const canvas = document.getElementById('view') as HTMLCanvasElement;

const sprites = bakeSprites();
const layerOf = new Map(sprites.ids.map((id, k) => [id, k]));

let minU = Infinity;
let maxU = -Infinity;
let minV = Infinity;
for (const [x, z] of [
  [0, 0],
  [GRID_N, 0],
  [0, GRID_N],
  [GRID_N, GRID_N],
] as const) {
  const [u, v] = groundToScreen(x, z);
  minU = Math.min(minU, u);
  maxU = Math.max(maxU, u);
  minV = Math.min(minV, v);
}
const maxV = SCREEN_UP[1];

canvas.width = Math.ceil((maxU - minU) * PPU) + MARGIN * 2;
canvas.height = Math.ceil((maxV - minV) * PPU) + MARGIN * 2;
const originX = -minU * PPU + MARGIN;
const originY = maxV * PPU + MARGIN;

function toPx(x: number, z: number): [number, number] {
  const [u, v] = groundToScreen(x, z);
  return [originX + u * PPU, originY - v * PPU];
}

function pickCell(px: number, py: number): [number, number] | null {
  const [x, z] = screenToGround((px - originX) / PPU, -(py - originY) / PPU);
  const i = Math.floor(x);
  const j = Math.floor(z);
  if (i < 0 || j < 0 || i >= GRID_N || j >= GRID_N) return null;
  return [i, j];
}

const renderer = new Renderer(canvas, sprites.layers, sprites.width, sprites.height);

{
  const ground = new Float32Array(GRID_N * GRID_N * 6 * 5);
  let o = 0;
  const push = (x: number, z: number, c: [number, number, number]) => {
    const [px, py] = toPx(x, z);
    ground[o++] = px;
    ground[o++] = py;
    ground[o++] = c[0];
    ground[o++] = c[1];
    ground[o++] = c[2];
  };
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const c = (i + j) % 2 === 0 ? GRID_COLORS : GRID_COLORS_ALT;
      push(i, j, c);
      push(i + 1, j, c);
      push(i + 1, j + 1, c);
      push(i, j, c);
      push(i + 1, j + 1, c);
      push(i, j + 1, c);
    }
  }
  renderer.setGround(ground);
}

const world = new World();
world.place(3, 3, 'cube');
world.place(4, 4, 'cube');
world.place(5, 4, 'sphere');
world.place(7, 6, 'donut');
world.place(2, 7, 'cylinder');
world.place(8, 3, 'capsule');
world.place(5, 8, 'plane');

let tool = 'cube';
let hover: [number, number] | null = null;
const instances = new Float32Array(GRID_N * GRID_N * 3);
const highlightData = new Float32Array(6 * 5);

function renderFrame(): void {
  const scale = PPU / RUNTIME_PPU;
  let count = 0;
  for (const p of world.list()) {
    const [cx, cy] = toPx(p.i, p.j);
    instances[count * 3] = cx - sprites.originPx[0] * scale;
    instances[count * 3 + 1] = cy - sprites.originPx[1] * scale;
    instances[count * 3 + 2] = layerOf.get(p.primId) ?? 0;
    count++;
  }

  let highlight: Float32Array | null = null;
  if (hover) {
    const [i, j] = hover;
    highlight = highlightData;
    let o = 0;
    const push = (x: number, z: number) => {
      const [px, py] = toPx(x, z);
      highlight![o++] = px;
      highlight![o++] = py;
      highlight![o++] = HIGHLIGHT_COLOR[0];
      highlight![o++] = HIGHLIGHT_COLOR[1];
      highlight![o++] = HIGHLIGHT_COLOR[2];
    };
    push(i, j);
    push(i + 1, j);
    push(i + 1, j + 1);
    push(i, j);
    push(i + 1, j + 1);
    push(i, j + 1);
  }

  renderer.render(instances, count, highlight);
}

function setStatus(): void {
  const cell = hover ? `cell (${hover[0]}, ${hover[1]})` : 'outside grid';
  statusEl.textContent = `tool: ${tool} — ${cell} — left-click/drag places, right-click erases`;
}

function applyTool(i: number, j: number): void {
  if (tool === 'eraser') {
    world.erase(i, j);
  } else {
    world.place(i, j, tool);
  }
}

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
  hover = pickCell(px, py);
  if (hover && e.buttons & 1) applyTool(hover[0], hover[1]);
  setStatus();
});

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
  const cell = pickCell(px, py);
  if (!cell) return;
  if (e.button === 2) {
    world.erase(cell[0], cell[1]);
  } else if (e.button === 0) {
    applyTool(cell[0], cell[1]);
  }
  setStatus();
});

canvas.addEventListener('pointerleave', () => {
  hover = null;
  setStatus();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const toolbar = document.getElementById('toolbar')!;
toolbar.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.dataset.tool) return;
  if (target.id === 'clear') {
    world.clear();
    return;
  }
  tool = target.dataset.tool;
  for (const el of toolbar.querySelectorAll('button')) {
    el.classList.toggle('active', el === target);
  }
  setStatus();
});

setStatus();
const raf = () => {
  renderFrame();
  requestAnimationFrame(raf);
};
raf();
