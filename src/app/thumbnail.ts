import { rgbaBytesToCanvas } from '../bake/export.js';
import type { PtImage } from '../bake/pt.js';

/** Square thumbnail edge length (must match `THUMBNAIL_SIZE` in the bundle). */
export const THUMBNAIL_SIZE = 128;

/**
 * Render a bundle thumbnail: the N-view render pass, top-down, aspect-fit and
 * centered on a transparent square canvas, encoded as PNG. Browser-only (the
 * bundle core stays DOM-free and takes the bytes).
 */
export async function renderThumbnail(
  render: PtImage,
  size = THUMBNAIL_SIZE,
): Promise<Uint8Array> {
  const source = rgbaBytesToCanvas(render.rgba, render.width, render.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const scale = Math.min(size / render.width, size / render.height);
  const w = Math.max(1, Math.round(render.width * scale));
  const h = Math.max(1, Math.round(render.height * scale));
  ctx.drawImage(source, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('thumbnail encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}
