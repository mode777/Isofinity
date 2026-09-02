import { SCREEN_UP, VIEW_DIR, groundToScreen, screenToGround } from '../shared/iso.js';
import { sunDirection } from '../shared/sun.js';
import {
  RUNTIME_PPU,
  bakeSpriteLayers,
  layerFromBundle,
  layersToSet,
  type SpriteLayer,
  type SpriteSet,
} from './assets.js';
import { Renderer } from './renderer.js';
import { World } from './world.js';
import { APP_VERSION } from '../version.js';
import {
  BUNDLE_EXT,
  initWorkspace,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  type WorkspaceState,
} from '../shared/workspace.js';
import { fillSelect, mountWorkspaceControl } from '../shared/workspace-ui.js';

const PPU = RUNTIME_PPU;
const MARGIN = 8;
const GRID_N = 12;

document.getElementById('app-version')!.textContent = APP_VERSION;

const GRID_COLORS: [number, number, number] = [0.145, 0.153, 0.173];
const GRID_COLORS_ALT: [number, number, number] = [0.169, 0.178, 0.2];
const HIGHLIGHT_COLOR: [number, number, number] = [0.55, 0.62, 0.75];

const statusEl = document.getElementById('status')!;
const canvas = document.getElementById('view') as HTMLCanvasElement;

let layers: SpriteLayer[] = [];
let sprites: SpriteSet;
let layerOf = new Map<string, number>();
let renderer: Renderer;

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

interface LightState {
  azimuthDeg: number;
  elevationDeg: number;
  intensity: number;
  colorHex: string;
  ambientHex: string;
  enabled: boolean;
}

const light: LightState = {
  azimuthDeg: 60,
  elevationDeg: 45,
  intensity: 1.2,
  colorHex: '#fff1dd',
  ambientHex: '#a8a8a8',
  enabled: true,
};

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function srgbHexToLinearRgb(hex: string): [number, number, number] {
  return [
    srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255),
    srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255),
    srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255),
  ];
}

