import { bakePrimitive, type BakeResult } from './bake.js';
import { buildBundle } from './bundle.js';
import {
  debugPositionCanvas,
  download,
  rgbaToCanvas,
} from './export.js';
import { depthRange, type Vec3 } from './iso.js';
import { loadGltf, type GltfSource } from './gltf.js';
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

const statusEl = document.getElementById('status')!;
const canvases = {
  albedo: document.getElementById('pass-albedo') as HTMLCanvasElement,
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
    for (const b of Object.values(downloadButtons)) b.disabled = false;
    setStatus(
      `${result.label}: ${result.width}x${result.height} px @ ${result.pxPerUnit} px/unit${activeNotes()}`,
    );
  } catch (err) {
    result = null;
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
  if (files.length > 0) void loadGltfFiles(files);
});
gltfButton.addEventListener('dragover', (e) => e.preventDefault());
gltfButton.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length > 0) void loadGltfFiles(files);
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
  void buildBundle(current)
    .then((bytes) => download(`${current.id}-bake.zip`, bytes, 'application/zip'))
    .catch((err) => {
      console.error(err);
      setStatus(`Bundle failed: ${err instanceof Error ? err.message : String(err)}`);
    });
});
downloadButtons.debug.addEventListener('click', () => {
  if (!result) return;
  debugPositionCanvas(result).toBlob((blob) => {
    if (blob) download(`${result!.id}-position-debug.png`, blob, 'image/png');
  });
});

bake();
