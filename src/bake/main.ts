import { bakePrimitive, type BakeResult } from './bake.js';
import {
  buildManifest,
  debugPositionCanvas,
  download,
  exportExr,
  rgbaToCanvas,
} from './export.js';
import { DEPTH_RANGE } from './iso.js';
import {
  getCapsule,
  getCube,
  getCylinder,
  getDonut,
  getPlane,
  getSphere,
  type Primitive,
} from './primitives.js';

const statusEl = document.getElementById('status')!;
const canvases = {
  albedo: document.getElementById('pass-albedo') as HTMLCanvasElement,
  gbuffer: document.getElementById('pass-gbuffer') as HTMLCanvasElement,
};
const downloadButtons = {
  albedo: document.getElementById('dl-albedo') as HTMLButtonElement,
  gbuffer: document.getElementById('dl-gbuffer') as HTMLButtonElement,
  debug: document.getElementById('dl-debug') as HTMLButtonElement,
  manifest: document.getElementById('dl-manifest') as HTMLButtonElement,
};

const primitiveFactories: Record<string, () => Primitive> = {
  sphere: getSphere,
  donut: getDonut,
  cube: getCube,
  cylinder: getCylinder,
  capsule: getCapsule,
  plane: getPlane,
};

let current: Primitive = getSphere();
let result: BakeResult | null = null;
let gbufferMode: 'gbuffer-normal' | 'gbuffer-depth' = 'gbuffer-normal';

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function showPass(
  canvas: HTMLCanvasElement,
  rgba: Float32Array,
  width: number,
  height: number,
  mode: 'albedo' | 'gbuffer-normal' | 'gbuffer-depth',
): void {
  const shown = rgbaToCanvas(rgba, width, height, (r, g, b, a) => {
    if (mode === 'gbuffer-normal' || mode === 'gbuffer-depth') {
      const cov = Math.min(1, Math.sqrt(r * r + g * g + b * b));
      if (mode === 'gbuffer-depth') {
        const t = (a - DEPTH_RANGE[0]) / (DEPTH_RANGE[1] - DEPTH_RANGE[0]);
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
    showPass(canvases.albedo, result.albedo, result.width, result.height, 'albedo');
    showPass(canvases.gbuffer, result.gbuffer, result.width, result.height, gbufferMode);
    for (const b of Object.values(downloadButtons)) b.disabled = false;
    setStatus(
      `${result.label}: ${result.width}x${result.height} px @ ${result.pxPerUnit} px/unit`,
    );
  } catch (err) {
    result = null;
    for (const b of Object.values(downloadButtons)) b.disabled = true;
    setStatus(`Bake failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function selectPrimitive(prim: Primitive, buttonId: string): void {
  current = prim;
  for (const el of document.querySelectorAll('button.prim')) {
    el.classList.toggle('active', el.id === buttonId);
  }
  bake();
}

for (const button of document.querySelectorAll<HTMLButtonElement>('button.prim')) {
  button.addEventListener('click', () => {
    const factory = primitiveFactories[button.dataset.primitive ?? ''];
    if (factory) selectPrimitive(factory(), button.id);
  });
}
document.getElementById('bake')!.addEventListener('click', bake);

for (const button of document.querySelectorAll<HTMLButtonElement>('figcaption button')) {
  button.addEventListener('click', () => {
    gbufferMode = button.id === 'view-depth' ? 'gbuffer-depth' : 'gbuffer-normal';
    for (const el of document.querySelectorAll('figcaption button')) {
      el.classList.toggle('active', el.id === button.id);
    }
    if (result) {
      showPass(canvases.gbuffer, result.gbuffer, result.width, result.height, gbufferMode);
    }
  });
}

downloadButtons.albedo.addEventListener('click', () => {
  if (!result) return;
  const canvas = rgbaToCanvas(result.albedo, result.width, result.height, (r, g, b, a) => [r, g, b, a]);
  canvas.toBlob((blob) => {
    if (blob) download(`${result!.id}-albedo.png`, blob, 'image/png');
  });
});
downloadButtons.gbuffer.addEventListener('click', () => {
  if (!result) return;
  void exportExr(result.gbuffer, result.width, result.height, `${result.id}-gbuffer.exr`);
});
downloadButtons.debug.addEventListener('click', () => {
  if (!result) return;
  debugPositionCanvas(result).toBlob((blob) => {
    if (blob) download(`${result!.id}-position-debug.png`, blob, 'image/png');
  });
});
downloadButtons.manifest.addEventListener('click', () => {
  if (!result) return;
  const json = JSON.stringify(buildManifest(result), null, 2);
  download(`${result.id}-bake.json`, json, 'application/json');
});

bake();
