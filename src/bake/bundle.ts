import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
} from 'three/examples/jsm/libs/fflate.module.js';
import type { BakeResult } from './bake.js';
import {
  buildManifest,
  encodeExr,
  encodePngBytes,
  type BakeManifest,
  type BakeProvenance,
} from './export.js';
import type { PtExtras } from './pt.js';

export type { PtExtras, BakeProvenance, BakeManifest };

export const MANIFEST_ENTRY = 'manifest.json';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.exr': 'image/x-exr',
};

// DOS dates before 1980 are rejected by fflate; this is stable on any
// timezone (local year stays 1980 in UTC offsets ±14h).
const FIXED_MTIME = new Date(Date.UTC(1980, 1, 1));

export async function buildBundle(
  result: BakeResult,
  pt?: PtExtras,
  provenance?: BakeProvenance,
): Promise<Uint8Array<ArrayBuffer>> {
  const manifest = buildManifest(result, pt, provenance);
  const entries: Record<string, [Uint8Array, { level: 0 | 6; mtime: Date }]> = {
    [MANIFEST_ENTRY]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime: FIXED_MTIME }],
    [manifest.passes.gbuffer.file]: [
      await encodeExr(result.gbuffer, result.width, result.height),
      { level: 6, mtime: FIXED_MTIME },
    ],
  };
  if (manifest.passes.render && pt?.render) {
    entries[manifest.passes.render.file] = [
      await encodePngBytes(pt.render.rgba, pt.render.width, pt.render.height),
      { level: 0, mtime: FIXED_MTIME },
    ];
  }
  // zipSync allocates a fresh ArrayBuffer-backed Uint8Array.
  return zipSync(entries) as Uint8Array<ArrayBuffer>;
}

export interface BakeBundle {
  manifest: BakeManifest;
  gbuffer: Blob;
  /** Path-traced lit render; null when the bundle omits it. */
  render: Blob | null;
  /** Restored production record; null for bundles saved without one. */
  provenance: BakeProvenance | null;
}

export function parseBake(buffer: ArrayBuffer | Uint8Array): BakeBundle {
  const files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const manifestBytes = files[MANIFEST_ENTRY];
  if (!manifestBytes) {
    throw new Error(`bake bundle: missing ${MANIFEST_ENTRY}`);
  }
  const manifest = JSON.parse(strFromU8(manifestBytes)) as BakeManifest;
  const prefix = 'isoinfinity-bake/';
  if (!manifest.format?.startsWith(prefix)) {
    throw new Error(`bake bundle: unsupported format ${String(manifest.format)}`);
  }
  const minor = manifest.format.slice(prefix.length);
  if (minor !== '4' && minor !== '5') {
    throw new Error(
      `bake bundle: unsupported format ${manifest.format} — expected isoinfinity-bake/4 or /5`,
    );
  }
  // Only the g-buffer entry is required; pass entries recorded by older
  // manifests that no pass consumes (albedo, ao) are ignored.
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
    gbuffer: entry(manifest.passes.gbuffer.file),
    render: manifest.passes.render ? entry(manifest.passes.render.file) : null,
    provenance: manifest.provenance ?? null,
  };
}
