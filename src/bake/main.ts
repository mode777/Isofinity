import { bakePrimitive, type BakeResult } from './bake.js';
import { buildBundle } from './bundle.js';
import {
  debugPositionCanvas,
  download,
  rgbaBytesToCanvas,
  rgbaToCanvas,
} from './export.js';
import { depthRange, type Vec3 } from './iso.js';
import { loadGltf, type GltfSource } from './gltf.js';
import type { DataTextureLoaderTexData } from 'three';
import { DEFAULT_ENVIRONMENT, DEFAULT_PT_SETTINGS, PtBaker, type PtEnvironment, type PtImage, type PtSettings } from './pt.js';
import {
  getCapsule,
  getCube,
  getCylinder,
  getDonut,
  getPlane,
  getSlab,
  getSphere,
  type Primitive,
} from './primitives.js';
import { APP_VERSION } from '../version.js';
import {
  BUNDLE_EXT,
  initWorkspace,
  listWorkspaceFiles,
  readAllWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  type WorkspaceState,
} from '../shared/workspace.js';
import { mountWorkspaceControl, fillSelect } from '../shared/workspace-ui.js';

const statusEl = document.getElementById('status')!;
document.getElementById('app-version')!.textContent = APP_VERSION;
const canvases = {
  albedo: document.getElementById('pass-albedo') as HTMLCanvasElement,
  render: document.getElementById('pass-render') as HTMLCanvasElement,
  ao: document.getElementById('pass-ao') as HTMLCanvasElement,
  gbuffer: document.getElementById('pass-gbuffer') as HTMLCanvasElement,
};
const downloadButtons = {
  bundle: document.getElementById('dl-bundle') as HTMLButtonElement,
  debug: document.getElementById('dl-debug') as HTMLButtonElement,
};
const gltfButton = document.getElementById('load-gltf') as HTMLButtonElement;
const gltfInput = document.getElementById('gltf-file') as HTMLInputElement;
const gltfScaleInput = document.getElementById('gltf-scale') as HTMLInputElement;
const sourceNameEl = document.getElementById('source-name') as HTMLSpanElement;
const hdriButton = document.getElementById('load-hdri') as HTMLButtonElement;
const hdriInput = document.getElementById('hdri-file') as HTMLInputElement;
const hdriNameEl = document.getElementById('hdri-name') as HTMLSpanElement;
const renderButton = document.getElementById('bake-render') as HTMLButtonElement;
const aoButton = document.getElementById('bake-ao') as HTMLButtonElement;
const wsModelSelect = document.getElementById('ws-model') as HTMLSelectElement;
const wsModelRefresh = document.getElementById('ws-model-refresh') as HTMLButtonElement;
const wsHdriSelect = document.getElementById('ws-hdri') as HTMLSelectElement;
const wsHdriRefresh = document.getElementById('ws-hdri-refresh') as HTMLButtonElement;

const primitiveFactories: Record<string, () => Primitive> = {
  sphere: getSphere,
  donut: getDonut,
  cube: getCube,
  cylinder: getCylinder,
  capsule: getCapsule,
  plane: getPlane,
  slab: getSlab,
};

let current: Primitive = getSphere();
let result: BakeResult | null = null;
let gbufferMode: 'gbuffer-normal' | 'gbuffer-depth' = 'gbuffer-normal';
let gltfSource: GltfSource | null = null;

// Path-traced pass state.
let ptSettings: PtSettings = { ...DEFAULT_PT_SETTINGS };
let env: PtEnvironment = { ...DEFAULT_ENVIRONMENT };
let ptBaker: PtBaker | null = null;
let ptRender: PtImage | null = null;
let ptAo: PtImage | null = null;
let renderGeneration = 0;

function readPtSettings(): void {
  const num = (id: string, lo: number, hi: number, fallback: number): number => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  };
  ptSettings = {
    samples: num('pt-samples', 16, 4096, DEFAULT_PT_SETTINGS.samples),
    bounces: num('pt-bounces', 1, 16, DEFAULT_PT_SETTINGS.bounces),
    textureSize: num('pt-texturesize', 256, 4096, DEFAULT_PT_SETTINGS.textureSize),
    aoSamples: num('ao-samples', 4, 1024, DEFAULT_PT_SETTINGS.aoSamples),
    aoRadius: num('ao-radius', 0.05, 2, DEFAULT_PT_SETTINGS.aoRadius),
    denoise: false,
  };
}

function readEnv(): void {
  const num = (id: string, lo: number, hi: number, fallback: number): number => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  };
  env.rotationDeg = num('env-rotate', 0, 360, 0);
  env.intensity = num('env-intensity', 0, 10, 1);
  env.exposure = num('env-exposure', 0.1, 4, 1);
  env.saturation = num('env-saturation', 0, 2, 1);
}

