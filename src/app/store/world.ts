import { sunDirection } from '../../shared/sun.js';
import {
  BUNDLE_EXT,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../../shared/workspace.js';
import { loadBundleLayer, type SpriteLayer } from '../../runtime/assets.js';
import { World } from '../../runtime/world.js';
import type {
  BakeDocument,
  EditorDocument,
  LightState,
  PrimitiveKind,
  SunState,
  WorldDocument,
} from '../document.js';
import { DEFAULT_LIGHT, DEFAULT_SUN, PRIMITIVE_KINDS } from '../document.js';
import { nextDocId, useEditor, type EditorState } from './editor.js';
import { bakePrimitiveLayer, anyBakeBusy, resultToLayer } from './bake.js';
import { SPRITE_EXTS, useProject } from './project.js';

const WORLD_FORMAT = 'isoinfinity-world/1';

const ed = (): EditorState => useEditor.getState();
const worldDoc = (docId: string): WorldDocument | null => {
  const doc = ed().docs[docId];
  return doc && doc.kind === 'world' ? doc : null;
};
const update = (docId: string, mutate: (doc: WorldDocument) => void): void =>
  ed().update<WorldDocument>(docId, mutate);

// --- document construction ----------------------------------------------

export function newWorldDoc(): string {
  const doc: WorldDocument = {
    kind: 'world',
    docId: nextDocId('world'),
    ref: null,
    dirty: false,
    title: 'untitled world',
    world: new World(),
    layers: [],
    light: { ...DEFAULT_LIGHT },
    sun: { ...DEFAULT_SUN },
    tool: '',
  };
  ed().addDoc(doc);
  return doc.docId;
}

/** Validate a world file completely before anything is mutated. */
interface WorldFile {
  format: string;
  name?: string;
  savedAt?: string;
  sprites: { asset: string; x: number; z: number }[];
  light: LightState;
  sun: SunState;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseWorldFile(text: string, fileName: string): WorldFile {
  const fail = (why: string): Error => new Error(`world "${fileName}": ${why}`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw fail(`not valid JSON — ${err instanceof Error ? err.message : String(err)}`);
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== WORLD_FORMAT) {
    throw fail(`unsupported format ${String(obj.format)} — expected ${WORLD_FORMAT}`);
  }
  const spritesRaw = obj.sprites;
  if (!Array.isArray(spritesRaw)) throw fail('missing "sprites" array');
  const sprites: WorldFile['sprites'] = [];
  for (const entry of spritesRaw) {
    const s = entry as Record<string, unknown>;
    if (typeof s.asset !== 'string' || !isFiniteNumber(s.x) || !isFiniteNumber(s.z)) {
      throw fail('malformed sprite placement (needs asset/x/z)');
    }
    sprites.push({ asset: s.asset, x: s.x, z: s.z });
  }
  const l = obj.light as Record<string, unknown> | undefined;
  if (
    !l ||
    !isFiniteNumber(l.azimuthDeg) ||
    !isFiniteNumber(l.elevationDeg) ||
    !isFiniteNumber(l.intensity) ||
    typeof l.colorHex !== 'string' ||
    typeof l.ambientHex !== 'string' ||
    typeof l.enabled !== 'boolean'
  ) {
    throw fail('malformed light state');
  }
  const sunRaw = obj.sun as Record<string, unknown> | undefined;
  if (!sunRaw || !isFiniteNumber(sunRaw.hour) || !isFiniteNumber(sunRaw.day) || !isFiniteNumber(sunRaw.lat)) {
    throw fail('malformed sun state');
  }
  return {
    format: WORLD_FORMAT,
    name: typeof obj.name === 'string' ? obj.name : fileName.replace(/\.json$/i, ''),
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : undefined,
    sprites,
    light: {
      azimuthDeg: l.azimuthDeg,
      elevationDeg: l.elevationDeg,
      intensity: l.intensity,
      colorHex: l.colorHex,
      ambientHex: l.ambientHex,
      enabled: l.enabled,
    },
    sun: { hour: sunRaw.hour, day: sunRaw.day, lat: sunRaw.lat },
  };
}

/**
 * Open (or focus) a world document from the workspace's worlds/ folder.
 * Every referenced sprite bundle is loaded from sprites/; placements
 * whose bundle is missing are reported as skipped — except built-in
 * primitives, which are always available and bake on the fly (same as
 * picking them as a brush in the toolbar).
 */
export async function openWorldDoc(fileName: string): Promise<void> {
  const key = `world:${fileName}`;
  for (const doc of Object.values(ed().docs)) {
    if (doc.ref?.key === key) {
      ed().focusDoc(doc.docId);
      return;
    }
  }
  ed().setStatus(`Loading world ${fileName}…`);
  try {
    const file = await readWorkspaceFile('worlds', fileName);
    const data = parseWorldFile(await file.text(), fileName);
    // Everything validated — only now build the document.
    const doc: WorldDocument = {
      kind: 'world',
      docId: nextDocId('world'),
      ref: { key, title: fileName },
      dirty: false,
      title: data.name ?? fileName.replace(/\.json$/i, ''),
      world: new World(),
      layers: [],
      light: data.light,
      sun: data.sun,
      tool: '',
    };

    const skipped: string[] = [];
    const loaded = new Map<string, SpriteLayer>();
    for (const entry of data.sprites) {
      if (loaded.has(entry.asset)) continue;
      try {
        const bundleFile = await readWorkspaceFile('sprites', `${entry.asset}${BUNDLE_EXT}`);
        const { layer } = await loadBundleLayer(await bundleFile.arrayBuffer());
        loaded.set(entry.asset, layer);
      } catch {
        // No bundle: built-in primitives bake on the fly; anything else is
        // a genuinely missing sprite asset and its placements are skipped.
        if (!(PRIMITIVE_KINDS as string[]).includes(entry.asset)) {
          if (!skipped.includes(entry.asset)) skipped.push(entry.asset);
          continue;
        }
        try {
          loaded.set(entry.asset, await bakePrimitiveLayer(entry.asset as PrimitiveKind));
        } catch (err) {
          console.error(err);
          if (!skipped.includes(entry.asset)) skipped.push(entry.asset);
        }
      }
    }
    doc.layers = [...loaded.values()];
    for (const s of data.sprites) {
      if (loaded.has(s.asset)) doc.world.place(s.x, s.z, s.asset);
    }
    doc.tool = doc.layers[0]?.id ?? '';

    ed().addDoc(doc);
    const placed = data.sprites.length - skippedCount(data.sprites, skipped);
    ed().setStatus(
      `Loaded world "${doc.title}" — ${placed} placed` +
        (skipped.length > 0
          ? `, skipped unloadable sprites: ${skipped.join(', ')} — save each one into sprites/ (with a render pass) and re-save the world`
          : ''),
    );
  } catch (err) {
    ed().setStatus(`World load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function skippedCount(sprites: { asset: string }[], skipped: string[]): number {
  let n = 0;
  for (const s of sprites) if (skipped.includes(s.asset)) n++;
  return n;
}

// --- save -----------------------------------------------------------------

function sanitizeWorldName(raw: string): string {
  const name = raw
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^[-]+|[-]+$/g, '');
  return name || 'world';
}

function nextWorldName(names: string[]): string {
  const taken = new Set(names.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) {
    if (!taken.has(`world-${n}.json`)) return `world-${n}`;
  }
}

/** Default name for a new world document (first free world-N.json). */
export function suggestWorldName(existingNames: string[]): string {
  return nextWorldName(existingNames);
}

/**
 * Placement assets with no `.sprite`/`.zip` bundle in the workspace's
 * sprites/ folder: these cannot load back when the world is reopened.
 */
function unbackedAssets(assets: Iterable<string>): string[] {
  const listing = useProject.getState().sprites;
  return [...new Set(assets)].filter(
    (asset) => !SPRITE_EXTS.some((ext) => listing.includes(`${asset}${ext}`)),
  );
}

export async function saveWorld(docId: string, rawName?: string): Promise<void> {
  const doc = worldDoc(docId);
  if (!doc) return;
  const fallback = doc.ref
    ? doc.ref.title.replace(/\.json$/i, '')
    : suggestWorldName(useProject.getState().worlds);
  const name = sanitizeWorldName(rawName?.trim() || fallback);
  const file = `${name}.json`;
  try {
    const placements = doc.world.list();
    const worldFile: WorldFile = {
      format: WORLD_FORMAT,
      name,
      savedAt: new Date().toISOString(),
      sprites: placements.map((p) => ({ asset: p.primId, x: p.x, z: p.z })),
      light: doc.light,
      sun: doc.sun,
    };
    const json = JSON.stringify(worldFile, null, 2);
    await writeWorkspaceFile('worlds', file, new TextEncoder().encode(json));
    update(docId, (d) => {
      d.ref = { key: `world:${file}`, title: file };
      d.title = name;
    });
    ed().markDirty(docId, false);
    const missing = unbackedAssets(placements.map((p) => p.primId));
    if (missing.length > 0) {
      ed().setStatus(
        `Saved world "${name}" to worlds/${file} — WARNING: ${missing.length} sprite(s) ` +
          `have no bundle in sprites/ (${missing.join(', ')}): those placements will be ` +
          'skipped on reload. Open each sprite and Save it (with a render pass) first.',
      );
    } else {
      ed().setStatus(`Saved world "${name}" to worlds/${file}`);
    }
    void useProject.getState().refresh();
  } catch (err) {
    ed().setStatus(`World save failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

// --- placement & light ----------------------------------------------------

export function setTool(docId: string, tool: string): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.tool = tool;
  });
}

export function placeAt(docId: string, gx: number, gz: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (doc.tool === 'eraser') {
    if (doc.world.removeAt(gx, gz)) ed().markDirty(docId);
    return;
  }
  if (!doc.layers.some((l) => l.id === doc.tool)) {
    ed().setStatus(`brush "${doc.tool}" is not loaded — pick a brush from the toolbar`);
    return;
  }
  doc.world.place(gx - 0.5, gz - 0.5, doc.tool);
  ed().markDirty(docId);
}

export function eraseAt(docId: string, gx: number, gz: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (doc.world.removeAt(gx, gz)) ed().markDirty(docId);
}

export function setLight(docId: string, patch: Partial<LightState>): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.light = { ...d.light, ...patch };
  });
  ed().markDirty(docId);
}

