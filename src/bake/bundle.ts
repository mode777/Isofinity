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
  type BundleExtraView,
} from './export.js';
import type { PtExtras } from './pt.js';
import { EXTRA_VIEW_SLOTS, type ExtraViewSlot } from '../shared/iso.js';

export type { PtExtras, BakeProvenance, BakeManifest, BundleExtraView };

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
  extraViews: BundleExtraView[] = [],
): Promise<Uint8Array<ArrayBuffer>> {
  const manifest = buildManifest(result, pt, provenance, extraViews);
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
  for (const view of extraViews) {
    const viewPasses = manifest.views?.find((v) => v.slot === view.slot)?.passes;
    if (!viewPasses) continue;
    entries[viewPasses.gbuffer.file] = [
      await encodeExr(view.result.gbuffer, view.result.width, view.result.height),
      { level: 6, mtime: FIXED_MTIME },
    ];
    if (viewPasses.render && view.render) {
      entries[viewPasses.render.file] = [
        await encodePngBytes(view.render.rgba, view.render.width, view.render.height),
        { level: 0, mtime: FIXED_MTIME },
      ];
    }
  }
  // zipSync allocates a fresh ArrayBuffer-backed Uint8Array.
  return zipSync(entries) as Uint8Array<ArrayBuffer>;
}

export interface BakeBundle {
  manifest: BakeManifest;
  gbuffer: Blob;
  /** Path-traced lit render; null when the bundle omits it. */
  render: Blob | null;
  /** Extra (non-north) stored views; empty for `/4` and `/5` bundles. */
  views: ParsedBundleView[];
  /** Restored production record; null for bundles saved without one. */
  provenance: BakeProvenance | null;
}

/** One extra stored view's parsed record and pass blobs. */
export interface ParsedBundleView {
  slot: ExtraViewSlot;
  azimuthDeg: number;
  width: number;
  height: number;
  originPx: [number, number];
  gbuffer: Blob;
  render: Blob | null;
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
  if (minor !== '4' && minor !== '5' && minor !== '6') {
    throw new Error(
      `bake bundle: unsupported format ${manifest.format} — expected isoinfinity-bake/4, /5 or /6`,
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
  // Extra view records exist only on /6 manifests; /4 and /5 read as
  // single-view (n) sprites.
  const views: ParsedBundleView[] = [];
  for (const view of manifest.views ?? []) {
    if (view.slot === 'n') continue;
    if (!EXTRA_VIEW_SLOTS.includes(view.slot as ExtraViewSlot)) {
      throw new Error(`bake bundle: unsupported view slot ${String(view.slot)}`);
    }
    views.push({
      slot: view.slot as ExtraViewSlot,
      azimuthDeg: view.azimuthDeg,
      width: view.sprite.width,
      height: view.sprite.height,
      originPx: view.sprite.originPx,
      gbuffer: entry(view.passes.gbuffer.file),
      render: view.passes.render ? entry(view.passes.render.file) : null,
    });
  }
  return {
    manifest,
    gbuffer: entry(manifest.passes.gbuffer.file),
    render: manifest.passes.render ? entry(manifest.passes.render.file) : null,
    views,
    provenance: manifest.provenance ?? null,
  };
}
