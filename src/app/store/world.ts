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
  SunState,
  WorldDocument,
} from '../document.js';
import { DEFAULT_LIGHT, DEFAULT_SUN } from '../document.js';
import { nextDocId, useEditor, type EditorState } from './editor.js';
import { resultToLayer } from './bake.js';

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
    tool: 'eraser',
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
 * whose bundle is missing are reported as skipped.
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
      tool: 'eraser',
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
        if (!skipped.includes(entry.asset)) skipped.push(entry.asset);
      }
    }
    doc.layers = [...loaded.values()];
    for (const s of data.sprites) {
      if (loaded.has(s.asset)) doc.world.place(s.x, s.z, s.asset);
    }
    doc.tool = doc.layers[0]?.id ?? 'eraser';

    ed().addDoc(doc);
    const placed = data.sprites.length - skippedCount(data.sprites, skipped);
    ed().setStatus(
      `Loaded world "${doc.title}" — ${placed} placed` +
        (skipped.length > 0 ? `, skipped missing assets: ${skipped.join(', ')}` : ''),
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

export async function saveWorld(docId: string, rawName: string): Promise<void> {
  const doc = worldDoc(docId);
  if (!doc) return;
  const name = sanitizeWorldName(rawName);
  const file = `${name}.json`;
  try {
    const worldFile: WorldFile = {
      format: WORLD_FORMAT,
      name,
      savedAt: new Date().toISOString(),
      sprites: doc.world.list().map((p) => ({ asset: p.primId, x: p.x, z: p.z })),
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
    ed().setStatus(`Saved world "${name}" to worlds/${file}`);
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
    `${created ? 'Created world and placed' : 'Placed'} ${id} — ${w}x${h} px @ ${layer.pxPerUnit} px/unit`,
  );
}
