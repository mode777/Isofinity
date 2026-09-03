import { bakePrimitive } from '../../bake/bake.js';
import { buildBundle, type BakeProvenance } from '../../bake/bundle.js';
import { debugPositionCanvas, download } from '../../bake/export.js';
import { loadGltf } from '../../bake/gltf.js';
import {
  DEFAULT_PT_SETTINGS,
  PtBaker,
  type PtEnvironment,
  type PtSettings,
} from '../../bake/pt.js';
import {
  getCapsule,
  getCube,
  getCylinder,
  getDonut,
  getPlane,
  getSlab,
  getSphere,
  type Primitive,
} from '../../bake/primitives.js';
import {
  BUNDLE_EXT,
  readAllWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../../shared/workspace.js';
import {
  bakeFloatToHalf,
  proceduralEnvironment,
  ptImageToLayerBytes,
} from '../../runtime/assets.js';
import type { SpriteLayer } from '../../runtime/assets.js';
import { decodeBundle } from '../bundleView.js';
import { parseHdrFile } from '../hdr.js';
import type { BakeDocument, PrimitiveKind } from '../document.js';
import { findDocByRef, nextDocId, useEditor, type EditorState } from './editor.js';
import { useProject } from './project.js';
import { useWorkspace } from './workspace.js';

const PRIMITIVES: Record<PrimitiveKind, () => Primitive> = {
  sphere: getSphere,
  donut: getDonut,
  cube: getCube,
  cylinder: getCylinder,
  capsule: getCapsule,
  plane: getPlane,
  slab: getSlab,
};

const MODEL_EXTS = ['.glb', '.gltf'];

const ed = (): EditorState => useEditor.getState();
const bakeDoc = (docId: string): BakeDocument | null => {
  const doc = ed().docs[docId];
  return doc && doc.kind === 'bake' ? doc : null;
};
const update = (docId: string, mutate: (doc: BakeDocument) => void): void =>
  ed().update<BakeDocument>(docId, mutate);

// --- path-tracer lifecycle: one lazy baker, owned by one document -------

let baker: PtBaker | null = null;
let bakerDocId: string | null = null;

function getBaker(doc: BakeDocument): PtBaker {
  if (baker && bakerDocId !== doc.docId) {
    baker.dispose();
    baker = null;
  }
  if (!baker) {
    baker = new PtBaker(doc.settings);
    bakerDocId = doc.docId;
  }
  return baker;
}

function disposeBaker(): void {
  baker?.dispose();
  baker = null;
  bakerDocId = null;
}

/** Release the path tracer when the owning document closes. */
export function disposeBakerForDoc(docId: string): void {
  if (bakerDocId === docId) disposeBaker();
}

// Dispose the baker whenever it belongs to a document that is no longer
// active (tab switch or close).
useEditor.subscribe((state) => {
  if (bakerDocId && bakerDocId !== state.activeDocId) disposeBaker();
});

// --- document construction ----------------------------------------------

function baseBakeDoc(title: string): BakeDocument {
  return {
    kind: 'bake',
    docId: nextDocId('bake'),
    ref: null,
    dirty: false,
    title,
    source: null,
    gltf: null,
    scale: 1,
    env: { kind: 'procedural' },
    ptEnv: proceduralEnvironment(),
    settings: { ...DEFAULT_PT_SETTINGS },
    result: null,
    render: null,
    ao: null,
    notes: [],
    bundleBytes: null,
    provenance: null,
    viewOnly: false,
    viewOnlyReason: null,
    busy: false,
  };
}

/** Open (or focus) a sprite document for a built-in primitive and bake it. */
export function openPrimitiveDoc(primitive: PrimitiveKind): string {
  const key = `builtin:${primitive}`;
  const existing = findDocByRef(key);
  if (existing) {
    ed().focusDoc(existing.docId);
    return existing.docId;
  }
  const doc = baseBakeDoc(primitive);
  doc.ref = { key, title: primitive };
  doc.source = { kind: 'primitive', primitive };
  ed().addDoc(doc);
  bakeRaster(doc.docId);
  void runRenderPass(doc.docId);
  return doc.docId;
}

/** Open (or focus) a sprite document for a workspace model file. */
export async function openModelDoc(fileName: string): Promise<void> {
  const key = `model:${fileName}`;
  const existing = findDocByRef(key);
  if (existing) {
    ed().focusDoc(existing.docId);
    return;
  }
  ed().setStatus(`Loading ${fileName}…`);
  try {
    const source = await loadModelFromWorkspace(fileName);
    const doc = baseBakeDoc(fileName);
    doc.ref = { key, title: fileName };
    doc.source = { kind: 'model', fileName };
    doc.gltf = source;
    ed().addDoc(doc);
    ed().setStatus(`${source.label}: loaded${activeNotes(source.skipped)}`);
    bakeRaster(doc.docId);
  } catch (err) {
    ed().setStatus(`Model load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

/** Open a sprite document from glTF files picked via dialog or drop. */
export async function openGltfFiles(files: File[]): Promise<void> {
  const modelFile = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
  if (!modelFile) return;
  ed().setStatus(`Loading ${modelFile.name}…`);
  try {
    const source = await loadGltf(files);
    const doc = baseBakeDoc(modelFile.name);
    doc.source = { kind: 'model', fileName: modelFile.name };
    doc.gltf = source;
    ed().addDoc(doc);
    ed().setStatus(`${source.label}: loaded${activeNotes(source.skipped)}`);
    bakeRaster(doc.docId);
  } catch (err) {
    ed().setStatus(`glTF load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

/**
 * Open (or focus) a sprite document from a workspace bundle. `/5`
 * bundles restore editable provenance; `/4` or bundles with missing
 * references open view-only.
 */
export async function openBundleDoc(fileName: string): Promise<void> {
  const key = `bundle:${fileName}`;
  const existing = findDocByRef(key);
  if (existing) {
    ed().focusDoc(existing.docId);
    return;
  }
  ed().setStatus(`Loading ${fileName}…`);
  try {
    const file = await readWorkspaceFile('sprites', fileName);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = await decodeBundle(bytes.buffer);

    const doc = baseBakeDoc(fileName.replace(/\.(sprite|zip)$/i, ''));
    doc.ref = { key, title: fileName };
    doc.result = decoded.result;
    doc.render = decoded.render;
    doc.ao = decoded.ao;
    doc.bundleBytes = bytes;
    doc.provenance = decoded.provenance;

    const prov = decoded.provenance;
    if (!prov) {
      doc.viewOnly = true;
      doc.viewOnlyReason = `bundle has no provenance (format ${decoded.manifest.format}) — passes are view-only`;
    } else {
      doc.settings = {
        samples: prov.bake.samples,
        bounces: prov.bake.bounces,
        textureSize: prov.bake.textureSize,
        aoSamples: prov.bake.aoSamples,
        aoRadius: prov.bake.aoRadius,
        denoise: false,
      };
      if (prov.source.kind === 'primitive') {
        doc.source = { kind: 'primitive', primitive: prov.source.primitive as PrimitiveKind };
      } else {
        doc.source = { kind: 'model', fileName: prov.source.model };
        doc.scale = prov.source.scale;
        try {
          doc.gltf = await loadModelFromWorkspace(prov.source.model);
        } catch (err) {
          doc.viewOnly = true;
          doc.viewOnlyReason = `model "${prov.source.model}" is missing from the workspace (${err instanceof Error ? err.message : String(err)})`;
        }
      }
      if ('procedural' in prov.environment) {
        doc.env = { kind: 'procedural' };
        doc.ptEnv = proceduralEnvironment();
      } else {
        const hdriName = prov.environment.hdri;
        doc.env = { kind: 'hdri', fileName: hdriName };
        doc.ptEnv = {
          ...doc.ptEnv,
          name: hdriName,
          rotationDeg: prov.environment.rotationDeg,
          intensity: prov.environment.intensity,
          exposure: prov.environment.exposure,
          saturation: prov.environment.saturation,
        };
        try {
          const file = await readWorkspaceFile('hdri', hdriName);
          const { texture } = await parseHdrFile(await file.arrayBuffer(), hdriName);
          doc.ptEnv = { ...doc.ptEnv, texture };
        } catch (err) {
          doc.viewOnly = true;
          doc.viewOnlyReason = `HDRI "${hdriName}" is missing from the workspace (${err instanceof Error ? err.message : String(err)})`;
        }
      }
    }

    ed().addDoc(doc);
    const r = decoded.result;
    ed().setStatus(
      `${fileName}: ${r.width}x${r.height} px @ ${r.pxPerUnit} px/unit opened` +
        (doc.viewOnly ? ` — view-only (${doc.viewOnlyReason})` : ''),
    );
  } catch (err) {
    ed().setStatus(`Sprite load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

// --- source plumbing -----------------------------------------------------

function activeNotes(skipped: string[]): string {
  return skipped.length > 0 ? ` — skipped: ${skipped.join(', ')}` : '';
}

async function loadModelFromWorkspace(fileName: string) {
  const files = await readAllWorkspaceFiles('models', MODEL_EXTS);
  const selected = files.find((f) => f.name === fileName);
  if (!selected) throw new Error(`"${fileName}" is no longer in the models/ folder`);
  // Exactly one model file plus the folder's supporting files, so
  // multi-file .gltf external resources resolve against models/.
  const others = files.filter((f) => f !== selected && !MODEL_EXTS.includes(extOf(f.name)));
  return loadGltf([selected, ...others]);
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

function primitiveFor(doc: BakeDocument): Primitive {
  if (doc.source?.kind === 'primitive') {
    return PRIMITIVES[doc.source.primitive]();
  }
  if (doc.source?.kind === 'model') {
    if (!doc.gltf) throw new Error(`model "${doc.source.fileName}" is not loaded`);
    return doc.gltf.primitive(doc.scale);
  }
  throw new Error('document has no bake source (view-only)');
}

// --- pass actions ---------------------------------------------------------

/** Raster bake (albedo + g-buffer) for the document's current source. */
export function bakeRaster(docId: string): void {
  const doc = bakeDoc(docId);
  if (!doc || doc.viewOnly) return;
  try {
    const result = bakePrimitive(primitiveFor(doc));
    update(docId, (d) => {
      d.result = result;
      d.notes = d.gltf?.skipped ?? [];
      d.bundleBytes = null;
    });
    ed().markDirty(docId);
    ed().setStatus(
      `${result.label}: ${result.width}x${result.height} px @ ${result.pxPerUnit} px/unit${activeNotes(doc.gltf?.skipped ?? [])}`,
    );
  } catch (err) {
    ed().setStatus(`Bake failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

let renderGen = 0;
let aoGen = 0;

/** Path-traced lit render pass. Requires a raster bake and an environment.
 * Safe to invoke while another accumulation runs: the new run resets the
 * tracer for the current settings and the stale run's commit is discarded
 * by its generation token (environment changes restart accumulation). */
export async function runRenderPass(docId: string): Promise<void> {
  const doc = bakeDoc(docId);
  if (!doc || doc.viewOnly || !doc.result || !doc.ptEnv.texture) return;
  const gen = ++renderGen;
  update(docId, (d) => {
    d.busy = true;
  });
  try {
    const b = getBaker(doc);
    b.applySettings(doc.settings);
    b.setEnvironment(doc.ptEnv);
    b.setPrimitive(primitiveFor(doc), doc.result.pxPerUnit);
    const image = await b.renderPass((samples, total) => {
      if (gen === renderGen) {
        ed().setStatus(`${doc.title}: rendering ${samples}/${total} samples…`);
      }
    });
    if (gen !== renderGen) return;
    update(docId, (d) => {
      d.render = image;
    });
    ed().markDirty(docId);
    ed().setStatus(
      `${doc.title}: render pass ${image.width}x${image.height} px, ${doc.settings.samples} samples`,
    );
  } catch (err) {
    if (gen === renderGen) {
      ed().setStatus(`Render pass failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
    }
  } finally {
    if (gen === renderGen) update(docId, (d) => {
      d.busy = false;
    });
  }
}

/** Path-traced ambient occlusion pass (no environment needed). */
export async function runAoPass(docId: string): Promise<void> {
  const doc = bakeDoc(docId);
  if (!doc || doc.viewOnly || !doc.result || doc.busy) return;
  const gen = ++aoGen;
  update(docId, (d) => {
    d.busy = true;
  });
  try {
    const b = getBaker(doc);
    b.applySettings(doc.settings);
    b.setPrimitive(primitiveFor(doc), doc.result.pxPerUnit);
    const image = await b.aoPass((fraction) => {
      if (gen === aoGen) {
        ed().setStatus(`${doc.title}: AO ${Math.round(fraction * 100)}%…`);
      }
    });
    if (gen !== aoGen) return;
    update(docId, (d) => {
      d.ao = image;
    });
    ed().markDirty(docId);
    ed().setStatus(
      `${doc.title}: AO pass ${image.width}x${image.height} px, ${doc.settings.aoSamples} rays/px`,
    );
  } catch (err) {
    if (gen === aoGen) {
      ed().setStatus(`AO pass failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
    }
  } finally {
    if (gen === aoGen) update(docId, (d) => {
      d.busy = false;
    });
  }
}

// --- settings & environment ----------------------------------------------

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function setSettings(docId: string, patch: Partial<PtSettings>): void {
  const doc = bakeDoc(docId);
  if (!doc || doc.viewOnly) return;
  update(docId, (d) => {
    d.settings = {
      samples: clamp(Math.round(num(patch.samples, d.settings.samples)), 16, 4096),
      bounces: clamp(Math.round(num(patch.bounces, d.settings.bounces)), 1, 16),
      textureSize: clamp(Math.round(num(patch.textureSize, d.settings.textureSize)), 256, 4096),
      aoSamples: clamp(Math.round(num(patch.aoSamples, d.settings.aoSamples)), 4, 1024),
      aoRadius: clamp(num(patch.aoRadius, d.settings.aoRadius), 0.05, 2),
      denoise: false,
    };
  });
  ed().markDirty(docId);
}

export function setModelScale(docId: string, scale: number): void {
  const doc = bakeDoc(docId);
  if (!doc || doc.viewOnly || doc.source?.kind !== 'model') return;
  const value = Number.isFinite(scale) && scale > 0 ? scale : 1;
  update(docId, (d) => {
    d.scale = value;
  });
  ed().markDirty(docId);
  bakeRaster(docId);
}

export function setEnvParams(
  docId: string,
  patch: Partial<Pick<PtEnvironment, 'rotationDeg' | 'intensity' | 'exposure' | 'saturation'>>,
): void {
  const doc = bakeDoc(docId);
  if (!doc || doc.viewOnly) return;
  update(docId, (d) => {
    d.ptEnv = {
      ...d.ptEnv,
      rotationDeg: num(patch.rotationDeg, d.ptEnv.rotationDeg),
      intensity: num(patch.intensity, d.ptEnv.intensity),
      exposure: num(patch.exposure, d.ptEnv.exposure),
      saturation: num(patch.saturation, d.ptEnv.saturation),
    };
  });
  ed().markDirty(docId);
  // Environment changes restart the accumulation once a render pass exists.
  if (doc.render) void runRenderPass(docId);
}

/** Load an HDRI from a picked/dropped file into the document environment. */
export async function loadHdriFile(docId: string, file: File): Promise<void> {
  const doc = bakeDoc(docId);
  if (!doc || doc.viewOnly) return;
  ed().setStatus(`Loading ${file.name}…`);
  try {
    const { texture } = await parseHdrFile(await file.arrayBuffer(), file.name);
    update(docId, (d) => {
      d.env = { kind: 'hdri', fileName: file.name };
      d.ptEnv = { ...d.ptEnv, texture, name: file.name };
    });
    ed().markDirty(docId);
    ed().setStatus(`HDRI ${file.name} loaded — ready for the render pass`);
    if (doc.render) void runRenderPass(docId);
  } catch (err) {
    // The previously active environment stays active on any load failure.
    ed().setStatus(`HDRI load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

/** Load an HDRI from the workspace's hdri/ folder. */
export async function loadHdriFromWorkspace(docId: string, fileName: string): Promise<void> {
  const doc = bakeDoc(docId);
  if (!doc) return;
  try {
    const file = await readWorkspaceFile('hdri', fileName);
    await loadHdriFile(docId, new File([file], fileName, { type: file.type }));
  } catch (err) {
    ed().setStatus(`HDRI load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

// --- save / export ---------------------------------------------------------

function provenanceOf(doc: BakeDocument): BakeProvenance | null {
  if (!doc.source) return null;
  return {
    source:
      doc.source.kind === 'primitive'
        ? { kind: 'primitive', primitive: doc.source.primitive }
        : { kind: 'model', model: doc.source.fileName, scale: doc.scale },
    bake: {
      samples: doc.settings.samples,
      bounces: doc.settings.bounces,
      textureSize: doc.settings.textureSize,
      aoSamples: doc.settings.aoSamples,
      aoRadius: doc.settings.aoRadius,
    },
    environment:
      doc.env.kind === 'procedural'
        ? { procedural: true }
        : {
            hdri: doc.env.fileName,
            rotationDeg: doc.ptEnv.rotationDeg,
            intensity: doc.ptEnv.intensity,
            exposure: doc.ptEnv.exposure,
            saturation: doc.ptEnv.saturation,
          },
  };
}

/** Resolve a user-supplied bundle name to a `.sprite` file name. */
function bundleFileName(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  return /\.(sprite|zip)$/i.test(trimmed) ? trimmed : `${trimmed}${BUNDLE_EXT}`;
}

/** Save the sprite to the workspace (or download when disconnected). */
export async function saveSprite(docId: string, rawName?: string): Promise<void> {
  const doc = bakeDoc(docId);
  if (!doc || !doc.result) return;
  const name = bundleFileName(rawName, `${doc.result.id}${BUNDLE_EXT}`);
  try {
    let bytes: Uint8Array<ArrayBuffer>;
    if (doc.bundleBytes) {
      // View-only copy of an opened bundle: write the original bytes.
      bytes = doc.bundleBytes;
    } else {
      const extras =
        doc.render || doc.ao
          ? {
              render: doc.render ?? undefined,
              ao: doc.ao ?? undefined,
              environment: doc.render ? doc.ptEnv : undefined,
              settings: doc.settings,
            }
          : undefined;
      bytes = await buildBundle(doc.result, extras, provenanceOf(doc) ?? undefined);
    }
    const ws = useWorkspaceState();
    if (ws === 'connected') {
      await writeWorkspaceFile('sprites', name, bytes);
      ed().setStatus(`Saved sprites/${name} to the workspace`);
      void useProject.getState().refresh();
    } else {
      download(name, bytes, 'application/zip');
      ed().setStatus(`Downloaded ${name}`);
    }
    update(docId, (d) => {
      d.ref = { key: `bundle:${name}`, title: name };
      d.title = name.replace(/\.(sprite|zip)$/i, '');
    });
    ed().markDirty(docId, false);
  } catch (err) {
    ed().setStatus(`Bundle save failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function useWorkspaceState(): string {
  return useWorkspace.getState().state.kind;
}

export function downloadPositionDebug(docId: string): void {
  const doc = bakeDoc(docId);
  if (!doc || !doc.result) return;
  debugPositionCanvas(doc.result).toBlob((blob) => {
    if (blob) download(`${doc.result!.id}-position-debug.png`, blob, 'image/png');
  });
}

/** Convert a sprite document's baked passes into a placeable layer. */
export function resultToLayer(doc: BakeDocument, id: string): SpriteLayer | null {
  if (!doc.result || !doc.render) return null;
  return {
    id,
    pxPerUnit: doc.result.pxPerUnit,
    width: doc.result.width,
    height: doc.result.height,
    originPx: doc.result.originPx,
    gbuffer: bakeFloatToHalf(doc.result.gbuffer, doc.result.width, doc.result.height),
    render: ptImageToLayerBytes(doc.render),
  };
}

/**
 * Bake a built-in primitive into a placeable layer on the fly (default
 * settings, procedural environment). Runs on a throwaway path tracer so
 * the document-owned baker is untouched; the instance is always disposed.
 * Callers must not run this while another path-traced pass accumulates —
 * both drive the shared bake renderer.
 */
export async function bakePrimitiveLayer(primitive: PrimitiveKind): Promise<SpriteLayer> {
  const prim = PRIMITIVES[primitive]();
  const result = bakePrimitive(prim);
  const settings = { ...DEFAULT_PT_SETTINGS };
  const baker = new PtBaker(settings, result.pxPerUnit);
  try {
    baker.applySettings(settings);
    baker.setEnvironment(proceduralEnvironment());
    baker.setPrimitive(prim, result.pxPerUnit);
    const render = await baker.renderPass((samples, total) => {
      ed().setStatus(`Baking ${primitive} brush: ${samples}/${total} samples…`);
    });
    return {
      id: result.id,
      pxPerUnit: result.pxPerUnit,
      width: result.width,
      height: result.height,
      originPx: result.originPx,
      gbuffer: bakeFloatToHalf(result.gbuffer, result.width, result.height),
      render: ptImageToLayerBytes(render),
    };
  } finally {
    baker.dispose();
  }
}

/** True while any sprite document runs a path-traced pass. */
export function anyBakeBusy(): boolean {
  for (const doc of Object.values(ed().docs)) {
    if (doc?.kind === 'bake' && doc.busy) return true;
  }
  return false;
}
