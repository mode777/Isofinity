import { DataTexture, FloatType, RGBAFormat } from 'three';
import { EXRExporter, NO_COMPRESSION } from 'three/examples/jsm/exporters/EXRExporter.js';
import type { BakeResult } from './bake.js';

export function download(name: string, data: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function rgbaToCanvas(
  rgba: Float32Array,
  width: number,
  height: number,
  map: (r: number, g: number, b: number, a: number) => [number, number, number, number],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width;
    for (let x = 0; x < width; x++) {
      const s = (srcRow + x) * 4;
      const d = (y * width + x) * 4;
      const [r, g, b, a] = map(rgba[s], rgba[s + 1], rgba[s + 2], rgba[s + 3]);
      out.data[d] = Math.round(clamp01(r) * 255);
      out.data[d + 1] = Math.round(clamp01(g) * 255);
      out.data[d + 2] = Math.round(clamp01(b) * 255);
      out.data[d + 3] = Math.round(clamp01(a) * 255);
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

export async function exportExr(
  rgba: Float32Array,
  width: number,
  height: number,
  name: string,
): Promise<void> {
  const texture = new DataTexture(rgba, width, height, RGBAFormat, FloatType);
  texture.needsUpdate = true;
  const bytes = await new EXRExporter().parse(texture, {
    type: FloatType,
    compression: NO_COMPRESSION,
  });
  download(name, bytes, 'image/x-exr');
  texture.dispose();
}

export interface BakeManifest {
  format: string;
  id: string;
  cube: { size: [number, number, number]; origin: [number, number, number] };
  camera: { projection: string; azimuthDeg: number; elevationDeg: number };
  pxPerUnit: number;
  sprite: { width: number; height: number; originPx: [number, number] };
  passes: Record<string, { file: string; encoding: string; channels: string }>;
}

export function buildManifest(result: BakeResult): BakeManifest {
  return {
    format: 'isoinfinity-bake/1',
    id: result.id,
    cube: { size: [1, 1, 1], origin: [0, 0, 0] },
    camera: {
      projection: 'orthographic',
      azimuthDeg: result.camera.azimuthDeg,
      elevationDeg: result.camera.elevationDeg,
    },
    pxPerUnit: result.pxPerUnit,
    sprite: {
      width: result.width,
      height: result.height,
      originPx: [
        Math.round(result.originPx[0] * 1000) / 1000,
        Math.round(result.originPx[1] * 1000) / 1000,
      ],
    },
    passes: {
      albedo: {
        file: `${result.id}-albedo.png`,
        encoding: 'png-r8-srgb',
        channels: 'rgb=albedo a=coverage',
      },
      position: {
        file: `${result.id}-position.exr`,
        encoding: 'exr-f32-linear',
        channels: 'rgb=normalized-position-in-cube a=coverage',
      },
      normal: {
        file: `${result.id}-normal.exr`,
        encoding: 'exr-f32-linear',
        channels: 'rgb=world-normal a=coverage',
      },
    },
  };
}
