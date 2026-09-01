import { SCREEN_UP, VIEW_DIR, groundToScreen, screenToGround } from '../shared/iso.js';
import {
  RUNTIME_PPU,
  bakeSpriteLayers,
  layerFromBundle,
  layersToSet,
  type SpriteLayer,
} from './assets.js';
import { Renderer } from './renderer.js';
import { World, type DisplayMode } from './world.js';

const PPU = RUNTIME_PPU;
const MARGIN = 8;
const GRID_N = 12;

const GRID_COLORS: [number, number, number] = [0.145, 0.153, 0.173];
const GRID_COLORS_ALT: [number, number, number] = [0.169, 0.178, 0.2];
const HIGHLIGHT_COLOR: [number, number, number] = [0.55, 0.62, 0.75];

const statusEl = document.getElementById('status')!;
const canvas = document.getElementById('view') as HTMLCanvasElement;

const layers: SpriteLayer[] = bakeSpriteLayers();
let sprites = layersToSet(layers);
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

function pickGround(px: number, py: number): [number, number] {
  return screenToGround((px - originX) / PPU, -(py - originY) / PPU);
}

const renderer = new Renderer(
  canvas,
  sprites.albedoLayers,
  sprites.renderLayers,
  sprites.gbufferLayers,
  sprites.maxW,
  sprites.maxH,
);

interface LightState {
  azimuthDeg: number;
  elevationDeg: number;
  intensity: number;
  colorHex: string;
  ambient: number;
  enabled: boolean;
}

const light: LightState = {
  azimuthDeg: 60,
  elevationDeg: 45,
  intensity: 1.2,
  colorHex: '#fff1dd',
  ambient: 0.4,
  enabled: true,
};

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function updateLightUniforms(): void {
  // Global dynamic-light switch: baked sprites are unaffected either way;
  // unlit sprites receive no key or ambient light while disabled.
  if (!light.enabled) {
    renderer.setLight({ dir: [0, 1, 0], key: [0, 0, 0], ambient: [0, 0, 0] });
    return;
  }
  const az = (light.azimuthDeg * Math.PI) / 180;
  const el = (light.elevationDeg * Math.PI) / 180;
  const dir: [number, number, number] = [
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az),
  ];
  const r = srgbToLinear(parseInt(light.colorHex.slice(1, 3), 16) / 255) * light.intensity;
  const g = srgbToLinear(parseInt(light.colorHex.slice(3, 5), 16) / 255) * light.intensity;
  const b = srgbToLinear(parseInt(light.colorHex.slice(5, 7), 16) / 255) * light.intensity;
  renderer.setLight({
    dir,
    key: [r, g, b],
    ambient: [light.ambient, light.ambient, light.ambient],
  });
}

function bindLightInput(
  id: string,
  outId: string,
  format: (v: number) => string,
  apply: (v: number) => void,
): void {
  const input = document.getElementById(id) as HTMLInputElement;
  const output = document.getElementById(outId)!;
  input.addEventListener('input', () => {
    apply(Number(input.value));
    output.textContent = format(Number(input.value));
  });
}

bindLightInput('light-az', 'light-az-v', (v) => `${v}°`, (v) => (light.azimuthDeg = v));
bindLightInput('light-el', 'light-el-v', (v) => `${v}°`, (v) => (light.elevationDeg = v));
bindLightInput('light-int', 'light-int-v', (v) => v.toFixed(2), (v) => (light.intensity = v));
bindLightInput('light-amb', 'light-amb-v', (v) => v.toFixed(2), (v) => (light.ambient = v));
(document.getElementById('light-color') as HTMLInputElement).addEventListener('input', (e) => {
  light.colorHex = (e.target as HTMLInputElement).value;
});
(document.getElementById('light-on') as HTMLInputElement).addEventListener('change', (e) => {
  light.enabled = (e.target as HTMLInputElement).checked;
});
(document.getElementById('default-mode') as HTMLSelectElement).addEventListener('change', (e) => {
  defaultDisplayMode = (e.target as HTMLSelectElement).value as DisplayMode;
});

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
world.place(6, 2, 'slab');

let tool = 'cube';
let hover: [number, number] | null = null;
let instances = new Float32Array(256 * 12);
const highlightData = new Float32Array(6 * 5);
let defaultDisplayMode: DisplayMode = 'unlit';

