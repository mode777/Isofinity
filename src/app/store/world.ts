import { sunDirection } from '../../shared/sun.js';
import { type ExtraViewSlot, type ViewSlot } from '../../shared/iso.js';
import {
  BUNDLE_EXT,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../../shared/workspace.js';
import {
  loadBundleViews,
  orderedViewSlots,
  parseViewLayerId,
  viewLayerId,
  type SpriteLayer,
} from '../../runtime/assets.js';
import { World } from '../../runtime/world.js';
import { parseCharacterAsset } from '../../runtime/meshAsset.js';
import {
  equirectFromExr,
  equirectFromProcedural,
  projectRadianceSh,
} from '../../runtime/shProbe.js';
import characterAssetUrl from '../assets/CesiumMan.glb?url';
import type {
  BakeDocument,
  EditorDocument,
  LightState,
  PrimitiveKind,
  SunState,
  ViewTransform,
  WorldDocument,
} from '../document.js';
import {
  DEFAULT_LIGHT,
  DEFAULT_SUN,
  PRIMITIVE_KINDS,
  type EnvDisplayParams,
} from '../document.js';
import { nextDocId, useEditor, type EditorState } from './editor.js';
import { bakePrimitiveLayer, anyBakeBusy, resultToLayer } from './bake.js';
import { SPRITE_EXTS, useProject } from './project.js';

const WORLD_FORMAT = 'isoinfinity-world/3';
/** Older formats the parser still accepts; heights/directions default. */
const LEGACY_WORLD_FORMATS = ['isoinfinity-world/1', 'isoinfinity-world/2'];

const ed = (): EditorState => useEditor.getState();
const worldDoc = (docId: string): WorldDocument | null => {
  const doc = ed().docs[docId];
  return doc && doc.kind === 'world' ? doc : null;
};
const update = (docId: string, mutate: (doc: WorldDocument) => void): void =>
  ed().update<WorldDocument>(docId, mutate);

// --- environment probe ------------------------------------------------------

const DEFAULT_ENV_PARAMS: EnvDisplayParams = {
  rotationDeg: 0,
  intensity: 1,
  exposure: 1,
  saturation: 1,
};

/**
 * Record the environment a sprite bundle was baked with (provenance),
 * first one wins, and schedule the SH probe rebuild. In-memory only.
 */
function captureEnv(
  docId: string,
  doc: WorldDocument,
  provenance: { environment: { procedural: true } | { hdri: string; rotationDeg: number; intensity: number; exposure: number; saturation: number } } | null,
): void {
  if (doc.env || !provenance?.environment) return;
  const env = provenance.environment;
  if ('procedural' in env) {
    update(docId, (d) => {
      if (d.env) return;
      d.env = { kind: 'procedural' };
      d.envParams = { ...DEFAULT_ENV_PARAMS };
    });
  } else {
    update(docId, (d) => {
      if (d.env) return;
      d.env = { kind: 'hdri', fileName: env.hdri };
      d.envParams = {
        rotationDeg: env.rotationDeg,
        intensity: env.intensity,
        exposure: env.exposure,
        saturation: env.saturation,
      };
    });
  }
  void updateShProbe(docId);
}

// Open documents' in-flight probe rebuilds don't nest; the latest wins.
const probeGeneration = new Map<string, number>();

/**
 * Recompute the world's SH irradiance probe from its captured
 * environment. HDRI files resolve against the workspace's hdri/ folder;
 * anything unresolved falls back to the built-in default environment
 * (never an error — a probe is always available).
 */
export async function updateShProbe(docId: string): Promise<void> {
  const doc = worldDoc(docId);
  if (!doc) return;
  const gen = (probeGeneration.get(docId) ?? 0) + 1;
  probeGeneration.set(docId, gen);
  const env = doc.env;
  const params = doc.envParams ?? DEFAULT_ENV_PARAMS;
  try {
    let equirect;
    if (env?.kind === 'hdri') {
      const file = await readWorkspaceFile('hdri', env.fileName);
      equirect = equirectFromExr(await file.arrayBuffer());
    } else {
      equirect = equirectFromProcedural();
    }
    if (probeGeneration.get(docId) !== gen) return;
    const coeffs = projectRadianceSh(equirect, {
      rotationDeg: params.rotationDeg,
      intensity: params.intensity,
    });
    update(docId, (d) => {
      d.shProbe = coeffs;
    });
  } catch (err) {
    // Fall back to the built-in default environment.
    const coeffs = projectRadianceSh(equirectFromProcedural(), {
      rotationDeg: DEFAULT_ENV_PARAMS.rotationDeg,
      intensity: DEFAULT_ENV_PARAMS.intensity,
    });
    if (probeGeneration.get(docId) !== gen) return;
    update(docId, (d) => {
      d.shProbe = coeffs;
    });
    if (env?.kind === 'hdri') {
      ed().setStatus(
        `Ambient probe: HDRI "${env.fileName}" failed to load (${err instanceof Error ? err.message : String(err)}) — using the default environment`,
      );
    }
  }
}

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
    character: null,
    env: null,
    envParams: null,
    shProbe: null,
    tool: '',
    heightLevel: 0,
    surfaceSnap: false,
    brushDir: 'n',
    viewTransform: null,
  };
  ed().addDoc(doc);
  // A probe exists from the start (built-in default environment until a
  // loaded bundle's provenance captures the env it was baked with).
  void updateShProbe(doc.docId);
  return doc.docId;
}