export function setSun(docId: string, patch: Partial<SunState>): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.sun = { ...d.sun, ...patch };
    // Sun-position sliders overwrite the manual azimuth/elevation state.
    const sun = sunDirection(d.sun.day, d.sun.hour, d.sun.lat);
    const clampedEl = Math.min(85, Math.max(5, sun.elevationDeg));
    d.light = {
      ...d.light,
      azimuthDeg: Math.round(sun.azimuthDeg) % 360,
      elevationDeg: Math.round(clampedEl),
    };
  });
  ed().markDirty(docId);
}

// --- brushes --------------------------------------------------------------

/** A placement brush: a built-in primitive or a saved workspace sprite. */
export type Brush =
  | { kind: 'primitive'; id: PrimitiveKind }
  | { kind: 'sprite'; id: string; fileName?: string };

/** Documents with a brush acquisition in flight (one per world). */
const brushBusy = new Set<string>();

const brushStatus = (id: string): string =>
  `brush: ${id} — left-click/drag places, right-click erases`;

/**
 * Make a brush placeable in the world: reuse its layer when the document
 * already holds it, else load a saved sprite bundle (workspace sprites/)
 * or bake the primitive on the fly, and append the result as a layer.
 * Progress and failures land in the status bar; the tool only changes on
 * success.
 */