function getPtBaker(): PtBaker {
  if (!ptBaker) {
    ptBaker = new PtBaker(ptSettings);
    // The baker is created lazily (first pass click), long after the boot
    // bake — target the current source and environment explicitly.
    ptBaker.setPrimitive(current);
    ptBaker.setEnvironment(env);
  }
  return ptBaker;
}

function showPtPass(canvas: HTMLCanvasElement, image: PtImage): void {
  const shown = rgbaBytesToCanvas(image.rgba, image.width, image.height);
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, image.width, image.height);
  ctx.drawImage(shown, 0, 0);
}

function clearPtPasses(): void {
  ptRender = null;
  ptAo = null;
  for (const canvas of [canvases.render, canvases.ao]) {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  updatePtButtons();
}

function updatePtButtons(): void {
  renderButton.disabled = !result || !env.texture || !ptBakerActive;
  aoButton.disabled = !result || !ptBakerActive;
}

// Set once the first raster bake succeeded and the baker can be targeted.
let ptBakerActive = false;

async function runRenderPass(): Promise<void> {
  if (!result || !env.texture || !ptBakerActive) return;
  const generation = ++renderGeneration;
  readPtSettings();
  readEnv();
  renderButton.disabled = true;
  try {
    const baker = getPtBaker();
    baker.applySettings(ptSettings);
    baker.setEnvironment(env);
    const image = await baker.renderPass((samples, total) => {
      if (generation === renderGeneration) {
        setStatus(`${result!.label}: rendering ${samples}/${total} samples…`);
      }
    });
    if (generation !== renderGeneration) return;
    ptRender = image;
    showPtPass(canvases.render, image);
    setStatus(`${result.label}: render pass ${image.width}x${image.height} px, ${ptSettings.samples} samples`);
  } catch (err) {
    if (generation === renderGeneration) {
      setStatus(`Render pass failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
    }
  } finally {
    if (generation === renderGeneration) updatePtButtons();
  }
}

async function runAoPass(): Promise<void> {
  if (!result || !ptBakerActive) return;
  const generation = ++renderGeneration;
  readPtSettings();
  aoButton.disabled = true;
  try {
    const baker = getPtBaker();
    baker.applySettings(ptSettings);
    const image = await baker.aoPass((fraction) => {
      if (generation === renderGeneration) {
        setStatus(`${result!.label}: AO ${Math.round(fraction * 100)}%…`);
      }
    });
    if (generation !== renderGeneration) return;
    ptAo = image;
    showPtPass(canvases.ao, image);
    setStatus(`${result.label}: AO pass ${image.width}x${image.height} px, ${ptSettings.aoSamples} rays/px`);
  } catch (err) {
    if (generation === renderGeneration) {
      setStatus(`AO pass failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
    }
  } finally {
    if (generation === renderGeneration) updatePtButtons();
  }
}

async function loadHdriFile(file: File): Promise<void> {
  setStatus(`Loading ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    // RGBE .hdr and (float) EXR environments both load as equirect
    // DataTextures for scene.environment.
    let texData: DataTextureLoaderTexData;
    if (/\.exr$/i.test(file.name)) {
      const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
      texData = new EXRLoader().parse(buffer);
    } else {
      const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
      texData = new HDRLoader().parse(buffer);
    }
    // HDRLoader's TexData carries no `format` (always RGBA); EXR's does.
    if (!texData.data || !texData.width || !texData.height || !texData.type) {
      throw new Error(`${file.name}: not an equirectangular HDRI file (.hdr/.exr)`);
    }
    const { DataTexture, RGBAFormat } = await import('three');
    const texture = new DataTexture(
      texData.data,
      texData.width,
      texData.height,
      texData.format ?? RGBAFormat,
      texData.type,
    );
    if (texData.colorSpace) texture.colorSpace = texData.colorSpace;
    texture.wrapS = texData.wrapS ?? texture.wrapS;
    texture.wrapT = texData.wrapT ?? texture.wrapT;
    texture.magFilter = texData.magFilter ?? texture.magFilter;
    texture.minFilter = texData.minFilter ?? texture.minFilter;
    texture.generateMipmaps = texData.generateMipmaps ?? texture.generateMipmaps;
    texture.flipY = texData.flipY ?? texture.flipY;
    texture.needsUpdate = true;
    env.texture = texture;
    env.name = file.name;
    hdriNameEl.textContent = file.name;
    updatePtButtons();
    setStatus(`HDRI ${file.name} loaded — ready for the render pass`);
  } catch (err) {
    // The previously active environment stays active on any load failure.
    setStatus(`HDRI load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function activeNotes(): string {
  return gltfSource && gltfSource.skipped.length > 0
    ? ` — skipped: ${gltfSource.skipped.join(', ')}`
    : '';
}

function showPass(
  canvas: HTMLCanvasElement,
  rgba: Float32Array,
  width: number,
  height: number,
  mode: 'albedo' | 'gbuffer-normal' | 'gbuffer-depth',
  size: Vec3,
): void {
  const shown = rgbaToCanvas(rgba, width, height, (r, g, b, a) => {
    if (mode === 'gbuffer-normal' || mode === 'gbuffer-depth') {
      const cov = Math.min(1, Math.sqrt(r * r + g * g + b * b));
      if (mode === 'gbuffer-depth') {
        const [lo, hi] = depthRange(size);
        const t = (a - lo) / (hi - lo);
        return [t, t, t, cov];
      }
      return [r * 0.5 + 0.5, g * 0.5 + 0.5, b * 0.5 + 0.5, cov];
    }
    return [r, g, b, a];
  });
  const ctx = canvas.getContext('2d')!;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(shown, 0, 0);
}

function bake(): void {
  try {
    result = bakePrimitive(current);
    showPass(canvases.albedo, result.albedo, result.width, result.height, 'albedo', result.size);
    showPass(canvases.gbuffer, result.gbuffer, result.width, result.height, gbufferMode, result.size);
    // New source: PT passes reset and the baker re-targets on next use.
    renderGeneration++;
    clearPtPasses();
    ptBaker?.setPrimitive(current);
    ptBakerActive = true;
    updatePtButtons();
    for (const b of Object.values(downloadButtons)) b.disabled = false;
    setStatus(
      `${result.label}: ${result.width}x${result.height} px @ ${result.pxPerUnit} px/unit${activeNotes()}`,
    );
  } catch (err) {
    result = null;
    renderGeneration++;
    clearPtPasses();
    ptBakerActive = false;
    for (const b of Object.values(downloadButtons)) b.disabled = true;
    setStatus(`Bake failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function setActiveSource(buttonId: string): void {
  for (const el of document.querySelectorAll('button.prim')) {
    el.classList.toggle('active', el.id === buttonId);
  }
  gltfButton.classList.toggle('active', buttonId === 'load-gltf');
}

function selectPrimitive(prim: Primitive, buttonId: string): void {
  current = prim;
  setActiveSource(buttonId);
  bake();
}

function clearGltfSource(): void {
  if (!gltfSource) return;
  gltfSource.dispose();
  gltfSource = null;
  sourceNameEl.textContent = '';
}

async function loadGltfFiles(files: File[]): Promise<void> {
  const modelFile = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
  setStatus(`Loading ${modelFile?.name ?? 'glTF'}…`);
  try {
    const source = await loadGltf(files);
    clearGltfSource();
    gltfSource = source;
    gltfScaleInput.value = '1';
    current = source.primitive(1);
    sourceNameEl.textContent = source.label;
    bake();
    setActiveSource('load-gltf');
  } catch (err) {
    // The previously active source stays active on any load failure.
    setStatus(`glTF load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>('button.prim')) {
  button.addEventListener('click', () => {
    const factory = primitiveFactories[button.dataset.primitive ?? ''];
    if (factory) {
      clearGltfSource();
      selectPrimitive(factory(), button.id);
    }
  });
}

gltfButton.addEventListener('click', () => gltfInput.click());
gltfInput.addEventListener('change', () => {
  const files = [...(gltfInput.files ?? [])];
  gltfInput.value = '';
  wsModelSelect.value = '';
  if (files.length > 0) void loadGltfFiles(files);
});
gltfButton.addEventListener('dragover', (e) => e.preventDefault());
gltfButton.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length > 0) {
    wsModelSelect.value = '';
    void loadGltfFiles(files);
  }
});

gltfScaleInput.addEventListener('change', () => {
  const value = parseFloat(gltfScaleInput.value);
  const scale = Number.isFinite(value) && value > 0 ? value : 1;
  gltfScaleInput.value = String(scale);
  if (gltfSource) {
    current = gltfSource.primitive(scale);
    bake();
  }
});

document.getElementById('bake')!.addEventListener('click', bake);

// Path-traced pass controls.
hdriButton.addEventListener('click', () => hdriInput.click());
hdriInput.addEventListener('change', () => {
  const file = hdriInput.files?.[0];
  hdriInput.value = '';
  wsHdriSelect.value = '';
  if (file) void loadHdriFile(file);
});
hdriButton.addEventListener('dragover', (e) => e.preventDefault());
hdriButton.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) {
    wsHdriSelect.value = '';
    void loadHdriFile(file);
  }
});
renderButton.addEventListener('click', () => void runRenderPass());
aoButton.addEventListener('click', () => void runAoPass());