/** Validate a world file completely before anything is mutated. */
interface WorldFile {
  format: string;
  name?: string;
  savedAt?: string;
  sprites: { asset: string; x: number; z: number; y: number; dir?: ViewSlot }[];
  light: LightState;
  sun: SunState;
}

const VIEW_SLOT_SET: ReadonlySet<string> = new Set(['n', 'e', 's', 'w']);

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
  const format = typeof obj.format === 'string' ? obj.format : String(obj.format);
  if (format !== WORLD_FORMAT && !LEGACY_WORLD_FORMATS.includes(format)) {
    throw fail(`unsupported format ${format} — expected ${WORLD_FORMAT}`);
  }
  const spritesRaw = obj.sprites;
  if (!Array.isArray(spritesRaw)) throw fail('missing "sprites" array');
  const sprites: WorldFile['sprites'] = [];
  for (const entry of spritesRaw) {
    const s = entry as Record<string, unknown>;
    if (typeof s.asset !== 'string' || !isFiniteNumber(s.x) || !isFiniteNumber(s.z)) {
      throw fail('malformed sprite placement (needs asset/x/z)');
    }
    if (s.y !== undefined && !isFiniteNumber(s.y)) {
      throw fail('malformed sprite placement — height must be a finite number');
    }
    if (s.dir !== undefined && (typeof s.dir !== 'string' || !VIEW_SLOT_SET.has(s.dir))) {
      throw fail('malformed sprite placement — direction must be a view slot (n/e/s/w)');
    }
    sprites.push({
      asset: s.asset,
      x: s.x,
      z: s.z,
      y: s.y === undefined ? 0 : s.y,
      dir: (s.dir as ViewSlot | undefined) ?? 'n',
    });
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
 * Resolve a placement's asset id to a bundle file in the workspace's
 * sprites/ listing. Tries the exact `<asset>.sprite`/`.zip` name first,
 * then a case-insensitive stem match that also ignores a trailing model
 * extension — ids recorded from in-memory model bakes carry the model
 * file's `.glb`/`.gltf`, while saved bundles may be named either way.
 */
function resolveBundleFile(asset: string): string | null {
  const listing = useProject.getState().sprites;
  const direct = SPRITE_EXTS.map((ext) => `${asset}${ext}`).find((n) =>
    listing.includes(n),
  );
  if (direct) return direct;
  const stemOf = (name: string): string =>
    stripModelExt(name.replace(/\.(sprite|zip)$/i, '').toLowerCase());
  const target = stemOf(asset);
  return (
    listing.find((f) => stemOf(f) === target) ?? null
  );
}

function stripModelExt(name: string): string {
  return name.replace(/\.(glb|gltf)$/i, '');
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
    const docId = nextDocId('world');
    const doc: WorldDocument = {
      kind: 'world',
      docId,
      ref: { key, title: fileName },
      dirty: false,
      title: data.name ?? fileName.replace(/\.json$/i, ''),
      world: new World(),
      layers: [],
      light: data.light,
      sun: data.sun,
      character: null,
      env: null,
      envParams: null,
      shProbe: null,
      tool: '',
      heightLevel: 0,
      surfaceSnap: false,
      brushDir: 'n',
      viewTransform: null,
    };

    const skipped: { asset: string; reason: string }[] = [];
    /** Bundles that loaded but had view slots without a render pass. */
    const viewSkipped: { asset: string; slots: ExtraViewSlot[] }[] = [];
    const loaded = new Map<string, SpriteLayer[]>();
    const markSkipped = (asset: string, err: unknown): void => {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`world load: sprite "${asset}" failed to load:`, err);
      if (!skipped.some((s) => s.asset === asset)) skipped.push({ asset, reason });
    };
    for (const entry of data.sprites) {
      if (loaded.has(entry.asset)) continue;
      const bundleName = resolveBundleFile(entry.asset);
      if (!bundleName) {
        if (PRIMITIVE_KINDS.includes(entry.asset as PrimitiveKind)) {
          try {
            loaded.set(
              entry.asset,
              [await bakePrimitiveLayer(entry.asset as PrimitiveKind)],
            );
          } catch (bakeErr) {
            markSkipped(entry.asset, bakeErr);
          }
        } else {
          markSkipped(
            entry.asset,
            new Error(`no matching .sprite bundle in sprites/`),
          );
        }
        continue;
      }
      try {
        const bundleFile = await readWorkspaceFile('sprites', bundleName);
        const views = await loadBundleViews(await bundleFile.arrayBuffer());
        captureEnv(docId, doc, views.provenance);
        // Pin the layer ids to the placement's asset id: a bundle's
        // manifest id can differ from the file name it was saved as.
        loaded.set(entry.asset, [
          { ...views.north, id: entry.asset },
          ...views.extras.map(({ slot, layer }) => ({
            ...layer,
            id: viewLayerId(entry.asset, slot),
          })),
        ]);
        if (views.skipped.length > 0) {
          viewSkipped.push({ asset: entry.asset, slots: views.skipped });
        }
      } catch (err) {
        markSkipped(entry.asset, err);
      }
    }
    doc.layers = loaded.size > 0 ? [...loaded.values()].flat() : [];
    for (const s of data.sprites) {
      if (!loaded.has(s.asset)) continue;
      // A placement whose saved direction has no loaded view (render
      // pass missing) still restores, facing north.
      const savedDir = s.dir ?? 'n';
      const dirs = brushDirections(doc, s.asset);
      doc.world.place(s.x, s.z, s.asset, s.y, dirs.includes(savedDir) ? savedDir : 'n');
    }
    doc.tool = doc.layers[0]?.id ?? '';

    ed().addDoc(doc);
    void updateShProbe(doc.docId);
    const placed = data.sprites.length - skippedCount(data.sprites, skipped);
    ed().setStatus(
      `Loaded world "${doc.title}" — ${placed} placed` +
        (skipped.length > 0
          ? `, skipped: ${skipped
              .map((s) => `${s.asset} (${s.reason})`)
              .join('; ')} — save each sprite into sprites/ (with a render pass) and re-save the world`
          : '') +
        (viewSkipped.length > 0
          ? `${skipped.length > 0 ? ';' : ' —'} no render pass, direction(s) unavailable: ${viewSkipped
              .map((v) => `${v.asset} (${v.slots.join('/').toUpperCase()})`)
              .join('; ')}`
          : ''),
    );
  } catch (err) {
    ed().setStatus(`World load failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function skippedCount(
  sprites: { asset: string }[],
  skipped: { asset: string }[],
): number {
  let n = 0;
  for (const s of sprites) if (skipped.some((k) => k.asset === s.asset)) n++;
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
 * Placement assets with no resolvable `.sprite`/`.zip` bundle in the
 * workspace's sprites/ folder: these cannot load back when the world is
 * reopened.
 */
function unbackedAssets(assets: Iterable<string>): string[] {
  return [...new Set(assets)].filter((asset) => resolveBundleFile(asset) === null);
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
      sprites: placements.map((p) => ({
        asset: p.primId,
        x: p.x,
        z: p.z,
        y: p.y,
        // North is the default; a north-facing placement may omit dir.
        ...(p.dir !== 'n' ? { dir: p.dir } : {}),
      })),
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

/**
 * Set the world viewport's zoom/pan (null = fit the whole grid to the
 * panel). Editor-only state: never marks the document dirty and never
 * reaches a saved world file.
 */
export function setWorldViewTransform(
  docId: string,
  transform: ViewTransform | null,
): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.viewTransform = transform;
  });
}

/**
 * Place the current brush at the pointed cell and height. The height is
 * the editor's effective placement height (brush level, or the surface
 * snap result) computed by the caller; ground level by default.
 */
export function placeAt(docId: string, gx: number, gz: number, y = 0): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (doc.tool === 'eraser') {
    if (doc.world.removeTopAt(gx, gz)) ed().markDirty(docId);
    return;
  }
  if (doc.tool === CHARACTER_BRUSH_ID) {
    if (!doc.character) {
      ed().setStatus('brush "character" is not loaded — pick a brush from the toolbar');
      return;
    }
    doc.world.placeMesh(CHARACTER_BRUSH_ID, gx - 0.5, gz - 0.5, y);
    ed().markDirty(docId);
    return;
  }
  // The brush faces the chosen direction; if that view's layer is gone
  // (e.g. it had no render pass), fall back to north.
  let dir = doc.brushDir;
  if (!doc.layers.some((l) => l.id === viewLayerId(doc.tool, dir))) dir = 'n';
  if (!doc.layers.some((l) => l.id === viewLayerId(doc.tool, dir))) {
    ed().setStatus(`brush "${doc.tool}" is not loaded — pick a brush from the toolbar`);
    return;
  }
  doc.world.place(gx - 0.5, gz - 0.5, doc.tool, y, dir);
  ed().markDirty(docId);
}

/**
 * Set the brush's placement height (world units; may be negative, sinking
 * below the ground plane). Non-finite input is ignored. Editor state only:
 * never marks the document dirty and never reaches a saved world file.
 */
export function setHeightLevel(docId: string, y: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (!Number.isFinite(y) || y === doc.heightLevel) return;
  update(docId, (d) => {
    d.heightLevel = y;
  });
}

/** Toggle surface snap (per-document editor state, not saved). */
export function setSurfaceSnap(docId: string, on: boolean): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.surfaceSnap = on;
  });
}

/**
 * The directions the given brush asset can face: the view slots with a
 * loaded layer, in canonical N/E/S/W order.
 */
export function brushDirections(doc: WorldDocument, asset: string): ViewSlot[] {
  return orderedViewSlots(
    doc.layers
      .map((l) => parseViewLayerId(l.id))
      .filter((p) => p.asset === asset)
      .map((p) => p.slot),
  );
}

/**
 * Set the brush's facing direction (per-document editor state, not
 * saved). Ignored for directions the brush does not provide.
 */
export function setBrushDir(docId: string, dir: ViewSlot): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (!brushDirections(doc, doc.tool).includes(dir)) return;
  if (dir === doc.brushDir) return;
  update(docId, (d) => {
    d.brushDir = dir;
  });
}

/** Cycle the brush to its next available direction (the `E` key), wrapping. */
export function cycleBrushDir(docId: string): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  const dirs = brushDirections(doc, doc.tool);
  if (dirs.length < 2) return;
  const next = dirs[(dirs.indexOf(doc.brushDir) + 1) % dirs.length];
  update(docId, (d) => {
    d.brushDir = next;
  });
}

export function eraseAt(docId: string, gx: number, gz: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (doc.world.removeTopAt(gx, gz)) ed().markDirty(docId);
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

/** The built-in animated character's brush id and tool name. */
export const CHARACTER_BRUSH_ID = 'character';

/** A placement brush: a built-in primitive, the built-in character, or a saved workspace sprite. */
export type Brush =
  | { kind: 'primitive'; id: PrimitiveKind }
  | { kind: 'character' }
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
  if (brush.kind === 'character') {
    if (doc.character) {
      setTool(docId, CHARACTER_BRUSH_ID);
      ed().setStatus(brushStatus(CHARACTER_BRUSH_ID));
      return;
    }
    if (brushBusy.has(docId)) {
      ed().setStatus('Still loading the previous brush — one moment');
      return;
    }
    brushBusy.add(docId);
    try {
      ed().setStatus('Loading the character…');
      const file = await fetch(characterAssetUrl);
      const asset = await parseCharacterAsset(await file.arrayBuffer());
      update(docId, (d) => {
        d.character = asset;
        d.tool = CHARACTER_BRUSH_ID;
      });
      void updateShProbe(docId);
      ed().markDirty(docId);
      ed().setStatus(brushStatus(CHARACTER_BRUSH_ID));
    } catch (err) {
      ed().setStatus(
        `Character failed to load: ${err instanceof Error ? err.message : String(err)}`,
      );
      console.error(err);
    } finally {
      brushBusy.delete(docId);
    }
    return;
  }
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
    let layers: SpriteLayer[];
    let skippedNote = '';
    if (brush.kind === 'sprite') {
      const fileName = brush.fileName ?? `${brush.id}${BUNDLE_EXT}`;
      ed().setStatus(`Loading brush sprite ${fileName}…`);
      const file = await readWorkspaceFile('sprites', fileName);
      const views = await loadBundleViews(await file.arrayBuffer());
      // Pin the layer ids to the brush's asset id: a bundle's manifest
      // id can differ from the file name it was saved as.
      layers = [
        { ...views.north, id: brush.id },
        ...views.extras.map(({ slot, layer }) => ({
          ...layer,
          id: viewLayerId(brush.id, slot),
        })),
      ];
      if (views.skipped.length > 0) {
        skippedNote = ` — ${views.skipped.join('/').toUpperCase()} view skipped (no render pass)`;
      }
    } else {
      layers = [await bakePrimitiveLayer(brush.id)];
    }
    update(docId, (d) => {
      d.layers = [...d.layers, ...layers];
      d.tool = brush.id;
    });
    ed().markDirty(docId);
    ed().setStatus(brushStatus(brush.id) + skippedNote);
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