export async function selectBrush(docId: string, brush: Brush): Promise<void> {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (doc.layers.some((l) => l.id === brush.id)) {
    setTool(docId, brush.id);
    ed().setStatus(brushStatus(brush.id));
    return;
  }
  if (brushBusy.has(docId)) {
    ed().setStatus('Still loading the previous brush — one moment');
    return;
  }
  if (brush.kind === 'primitive' && anyBakeBusy()) {
    ed().setStatus('A path-traced pass is running — pick the brush again when it finishes');
    return;
  }
  brushBusy.add(docId);
  try {
    let layer: SpriteLayer;
    if (brush.kind === 'sprite') {
      const fileName = brush.fileName ?? `${brush.id}${BUNDLE_EXT}`;
      ed().setStatus(`Loading brush sprite ${fileName}…`);
      const file = await readWorkspaceFile('sprites', fileName);
      const parsed = await loadBundleLayer(await file.arrayBuffer());
      layer = { ...parsed.layer, id: brush.id };
    } else {
      layer = await bakePrimitiveLayer(brush.id);
    }
    update(docId, (d) => {
      d.layers = [...d.layers, layer];
      d.tool = brush.id;
    });
    ed().markDirty(docId);
    ed().setStatus(brushStatus(brush.id));
  } catch (err) {
    ed().setStatus(
      `Brush "${brush.id}" failed to load: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(err);
  } finally {
    brushBusy.delete(docId);
  }
}

// --- place in world ---------------------------------------------------------

function uniqueLayerId(base: string, layers: SpriteLayer[]): string {
  const taken = new Set(layers.map((l) => l.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Place a baked sprite document into a world document: convert its passes
 * to a sprite layer in memory, add a placement, mark dirty. Targets the
 * given world doc, else the active world doc, else a new one.
 */
export function placeInWorld(bakeDocId: string, targetDocId?: string): void {
  const bdoc = useEditor.getState().docs[bakeDocId];
  if (!bdoc || bdoc.kind !== 'bake') return;
  if (!bdoc.result || !bdoc.render) {
    ed().setStatus('Place in world needs baked passes including a render pass');
    return;
  }

  let target: WorldDocument | undefined;
  if (targetDocId) {
    const doc = useEditor.getState().docs[targetDocId];
    if (doc?.kind === 'world') target = doc;
  } else {
    const active = useEditor.getState().activeDocId;
    const activeDoc: EditorDocument | undefined = active ? useEditor.getState().docs[active] : undefined;
    if (activeDoc?.kind === 'world') target = activeDoc;
  }
  let created = false;
  if (!target) {
    const id = newWorldDoc();
    const doc = useEditor.getState().docs[id];
    if (doc?.kind === 'world') target = doc;
    created = true;
  }
  if (!target) return;

  const id = uniqueLayerId(bdoc.result.id, target.layers);
  const layer = resultToLayer(bdoc as BakeDocument, id);
  if (!layer) return;
  update(target.docId, (d) => {
    d.layers = [...d.layers, layer];
    d.world.place(9.5, 5.5, id);
    d.tool = id;
  });
  ed().markDirty(target.docId);
  ed().focusDoc(target.docId);
  const [w, h] = [layer.width, layer.height];
  ed().setStatus(
    `${created ? 'Created world and placed' : 'Placed'} ${id} — ${w}x${h} px @ ${layer.pxPerUnit} px/unit` +
      (bdoc.ref
        ? ''
        : ' — this sprite has no bundle in sprites/ yet: Save it (with a render pass) or placements will be skipped when the world reloads'),
  );
}
