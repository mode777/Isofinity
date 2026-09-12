/**
 * Ground material zips: a `.material` (or `.zip`) file in the workspace's
 * materials/ folder containing maps identified by file-name pattern
 * `<material_name>_(diff|diffuse|arm|nor_gl|disp|displace|displacement)_*.(exr|png|jpg)`
 * — Diffuse (`diff`, with `diffuse` accepted as an alias; `diff` wins when
 * both spellings are present), AO/Roughness/Metal (channels encoded in
 * rgb), a gl-convention normal map, and an optional displacement map
 * (`disp`, aliases `displace`/`displacement`) used as a per-pixel surface
 * height when blending several ground materials. The diffuse map is
 * required; the others degrade with a notice.
 */

import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';

/** A decoded diffuse map: sRGB bytes or float EXR radiance (linear). */
export type GroundDiffuseMap =
  | { kind: 'srgb'; image: ImageBitmap }
  | { kind: 'linear'; data: Float32Array; width: number; height: number };

/** The decoded maps of one ground material. */
export interface GroundMaterialMaps {
  name: string;
  diffuse: GroundDiffuseMap;
  normal: ImageBitmap | null;
  arm: ImageBitmap | null;
  /** Optional displacement map (surface height for the blend). */
  disp: ImageBitmap | null;
  /** Non-fatal load notes (missing/duplicate maps), for the status area. */
  notes: string[];
}

/** Slot keys as they appear in map file names (`diffuse` normalizes to `diff`). */
export type MaterialSlot = 'diff' | 'arm' | 'nor_gl' | 'disp';

const SLOT_RE =
  /(?:^|_)(diffuse|diff|arm|nor_gl|displacement|displace|disp)_[^/]*\.(exr|png|jpe?g)$/i;
const EXACT_DIFF_RE = /(?:^|_)diff_[^/]*\.(exr|png|jpe?g)$/i;

/** Normalize a matched file-name token to its slot key. */
function normalizeSlot(raw: string): MaterialSlot {
  const s = raw.toLowerCase();
  if (s === 'diffuse') return 'diff';
  if (s === 'displace' || s === 'displacement') return 'disp';
  return s as MaterialSlot;
}

/** Texel dimensions of a decoded material's diffuse map. */
export function groundMaterialDiffuseSize(
  maps: GroundMaterialMaps,
): { width: number; height: number } {
  return maps.diffuse.kind === 'srgb'
    ? { width: maps.diffuse.image.width, height: maps.diffuse.image.height }
    : { width: maps.diffuse.width, height: maps.diffuse.height };
}

/**
 * The square texel size the texture arrays are built at: the first bound
 * material's diffuse size, clamped to `maxSize`. Pure and Node-verifiable;
 * the renderer resamples every map of every slot to this size so the four
 * 4-layer arrays share one size/format.
 */
export function groundMaterialArraySize(
  slots: readonly (GroundMaterialMaps | null)[],
  maxSize = 2048,
): number {
  for (const maps of slots) {
    if (!maps) continue;
    const { width, height } = groundMaterialDiffuseSize(maps);
    return Math.max(1, Math.min(maxSize, Math.min(width, height)));
  }
  return 1;
}

export interface MaterialSlotFiles {
  diff: string;
  arm: string | null;
  nor_gl: string | null;
  disp: string | null;
}

/**
 * Match zip entry names to material slots (pure; Node-verifiable). The
 * first match per slot wins (`diff` spelling before the `diffuse` alias
 * for the diffuse slot, and the long `displacement` / `displace` spellings
 * before `disp`); the material is invalid (null) without a diffuse map.
 */
export function matchMaterialMaps(entryNames: string[]): MaterialSlotFiles | null {
  const bySlot = new Map<MaterialSlot, string[]>();
  for (const name of entryNames) {
    const m = SLOT_RE.exec(name);
    if (!m) continue;
    const slot = normalizeSlot(m[1]);
    const list = bySlot.get(slot) ?? [];
    list.push(name);
    bySlot.set(slot, list);
  }
  const diff = bySlot.get('diff');
  if (!diff || diff.length === 0) return null;
  diff.sort((a, b) => Number(EXACT_DIFF_RE.test(b)) - Number(EXACT_DIFF_RE.test(a)));
  const first = (slot: MaterialSlot): string | null => bySlot.get(slot)?.[0] ?? null;
  return { diff: diff[0], arm: first('arm'), nor_gl: first('nor_gl'), disp: first('disp') };
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

async function decodeImage(bytes: Uint8Array, name: string): Promise<ImageBitmap> {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const blob = new Blob([bytes as BlobPart], { type: MIME_BY_EXT[ext] ?? 'application/octet-stream' });
  try {
    return await createImageBitmap(blob);
  } catch (err) {
    throw new Error(`${name}: unsupported map format — ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Decode a float EXR map to raw RGBA radiance (three's EXR parser). */
async function decodeExr(
  bytes: Uint8Array,
  name: string,
): Promise<{ data: Float32Array; width: number; height: number }> {
  const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
  const texData = new EXRLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  if (!(texData.data instanceof Float32Array) || !texData.width || !texData.height) {
    throw new Error(`${name}: EXR did not decode to float RGBA`);
  }
  return { data: texData.data, width: texData.width, height: texData.height };
}

/** Open and decode a ground material zip. Throws (named) when invalid. */
export async function parseGroundMaterial(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<GroundMaterialMaps> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch (err) {
    throw new Error(`${fileName}: not a readable zip — ${err instanceof Error ? err.message : String(err)}`);
  }
  const names = Object.keys(files).filter((n) => !n.endsWith('/'));
  const slots = matchMaterialMaps(names);
  if (!slots) {
    throw new Error(
      `${fileName}: no diffuse map — expected <name>_diff_* or <name>_diffuse_*.(exr|png|jpg) inside the material zip`,
    );
  }
  const notes: string[] = [];
  const slotLabel: Record<'arm' | 'nor_gl' | 'disp', string> = {
    arm: 'AO',
    nor_gl: 'normal',
    disp: 'displacement',
  };
  for (const slot of ['arm', 'nor_gl', 'disp'] as const) {
    if (!slots[slot]) notes.push(`no ${slotLabel[slot]} map (${slot}) — using the default`);
  }
  for (const name of names) {
    const m = SLOT_RE.exec(name);
    if (!m) continue;
    const slot = normalizeSlot(m[1]);
    if (name !== slots[slot]) notes.push(`duplicate ${slot} map "${name}" ignored`);
  }
  const diffBytes = files[slots.diff];
  const diffuse = /\.exr$/i.test(slots.diff)
    ? { kind: 'linear' as const, ...(await decodeExr(diffBytes, slots.diff)) }
    : { kind: 'srgb' as const, image: await decodeImage(diffBytes, slots.diff) };
  const normal = slots.nor_gl
    ? await decodeImage(files[slots.nor_gl], slots.nor_gl)
    : null;
  const arm = slots.arm ? await decodeImage(files[slots.arm], slots.arm) : null;
  const disp = slots.disp ? await decodeImage(files[slots.disp], slots.disp) : null;
  return { name: fileName, diffuse, normal, arm, disp, notes };
}