function updateLightUniforms(): void {
  // Global dynamic-light switch: pin shading to identity — sprites show the
  // pure prerendered image, the ground its flat vertex color. (Zeroing
  // ambient too would multiply everything to black.)
  if (!light.enabled) {
    renderer.setLight({ dir: [0, 1, 0], key: [0, 0, 0], ambient: [1, 1, 1] });
    return;
  }
  const az = (light.azimuthDeg * Math.PI) / 180;
  const el = (light.elevationDeg * Math.PI) / 180;
  const dir: [number, number, number] = [
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az),
  ];
  const kr = srgbHexToLinearRgb(light.colorHex);
  const intensity = light.intensity;
  renderer.setLight({
    dir,
    key: [kr[0] * intensity, kr[1] * intensity, kr[2] * intensity],
    ambient: srgbHexToLinearRgb(light.ambientHex),
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
(document.getElementById('light-ambient') as HTMLInputElement).addEventListener('input', (e) => {
  light.ambientHex = (e.target as HTMLInputElement).value;
});
(document.getElementById('light-color') as HTMLInputElement).addEventListener('input', (e) => {
  light.colorHex = (e.target as HTMLInputElement).value;
});
(document.getElementById('light-on') as HTMLInputElement).addEventListener('change', (e) => {
  light.enabled = (e.target as HTMLInputElement).checked;
});

const azInput = document.getElementById('light-az') as HTMLInputElement;
const elInput = document.getElementById('light-el') as HTMLInputElement;
const azOutput = document.getElementById('light-az-v')!;
const elOutput = document.getElementById('light-el-v')!;
const sunHourInput = document.getElementById('sun-hour') as HTMLInputElement;
const sunDayInput = document.getElementById('sun-day') as HTMLInputElement;
const sunLatInput = document.getElementById('sun-lat') as HTMLInputElement;

// Sun-position sliders overwrite the manual azimuth/elevation state and
// sync the manual sliders + readouts to the computed sun.
function syncManualSliders(): void {
  azInput.value = String(light.azimuthDeg);
  elInput.value = String(light.elevationDeg);
  azOutput.textContent = `${light.azimuthDeg}°`;
  elOutput.textContent = `${light.elevationDeg}°`;
}

function applySunPosition(): void {
  const sun = sunDirection(
    Number(sunDayInput.value),
    Number(sunHourInput.value),
    Number(sunLatInput.value),
  );
  // Clamp elevation into the manual slider's range (nights become a
  // grazing light) and keep azimuth in [0, 360).
  const clampedEl = Math.min(
    Number(elInput.max),
    Math.max(Number(elInput.min), sun.elevationDeg),
  );
  light.azimuthDeg = Math.round(sun.azimuthDeg) % 360;
  light.elevationDeg = Math.round(clampedEl);
  syncManualSliders();
}

function formatHour(v: number): string {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function bindSunInput(id: string, outId: string, format: (v: number) => string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  const output = document.getElementById(outId)!;
  input.addEventListener('input', () => {
    output.textContent = format(Number(input.value));
    applySunPosition();
  });
}

bindSunInput('sun-hour', 'sun-hour-v', formatHour);
bindSunInput('sun-day', 'sun-day-v', (v) => String(v));
bindSunInput('sun-lat', 'sun-lat-v', (v) => `${v}°`);

const world = new World();

let tool = 'cube';
let hover: [number, number] | null = null;
let instances = new Float32Array(256 * 8);
const highlightData = new Float32Array(6 * 5);

function renderFrame(): void {
  updateLightUniforms();
  const placed = world.list();
  if (instances.length < placed.length * 8) {
    instances = new Float32Array(Math.max(placed.length * 8, instances.length * 2));
  }
  let count = 0;
  for (const p of placed) {
    const layer = layerOf.get(p.primId) ?? 0;
    const scale = PPU / sprites.ppus[layer];
    const [ox, oy] = sprites.origins[layer];
    const [w, h] = sprites.sizes[layer];
    const [cx, cy] = toPx(p.x, p.z);
    instances[count * 8] = cx - ox * scale;
    instances[count * 8 + 1] = cy - oy * scale;
    instances[count * 8 + 2] = layer;
    instances[count * 8 + 3] = VIEW_DIR[0] * p.x + VIEW_DIR[2] * p.z;
    instances[count * 8 + 4] = w * scale;
    instances[count * 8 + 5] = h * scale;
    instances[count * 8 + 6] = w;
    instances[count * 8 + 7] = h;
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
  } else {
    world.place(gx - 0.5, gz - 0.5, tool);
  }
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
    applyTool(gx, gz);
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

// Workspace integration: sprite + world pickers, scene save/load.
const wsSpriteSelect = document.getElementById('ws-sprite') as HTMLSelectElement;
const wsSpriteRefresh = document.getElementById('ws-sprite-refresh') as HTMLButtonElement;
const worldNameInput = document.getElementById('world-name') as HTMLInputElement;
const saveWorldButton = document.getElementById('save-world') as HTMLButtonElement;
const wsWorldSelect = document.getElementById('ws-world') as HTMLSelectElement;
const wsWorldRefresh = document.getElementById('ws-world-refresh') as HTMLButtonElement;

const fileInput = document.getElementById('load-zip') as HTMLInputElement;
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  wsSpriteSelect.value = '';
  if (file) void loadBundle(file);
});

const WORLD_FORMAT = 'isoinfinity-world/1';
const SPRITE_EXTS = [BUNDLE_EXT, '.zip'];
const WORLD_EXTS = ['.json'];

interface WorldFile {
  format: string;
  name?: string;
  savedAt?: string;
  sprites: { asset: string; x: number; z: number }[];
  light: {
    azimuthDeg: number;
    elevationDeg: number;
    intensity: number;
    colorHex: string;
    ambientHex: string;
    enabled: boolean;
  };
  sun: { hour: number; day: number; lat: number };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validate a world file completely before anything is mutated. */
function parseWorldFile(text: string, fileName: string): WorldFile {
  const fail = (why: string): Error =>
    new Error(`world "${fileName}": ${why}`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw fail(`not valid JSON — ${err instanceof Error ? err.message : String(err)}`);
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== WORLD_FORMAT) {
    throw fail(`unsupported format ${String(obj.format)} — expected ${WORLD_FORMAT}`);
  }
  const spritesRaw = obj.sprites;
  if (!Array.isArray(spritesRaw)) throw fail('missing "sprites" array');
  const sprites: WorldFile['sprites'] = [];
  for (const entry of spritesRaw) {
    const s = entry as Record<string, unknown>;
    if (typeof s.asset !== 'string' || !isFiniteNumber(s.x) || !isFiniteNumber(s.z)) {
      throw fail('malformed sprite placement (needs asset/x/z)');
    }
    sprites.push({ asset: s.asset, x: s.x, z: s.z });
  }
  const l = obj.light as Record<string, unknown> | undefined;
  if (
    !l ||
    !isFiniteNumber(l.azimuthDeg) ||
    !isFiniteNumber(l.elevationDeg) ||
    !isFiniteNumber(l.intensity) ||
    typeof l.colorHex !== 'string' ||
    typeof l.ambientHex !== 'string' ||
    typeof l.enabled !== 'boolean'
  ) {
    throw fail('malformed light state');
  }
  const sunRaw = obj.sun as Record<string, unknown> | undefined;
  if (!sunRaw || !isFiniteNumber(sunRaw.hour) || !isFiniteNumber(sunRaw.day) || !isFiniteNumber(sunRaw.lat)) {
    throw fail('malformed sun state');
  }
  return {
    format: WORLD_FORMAT,
    name: typeof obj.name === 'string' ? obj.name : fileName.replace(/\.json$/i, ''),
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : undefined,
    sprites,
    light: {
      azimuthDeg: l.azimuthDeg,
      elevationDeg: l.elevationDeg,
      intensity: l.intensity,
      colorHex: l.colorHex,
      ambientHex: l.ambientHex,
      enabled: l.enabled,
    },
    sun: { hour: sunRaw.hour, day: sunRaw.day, lat: sunRaw.lat },
  };
}

function sanitizeWorldName(raw: string): string {
  const name = raw
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^[-]+|[-]+$/g, '');
  return name || 'world';
}

function nextWorldName(names: string[]): string {
  const taken = new Set(names.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) {
    if (!taken.has(`world-${n}.json`)) return `world-${n}`;
  }
}

function buildWorldFile(name: string): WorldFile {
  return {
    format: WORLD_FORMAT,
    name,
    savedAt: new Date().toISOString(),
    sprites: world.list().map((p) => ({ asset: p.primId, x: p.x, z: p.z })),
    light: {
      azimuthDeg: light.azimuthDeg,
      elevationDeg: light.elevationDeg,
      intensity: light.intensity,
      colorHex: light.colorHex,
      ambientHex: light.ambientHex,
      enabled: light.enabled,
    },
    sun: {
      hour: Number(sunHourInput.value),
      day: Number(sunDayInput.value),
      lat: Number(sunLatInput.value),
    },
  };
}

async function refreshWorldPicker(): Promise<void> {
  try {
    const names = await listWorkspaceFiles('worlds', WORLD_EXTS);
    fillSelect(wsWorldSelect, names, 'load world…');
    worldNameInput.value = nextWorldName(names);
  } catch (err) {
    statusEl.textContent = `Workspace: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function saveWorld(): Promise<void> {
  const name = sanitizeWorldName(worldNameInput.value);
  worldNameInput.value = name;
  const file = `${name}.json`;
  try {
    const json = JSON.stringify(buildWorldFile(name), null, 2);
    await writeWorkspaceFile('worlds', file, new TextEncoder().encode(json));
    statusEl.textContent = `Saved world "${name}" to worlds/${file}`;
    await refreshWorldPicker();
    wsWorldSelect.value = file;
  } catch (err) {
    statusEl.textContent = `World save failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
}

/** Push the restored light/sun state into the panel's inputs and outputs. */
function restoreLight(data: WorldFile): void {
  const sunOut = (id: string, text: string): void => {
    document.getElementById(id)!.textContent = text;
  };
  sunHourInput.value = String(data.sun.hour);
  sunDayInput.value = String(data.sun.day);
  sunLatInput.value = String(data.sun.lat);
  sunOut('sun-hour-v', formatHour(data.sun.hour));
  sunOut('sun-day-v', String(data.sun.day));
  sunOut('sun-lat-v', `${data.sun.lat}°`);
  applySunPosition();
  // The saved manual sliders win over the recomputed sun, so a scene
  // saved with hand-tweaked angles restores exactly.
  light.azimuthDeg = data.light.azimuthDeg;
  light.elevationDeg = data.light.elevationDeg;
  light.intensity = data.light.intensity;
  light.colorHex = data.light.colorHex;
  light.ambientHex = data.light.ambientHex;
  light.enabled = data.light.enabled;
  const set = (id: string, value: string): void => {
    (document.getElementById(id) as HTMLInputElement).value = value;
  };
  set('light-color', data.light.colorHex);
  set('light-ambient', data.light.ambientHex);
  (document.getElementById('light-on') as HTMLInputElement).checked = data.light.enabled;
  set('light-int', String(data.light.intensity));
  sunOut('light-int-v', data.light.intensity.toFixed(2));
  syncManualSliders();
}

async function loadWorld(fileName: string): Promise<void> {
  statusEl.textContent = `Loading world ${fileName}…`;
  try {
    const file = await readWorkspaceFile('worlds', fileName);
    const data = parseWorldFile(await file.text(), fileName);
    // Everything validated — only now mutate the scene.
    world.clear();
    const skipped: string[] = [];
    let placed = 0;
    for (const s of data.sprites) {
      if (!layerOf.has(s.asset)) {
        if (!skipped.includes(s.asset)) skipped.push(s.asset);
        continue;
      }
      world.place(s.x, s.z, s.asset);
      placed++;
    }
    restoreLight(data);
    statusEl.textContent =
      `Loaded world "${data.name}" — ${placed} placed` +
      (skipped.length > 0 ? `, skipped missing assets: ${skipped.join(', ')}` : '');
  } catch (err) {
    statusEl.textContent = `World load failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
}

async function refreshSpritePicker(): Promise<void> {
  try {
    fillSelect(wsSpriteSelect, await listWorkspaceFiles('sprites', SPRITE_EXTS), 'workspace sprites…');
  } catch (err) {
    statusEl.textContent = `Workspace: ${err instanceof Error ? err.message : String(err)}`;
  }
}

wsSpriteSelect.addEventListener('change', () => {
  const name = wsSpriteSelect.value;
  if (!name) return;
  void readWorkspaceFile('sprites', name).then(loadBundle);
});
wsSpriteRefresh.addEventListener('click', () => void refreshSpritePicker());
saveWorldButton.addEventListener('click', () => void saveWorld());
wsWorldSelect.addEventListener('change', () => {
  const name = wsWorldSelect.value;
  if (name) void loadWorld(name);
});
wsWorldRefresh.addEventListener('click', () => void refreshWorldPicker());

function setWorkspaceUi(state: WorkspaceState): void {
  const show = state.kind === 'connected';
  wsSpriteSelect.hidden = !show;
  wsSpriteRefresh.hidden = !show;
  worldNameInput.hidden = !show;
  saveWorldButton.hidden = !show;
  wsWorldSelect.hidden = !show;
  wsWorldRefresh.hidden = !show;
  if (show) {
    void refreshSpritePicker();
    void refreshWorldPicker();
  }
}

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
    world.place(9.5, 5.5, layer.id);
    const [w, h] = sprites.sizes[layerOf.get(layer.id)!];
    statusEl.textContent = `Loaded ${layer.id} — ${w}x${h} px @ ${layer.pxPerUnit} px/unit`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Load failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function main(): Promise<void> {
  statusEl.textContent = 'Baking sprites…';
  try {
    layers = await bakeSpriteLayers();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Boot bake failed: ${err instanceof Error ? err.message : String(err)}`;
    return;
  }
  sprites = layersToSet(layers);
  layerOf = new Map(sprites.ids.map((id, k) => [id, k]));
  renderer = new Renderer(
    canvas,
    sprites.renderLayers,
    sprites.gbufferLayers,
    sprites.maxW,
    sprites.maxH,
  );

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

  world.place(3, 3, 'cube');
  world.place(4, 4, 'cube');
  world.place(5, 4, 'sphere');
  world.place(7, 6, 'donut');
  world.place(2, 7, 'cylinder');
  world.place(8, 3, 'capsule');
  world.place(5, 8, 'plane');
  world.place(6, 2, 'slab');

  setStatus();
  const raf = () => {
    renderFrame();
    requestAnimationFrame(raf);
  };
  raf();
}

mountWorkspaceControl(document.getElementById('workspace')!, {
  onStatus: (text) => (statusEl.textContent = text),
  onState: setWorkspaceUi,
});
void initWorkspace();

void main();