// Workspace integration: pickers browse the connected folder's assets.
let wsConnected = false;

const MODEL_EXTS = ['.glb', '.gltf'];
const HDRI_EXTS = ['.hdr', '.exr'];

async function refreshModelPicker(): Promise<void> {
  try {
    fillSelect(wsModelSelect, await listWorkspaceFiles('models', MODEL_EXTS), 'workspace models…');
  } catch (err) {
    setStatus(`Workspace: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function loadWorkspaceModel(): Promise<void> {
  const name = wsModelSelect.value;
  if (!name) return;
  setStatus(`Loading ${name}…`);
  try {
    const files = await readAllWorkspaceFiles('models', MODEL_EXTS);
    const selected = files.find((f) => f.name === name);
    if (!selected) throw new Error(`"${name}" is no longer in the models/ folder`);
    // Exactly one model file plus the folder's supporting files, so
    // multi-file .gltf external resources resolve against models/.
    const others = files.filter((f) => f !== selected && !/\.(glb|gltf)$/i.test(f.name));
    await loadGltfFiles([selected, ...others]);
  } catch (err) {
    setStatus(`Model load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

async function refreshHdriPicker(): Promise<void> {
  try {
    fillSelect(wsHdriSelect, await listWorkspaceFiles('hdri', HDRI_EXTS), 'workspace hdris…');
  } catch (err) {
    setStatus(`Workspace: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function loadWorkspaceHdri(): Promise<void> {
  const name = wsHdriSelect.value;
  if (!name) return;
  try {
    await loadHdriFile(await readWorkspaceFile('hdri', name));
  } catch (err) {
    setStatus(`HDRI load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function setWorkspaceUi(state: WorkspaceState): void {
  wsConnected = state.kind === 'connected';
  const show = wsConnected;
  wsModelSelect.hidden = !show;
  wsModelRefresh.hidden = !show;
  wsHdriSelect.hidden = !show;
  wsHdriRefresh.hidden = !show;
  downloadButtons.bundle.textContent = wsConnected
    ? 'Save bundle to workspace'
    : `Download bundle (${BUNDLE_EXT})`;
  if (show) {
    void refreshModelPicker();
    void refreshHdriPicker();
  }
}

wsModelSelect.addEventListener('change', () => void loadWorkspaceModel());
wsModelRefresh.addEventListener('click', () => void refreshModelPicker());
wsHdriSelect.addEventListener('change', () => void loadWorkspaceHdri());
wsHdriRefresh.addEventListener('click', () => void refreshHdriPicker());


// Environment changes restart the render pass accumulation (spec) once a
// render pass exists; pass settings apply on the next manual bake.
for (const id of ['env-rotate', 'env-intensity', 'env-exposure', 'env-saturation']) {
  document.getElementById(id)!.addEventListener('change', () => {
    readEnv();
    if (ptRender) void runRenderPass();
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('figcaption button')) {
  button.addEventListener('click', () => {
    gbufferMode = button.id === 'view-depth' ? 'gbuffer-depth' : 'gbuffer-normal';
    for (const el of document.querySelectorAll('figcaption button')) {
      el.classList.toggle('active', el.id === button.id);
    }
    if (result) {
      showPass(canvases.gbuffer, result.gbuffer, result.width, result.height, gbufferMode, result.size);
    }
  });
}

downloadButtons.bundle.addEventListener('click', () => {
  if (!result) return;
  const current = result;
  readEnv();
  const extras =
    ptRender || ptAo
      ? {
          render: ptRender ?? undefined,
          ao: ptAo ?? undefined,
          environment: ptRender ? env : undefined,
          settings: ptRender || ptAo ? ptSettings : undefined,
        }
      : undefined;
  const name = `${current.id}${BUNDLE_EXT}`;
  void buildBundle(current, extras)
    .then(async (bytes) => {
      if (wsConnected) {
        await writeWorkspaceFile('sprites', name, bytes);
        setStatus(`Saved sprites/${name} to the workspace`);
      } else {
        download(name, bytes, 'application/zip');
      }
    })
    .catch((err) => {
      console.error(err);
      setStatus(`Bundle save failed: ${err instanceof Error ? err.message : String(err)}`);
    });
});
downloadButtons.debug.addEventListener('click', () => {
  if (!result) return;
  debugPositionCanvas(result).toBlob((blob) => {
    if (blob) download(`${result!.id}-position-debug.png`, blob, 'image/png');
  });
});

mountWorkspaceControl(document.getElementById('workspace')!, {
  onStatus: setStatus,
  onState: setWorkspaceUi,
});
void initWorkspace();

bake();