function renderFrame(): void {
  updateLightUniforms();
  const placed = world.list();
  if (instances.length < placed.length * 12) {
    instances = new Float32Array(Math.max(placed.length * 12, instances.length * 2));
  }
  let count = 0;
  for (const p of placed) {
    const layer = layerOf.get(p.primId) ?? 0;
    const scale = PPU / sprites.ppus[layer];
    const [ox, oy] = sprites.origins[layer];
    const [w, h] = sprites.sizes[layer];
    const [cx, cy] = toPx(p.x, p.z);
    // Baked mode silently falls back to unlit when the layer has no
    // baked render pass (v3 bundles, boot bakes).
    const baked = p.displayMode === 'baked' && sprites.renderLayers[layer] ? 1 : 0;
    instances[count * 12] = cx - ox * scale;
    instances[count * 12 + 1] = cy - oy * scale;
    instances[count * 12 + 2] = layer;
    instances[count * 12 + 3] = VIEW_DIR[0] * p.x + VIEW_DIR[2] * p.z;
    instances[count * 12 + 4] = w * scale;
    instances[count * 12 + 5] = h * scale;
    instances[count * 12 + 6] = w;
    instances[count * 12 + 7] = h;
    instances[count * 12 + 8] = baked;
    instances[count * 12 + 9] = 0;
    instances[count * 12 + 10] = 0;
    instances[count * 12 + 11] = 0;
    count++;
  }

  let highlight: Float32Array | null = null;
  if (hover) {
    const [gx, gz] = hover;
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
    push(gx - 0.5, gz - 0.5);
    push(gx + 0.5, gz - 0.5);
    push(gx + 0.5, gz + 0.5);
    push(gx - 0.5, gz - 0.5);
    push(gx + 0.5, gz + 0.5);
    push(gx - 0.5, gz + 0.5);
  }

  renderer.render(instances, count, highlight);
}

function setStatus(): void {
  const pos = hover
    ? `(${hover[0].toFixed(2)}, ${hover[1].toFixed(2)})`
    : 'outside ground';
  statusEl.textContent = `tool: ${tool} — ${pos} — left-click/drag places, right-click erases`;
}

function applyTool(gx: number, gz: number): void {
  if (tool === 'eraser') {
    world.removeAt(gx, gz);
  } else if (tool !== 'mode') {
    world.place(gx - 0.5, gz - 0.5, tool, defaultDisplayMode);
  }
}

/** The mode-toggle tool flips an existing placement on click (not drag). */
function toggleMode(gx: number, gz: number): void {
  const p = world.toggleModeAt(gx, gz);
  if (p) statusEl.textContent = `${p.primId} -> ${p.displayMode}`;
}

function pointerGround(e: PointerEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
  return pickGround(px, py);
}

canvas.addEventListener('pointermove', (e) => {
  hover = pointerGround(e);
  if (e.buttons & 1) applyTool(hover[0], hover[1]);
  setStatus();
});

canvas.addEventListener('pointerdown', (e) => {
  const [gx, gz] = pointerGround(e);
  if (e.button === 2) {
    world.removeAt(gx, gz);
  } else if (e.button === 0) {
    if (tool === 'mode') {
      toggleMode(gx, gz);
    } else {
      applyTool(gx, gz);
    }
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
  if (target.id === 'clear') {
    world.clear();
    return;
  }
  if (!target.dataset.tool) return;
  activateTool(target);
});

function activateTool(target: HTMLElement): void {
  tool = target.dataset.tool!;
  for (const el of toolbar.querySelectorAll('button')) {
    el.classList.toggle('active', el === target);
  }
  setStatus();
}

const fileInput = document.getElementById('load-zip') as HTMLInputElement;
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void loadBundle(file);
});

function uniqueId(base: string): string {
  if (!layerOf.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!layerOf.has(id)) return id;
  }
}

async function loadBundle(file: File): Promise<void> {
  statusEl.textContent = `Loading ${file.name}…`;
  try {
    const layer = await layerFromBundle(await file.arrayBuffer());
    layer.id = uniqueId(layer.id);
    layers.push(layer);
    sprites = layersToSet(layers);
    layerOf.set(layer.id, sprites.ids.length - 1);
    renderer.setSprites(
      sprites.albedoLayers,
      sprites.renderLayers,
      sprites.gbufferLayers,
      sprites.maxW,
      sprites.maxH,
    );
    const button = document.createElement('button');
    button.dataset.tool = layer.id;
    button.textContent = layer.id;
    toolbar.insertBefore(button, toolbar.querySelector('[data-tool="eraser"]'));
    activateTool(button);
    world.place(9.5, 5.5, layer.id, defaultDisplayMode);
    const [w, h] = sprites.sizes[layerOf.get(layer.id)!];
    statusEl.textContent = `Loaded ${layer.id} — ${w}x${h} px @ ${layer.pxPerUnit} px/unit${layer.render ? ' — baked render available' : ''}`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Load failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

setStatus();
const raf = () => {
  renderFrame();
  requestAnimationFrame(raf);
};
raf();
