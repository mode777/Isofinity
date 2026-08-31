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
  depth: document.getElementById('pass-depth') as HTMLCanvasElement,
  normal: document.getElementById('pass-normal') as HTMLCanvasElement,
};
const downloadButtons = {
  albedo: document.getElementById('dl-albedo') as HTMLButtonElement,
  depth: document.getElementById('dl-depth') as HTMLButtonElement,
  normal: document.getElementById('dl-normal') as HTMLButtonElement,
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

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function showPass(
  canvas: HTMLCanvasElement,
  rgba: Float32Array,
  width: number,
  height: number,
  mode: 'albedo' | 'depth' | 'normal',
): void {
  const shown = rgbaToCanvas(rgba, width, height, (r, g, b, a) => {
    if (mode === 'normal') return [r * 0.5 + 0.5, g * 0.5 + 0.5, b * 0.5 + 0.5, a];
    if (mode === 'depth') {
      const t = (r - DEPTH_RANGE[0]) / (DEPTH_RANGE[1] - DEPTH_RANGE[0]);
      return [t, t, t, a];
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
    showPass(canvases.depth, result.depth, result.width, result.height, 'depth');
    showPass(canvases.normal, result.normal, result.width, result.height, 'normal');
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

downloadButtons.albedo.addEventListener('click', () => {
  if (!result) return;
  const canvas = rgbaToCanvas(result.albedo, result.width, result.height, (r, g, b, a) => [r, g, b, a]);
  canvas.toBlob((blob) => {
    if (blob) download(`${result!.id}-albedo.png`, blob, 'image/png');
  });
});
downloadButtons.depth.addEventListener('click', () => {
  if (!result) return;
  void exportExr(result.depth, result.width, result.height, `${result.id}-depth.exr`);
});
downloadButtons.normal.addEventListener('click', () => {
  if (!result) return;
  void exportExr(result.normal, result.width, result.height, `${result.id}-normal.exr`);
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
