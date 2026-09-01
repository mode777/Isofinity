import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
} from 'three/examples/jsm/libs/fflate.module.js';
import type { BakeResult } from './bake.js';
import { buildManifest, encodeExr, rgbaToCanvas, type BakeManifest } from './export.js';

export const MANIFEST_ENTRY = 'manifest.json';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.exr': 'image/x-exr',
};

// DOS dates before 1980 are rejected by fflate; this is stable on any
// timezone (local year stays 1980 in UTC offsets ±14h).
const FIXED_MTIME = new Date(Date.UTC(1980, 1, 1));

async function encodePng(result: BakeResult): Promise<Uint8Array> {
  const canvas = rgbaToCanvas(result.albedo, result.width, result.height, (r, g, b, a) => [
    r,
    g,
    b,
    a,
  ]);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('PNG encoding failed');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export async function buildBundle(result: BakeResult): Promise<Uint8Array<ArrayBuffer>> {
  const manifest = buildManifest(result);
  // zipSync allocates a fresh ArrayBuffer-backed Uint8Array.
  return zipSync({
    [MANIFEST_ENTRY]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime: FIXED_MTIME }],
    [manifest.passes.albedo.file]: [await encodePng(result), { level: 0, mtime: FIXED_MTIME }],
    [manifest.passes.gbuffer.file]: [
      await encodeExr(result.gbuffer, result.width, result.height),
      { level: 6, mtime: FIXED_MTIME },
    ],
  }) as Uint8Array<ArrayBuffer>;
}

export interface BakeBundle {
  manifest: BakeManifest;
  albedo: Blob;
  gbuffer: Blob;
}

export function parseBake(buffer: ArrayBuffer | Uint8Array): BakeBundle {
  const files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const manifestBytes = files[MANIFEST_ENTRY];
  if (!manifestBytes) {
    throw new Error(`bake bundle: missing ${MANIFEST_ENTRY}`);
  }
  const manifest = JSON.parse(strFromU8(manifestBytes)) as BakeManifest;
  if (!manifest.format?.startsWith('isoinfinity-bake/')) {
    throw new Error(`bake bundle: unsupported format ${String(manifest.format)}`);
  }
  const entry = (file: string): Blob => {
    const bytes = files[file];
    if (!bytes) {
      throw new Error(`bake bundle: missing pass ${file}`);
    }
    const ext = file.slice(file.lastIndexOf('.'));
    return new Blob([bytes], { type: MIME_BY_EXT[ext] ?? 'application/octet-stream' });
  };
  return {
    manifest,
    albedo: entry(manifest.passes.albedo.file),
    gbuffer: entry(manifest.passes.gbuffer.file),
  };
}
