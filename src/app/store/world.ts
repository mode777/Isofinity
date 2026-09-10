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
import {
  World,
  type LightPlacement,
  type MeshPlacement,
  type Placement,
} from '../../runtime/world.js';
import { HistoryStack, type HistoryCommand } from '../../runtime/history.js';
import { parseCharacterAsset } from '../../runtime/meshAsset.js';
import {
  equirectFromProcedural,
  projectRadianceSh,
  type EquirectRadiance,
} from '../../runtime/shProbe.js';
import characterAssetUrl from '../assets/CesiumMan.glb?url';
import type {
  BakeDocument,
  EditorDocument,
  LightState,
  PlacementRef,
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
import {
  DEFAULT_GROUND_TILE_SCALE,
  DEFAULT_POINT_LIGHT,
  defaultGroundState,
} from '../document.js';
import { parseGroundMaterial } from '../groundMaterial.js';
import { equirectFromHdrBuffer } from '../hdr.js';
import { nextDocId, useEditor, type EditorState } from './editor.js';
import { bakePrimitiveLayer, anyBakeBusy, resultToLayer } from './bake.js';
import { SPRITE_EXTS, useProject } from './project.js';

const WORLD_FORMAT = 'isoinfinity-world/6';
/** Older formats the parser still accepts; heights/directions/shadows/lights default. */
const LEGACY_WORLD_FORMATS = [
  'isoinfinity-world/1',
  'isoinfinity-world/2',
  'isoinfinity-world/3',
  'isoinfinity-world/4',
  'isoinfinity-world/5',
];

const ed = (): EditorState => useEditor.getState();
const worldDoc = (docId: string): WorldDocument | null => {
  const doc = ed().docs[docId];
  return doc && doc.kind === 'world' ? doc : null;
};
const update = (docId: string, mutate: (doc: WorldDocument) => void): void =>
  ed().update<WorldDocument>(docId, mutate);

/** Whether a selected placement still exists in the document's world. */
function selectionExists(doc: WorldDocument, ref: PlacementRef): boolean {
  if (ref.kind === 'sprite') return doc.world.placementAt(ref.id) !== null;
  if (ref.kind === 'mesh') return doc.world.meshAt(ref.id) !== null;
  return doc.world.lightAt(ref.id) !== null;
}

/** Drop a selection whose target has been removed (erase or undo/redo). */
function clearStaleSelection(docId: string): void {
  const doc = worldDoc(docId);
  if (!doc || !doc.selection) return;
  if (selectionExists(doc, doc.selection)) return;
  update(docId, (d) => {
    d.selection = null;
  });
}

// --- undo/redo history ------------------------------------------------------

/** Record a just-applied world command on the document's history stack. */
function recordHistory(docId: string, cmd: HistoryCommand): void {
  update(docId, (d) => {
    d.history.push(cmd);
  });
}

/** Undo of erase/remove: re-insert the exact placement object at its index. */
type Removed =
  | { kind: 'sprite'; placement: Placement; index: number }
  | { kind: 'mesh'; placement: MeshPlacement; index: number }
  | { kind: 'light'; placement: LightPlacement; index: number };

function removalCommand(label: string, world: World, removed: Removed): HistoryCommand {
  return {
    label,
    redo: () => {
      if (removed.kind === 'sprite') world.insertSprite(removed.placement, removed.index);
      else if (removed.kind === 'mesh') world.insertMesh(removed.placement, removed.index);
      else world.insertLight(removed.placement, removed.index);
    },
    undo: () => {
      if (removed.kind === 'sprite') world.removeSprite(removed.placement);
      else if (removed.kind === 'mesh') world.removeMeshById(removed.placement.id);
      else world.removeLightById(removed.placement.id);
    },
  };
}

function placementCommand(
  label: string,
  world: World,
  placed: Placement | MeshPlacement | LightPlacement,
): HistoryCommand {
  if ('primId' in placed) {
    return removalCommand(label, world, {
      kind: 'sprite',
      placement: placed,
      index: Number.MAX_SAFE_INTEGER,
    });
  }
  if ('meshId' in placed) {
    return removalCommand(label, world, {
      kind: 'mesh',
      placement: placed,
      index: Number.MAX_SAFE_INTEGER,
    });
  }
  return removalCommand(label, world, {
    kind: 'light',
    placement: placed,
    index: Number.MAX_SAFE_INTEGER,
  });
}

/**
 * Take the document's last world edit back (or re-apply the last undone
 * one). Marks the document dirty either way — after undo/redo the in-memory
 * scene differs from the last save, so the dirty-tab warning stays honest.
 * Drops a stale selection (one an undo/redo removed).
 */
function worldHistoryStep(docId: string, step: 'undo' | 'redo'): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  const cmd = step === 'undo' ? doc.history.undo() : doc.history.redo();
  if (!cmd) return;
  clearStaleSelection(docId);
  ed().markDirty(docId);
}

/** Undo the active world document's last edit. */
export function undoWorld(docId: string): void {
  worldHistoryStep(docId, 'undo');
}

/** Redo the active world document's last undone edit. */
export function redoWorld(docId: string): void {
  worldHistoryStep(docId, 'redo');
}

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
  // A user-selected world HDRI overrides the provenance-derived one, but
  // keeps the world's display parameters (rotation/intensity were tuned
  // for the sprites' bake; resetting them blows out bright outdoor
  // HDRIs). Defaults only when nothing was captured yet.
  const env = doc.userEnv ?? doc.env;
  const params = doc.envParams ?? DEFAULT_ENV_PARAMS;
  try {
    let equirect;
    if (env?.kind === 'hdri') {
      // A file-dialog-loaded HDRI (no workspace) is cached in memory.
      const cached = fileEnvCache.get(env.fileName);
      if (cached) {
        equirect = cached;
      } else {
        const file = await readWorkspaceFile('hdri', env.fileName);
        equirect = await equirectFromHdrBuffer(await file.arrayBuffer(), env.fileName);
      }
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
    userEnv: null,
    ground: defaultGroundState(),
    tool: '',
    heightLevel: 0,
    surfaceSnap: false,
    snappedHeight: null,
    brushDir: 'n',
    shadowLevel: 1,
    viewTransform: null,
    selection: null,
    history: new HistoryStack(),
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
  sprites: { asset: string; x: number; z: number; y: number; dir?: ViewSlot; shadow?: number }[];
  /** Point light placements (present on /6 files only). Height is optional. */
  lights: {
    x: number;
    z: number;
    y?: number;
    radius: number;
    energy: number;
    color: string;
  }[];
  light: LightState;
  sun: SunState;
  /** Ground state (present on /4 files only). */
  groundMaterial?: string | null;
  groundTileScale?: number | null;
  /** User-selected world HDRI (present on /4 files only). */
  envHdri?: string | null;
}

/** The sRGB hex a point light's color must match. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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
    if (s.shadow !== undefined && (!isFiniteNumber(s.shadow) || s.shadow < 0 || s.shadow > 1)) {
      throw fail('malformed sprite placement — shadow strength must be a number in [0, 1]');
    }
    sprites.push({
      asset: s.asset,
      x: s.x,
      z: s.z,
      y: s.y === undefined ? 0 : s.y,
      dir: (s.dir as ViewSlot | undefined) ?? 'n',
      shadow: s.shadow === undefined ? 1 : s.shadow,
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
  // Point light placements: /6 and later only (older files carry none).
  const lights: WorldFile['lights'] = [];
  const lightsRaw = obj.lights;
  if (lightsRaw !== undefined) {
    if (!Array.isArray(lightsRaw)) throw fail('malformed lights array');
    for (const entry of lightsRaw) {
      const l = entry as Record<string, unknown>;
      if (!isFiniteNumber(l.x) || !isFiniteNumber(l.z)) {
        throw fail('malformed point light (needs finite x/z)');
      }
      if (l.y !== undefined && !isFiniteNumber(l.y)) {
        throw fail('malformed point light — height must be a finite number');
      }
      if (!isFiniteNumber(l.radius) || !isFiniteNumber(l.energy)) {
        throw fail('malformed point light — radius and energy must be finite numbers');
      }
      if (typeof l.color !== 'string' || !HEX_COLOR_RE.test(l.color)) {
        throw fail('malformed point light — color must be #rrggbb');
      }
      lights.push({
        x: l.x,
        z: l.z,
        y: l.y === undefined ? 0 : l.y,
        radius: l.radius,
        energy: l.energy,
        color: l.color,
      });
    }
  }
  // Ground + user-selected environment: optional, /4 and later only.
  let groundMaterial: string | null = null;
  let groundTileScale: number | null = null;
  let envHdri: string | null = null;
  const groundRaw = obj.ground as Record<string, unknown> | undefined;
  if (groundRaw !== undefined) {
    if (typeof groundRaw !== 'object' || groundRaw === null) throw fail('malformed ground state');
    if (
      groundRaw.material !== undefined &&
      groundRaw.material !== null &&
      typeof groundRaw.material !== 'string'
    ) {
      throw fail('malformed ground state — material must be a file name');
    }
    groundMaterial = (groundRaw.material as string | null | undefined) ?? null;
    if (groundRaw.tileScale !== undefined) {
      if (!isFiniteNumber(groundRaw.tileScale) || groundRaw.tileScale <= 0) {
        throw fail('malformed ground state — tile scale must be a positive number');
      }
      groundTileScale = groundRaw.tileScale;
    }
  }
  const envRaw = obj.env as Record<string, unknown> | undefined;
  if (envRaw !== undefined) {
    if (typeof envRaw !== 'object' || envRaw === null) throw fail('malformed env state');
    if (
      envRaw.hdri !== undefined &&
      envRaw.hdri !== null &&
      typeof envRaw.hdri !== 'string'
    ) {
      throw fail('malformed env state — hdri must be a file name');
    }
    envHdri = (envRaw.hdri as string | null | undefined) ?? null;
  }
  return {
    format: WORLD_FORMAT,
    name: typeof obj.name === 'string' ? obj.name : fileName.replace(/\.json$/i, ''),
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : undefined,
    sprites,
    lights,
    groundMaterial,
    groundTileScale,
    envHdri,
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
      userEnv: null,
      ground: defaultGroundState(),
      tool: '',
      heightLevel: 0,
      surfaceSnap: false,
      snappedHeight: null,
      brushDir: 'n',
    shadowLevel: 1,
      viewTransform: null,
      selection: null,
      history: new HistoryStack(),
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
      doc.world.place(
        s.x,
        s.z,
        s.asset,
        s.y,
        dirs.includes(savedDir) ? savedDir : 'n',
        s.shadow,
      );
    }
    doc.tool = doc.layers[0]?.id ?? '';

    // Point lights (/6): restore every saved light placement.
    for (const l of data.lights) {
      doc.world.placeLight(l.x - 0.5, l.z - 0.5, l.y ?? 0, l.radius, l.energy, l.color);
    }

    // Ground + user-selected environment (/4): names restore immediately,
    // the material's maps load best-effort after the doc opens.
    doc.userEnv = data.envHdri ? { kind: 'hdri', fileName: data.envHdri } : null;
    const groundMaterial = data.groundMaterial ?? null;
    const groundTileScale = data.groundTileScale ?? DEFAULT_GROUND_TILE_SCALE;
    doc.ground = { material: groundMaterial, tileScale: groundTileScale, maps: null };

    ed().addDoc(doc);
    void updateShProbe(doc.docId);
    if (groundMaterial) {
      void applyGroundMaps(doc.docId, groundMaterial);
    }
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

// --- ground & environment ---------------------------------------------------

/**
 * Load and decode a ground material from materials/ and attach it to the
 * document. Failures keep the previous material and are reported.
 */
async function applyGroundMaps(docId: string, fileName: string): Promise<void> {
  try {
    const file = await readWorkspaceFile('materials', fileName);
    const maps = await parseGroundMaterial(await file.arrayBuffer(), fileName);
    const note = maps.notes.length > 0 ? ` (${maps.notes.join('; ')})` : '';
    update(docId, (d) => {
      if (d.ground.material !== fileName) return;
      d.ground.maps = maps;
    });
    ed().setStatus(`Ground material "${fileName}" applied${note}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    update(docId, (d) => {
      if (d.ground.material === fileName) d.ground.material = null;
    });
    ed().setStatus(`Ground material "${fileName}" skipped — ${reason}`);
  }
}

/** The target world doc: `docId`, else the active doc, else any open world. */
function resolveWorldDoc(docId?: string): WorldDocument | null {
  if (docId) return worldDoc(docId);
  const state = ed();
  const active = state.activeDocId ? state.docs[state.activeDocId] : undefined;
  if (active?.kind === 'world') return active;
  for (const doc of Object.values(state.docs)) {
    if (doc.kind === 'world') return doc;
  }
  return null;
}

/**
 * Select the ground plane's material (a `.material` zip in the workspace's
 * materials/ folder). The maps load and decode async; the selection is
 * stored up front and the maps attach when ready.
 */
export async function selectGroundMaterial(fileName: string, docId?: string): Promise<void> {
  const doc = resolveWorldDoc(docId);
  if (!doc) {
    ed().setStatus('Ground material: open a world document first');
    return;
  }
  update(doc.docId, (d) => {
    d.ground.material = fileName;
    d.ground.maps = null;
  });
  ed().markDirty(doc.docId);
  await applyGroundMaps(doc.docId, fileName);
}

/** Set the ground material's tiling (tiles per world unit; finite, > 0). */
export function setGroundTileScale(docId: string, tileScale: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (!Number.isFinite(tileScale) || tileScale <= 0) return;
  update(docId, (d) => {
    d.ground.tileScale = tileScale;
  });
  ed().markDirty(docId);
}

/**
 * Select the world's environment HDRI (from hdri/); null clears the
 * selection back to the environment inherited from sprite bake
 * provenance. Rebuilds the ambient probe.
 */
export function setWorldEnv(docId: string, fileName: string | null): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.userEnv = fileName ? { kind: 'hdri', fileName } : null;
  });
  ed().markDirty(docId);
  void updateShProbe(docId);
}

/** File-dialog-loaded HDRIs (no workspace), keyed by file name. */
const fileEnvCache = new Map<string, EquirectRadiance>();

/**
 * Load the world's environment from a raw `.hdr`/`.exr` file (the
 * no-workspace fallback). The decoded equirect is cached in memory under
 * the file's name and becomes the user-selected environment.
 */
export async function setWorldEnvFile(file: File, docId?: string): Promise<void> {
  const doc = resolveWorldDoc(docId);
  if (!doc) {
    ed().setStatus('World environment: open a world document first');
    return;
  }
  try {
    const buffer = await file.arrayBuffer();
    const equirect = await equirectFromHdrBuffer(buffer, file.name);
    fileEnvCache.set(file.name, equirect);
    update(doc.docId, (d) => {
      d.userEnv = { kind: 'hdri', fileName: file.name };
    });
    ed().markDirty(doc.docId);
    void updateShProbe(doc.docId);
    ed().setStatus(`World environment: ${file.name}`);
  } catch (err) {
    ed().setStatus(
      `World environment failed to load: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(err);
  }
}

/**
 * Select the ground plane's material from a raw file (the no-workspace
 * fallback). The selection is session-only: without materials/ it cannot
 * restore when the world reloads.
 */
export async function selectGroundMaterialFile(file: File, docId?: string): Promise<void> {
  const doc = resolveWorldDoc(docId);
  if (!doc) {
    ed().setStatus('Ground material: open a world document first');
    return;
  }
  try {
    const maps = await parseGroundMaterial(await file.arrayBuffer(), file.name);
    update(doc.docId, (d) => {
      d.ground = { material: file.name, tileScale: d.ground.tileScale, maps };
    });
    ed().markDirty(doc.docId);
    const note = maps.notes.length > 0 ? ` (${maps.notes.join('; ')})` : '';
    ed().setStatus(
      `Ground material "${file.name}" applied${note} — with no workspace it will not restore on reload`,
    );
  } catch (err) {
    ed().setStatus(
      `Ground material "${file.name}" rejected — ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(err);
  }
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
  // Subfolder paths in the save target survive sanitization (applied to the
  // base name only); the workspace layer creates missing directories.
  const raw = rawName?.trim() || fallback;
  const sep = raw.lastIndexOf('/');
  const dirPart = sep >= 0 ? raw.slice(0, sep) : '';
  const base = sanitizeWorldName(sep >= 0 ? raw.slice(sep + 1) : raw);
  const name = dirPart ? `${dirPart}/${base}` : base;
  const file = `${name}.json`;
  try {
    const placements = doc.world.list();
    const lights = doc.world.listLights();
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
        // Full strength is the default; omitted keeps /4 files identical.
        ...(p.shadow !== 1 ? { shadow: p.shadow } : {}),
      })),
      // Point light placements (/6): the emitter position is the cell
      // center; save that position, not the footprint corner.
      lights: lights.map((l) => ({
        x: l.x + 0.5,
        z: l.z + 0.5,
        // Ground level is the default; a ground-level light may omit y.
        ...(l.y !== 0 ? { y: l.y } : {}),
        radius: l.radius,
        energy: l.energy,
        color: l.colorHex,
      })),
      light: doc.light,
      sun: doc.sun,
      // Ground + user-selected env are additive /4 fields; defaults omit.
      ...(doc.ground.material || doc.ground.tileScale !== DEFAULT_GROUND_TILE_SCALE
        ? {
            ground: {
              ...(doc.ground.material ? { material: doc.ground.material } : {}),
              ...(doc.ground.tileScale !== DEFAULT_GROUND_TILE_SCALE
                ? { tileScale: doc.ground.tileScale }
                : {}),
            },
          }
        : {}),
      ...(doc.userEnv?.kind === 'hdri' ? { env: { hdri: doc.userEnv.fileName } } : {}),
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

/** The point-light placement tool's id (its own toolbar tool). */
export const POINT_LIGHT_TOOL_ID = 'point-light';

/** The Select tool's id (selects/moves placements; never places). */
export const SELECT_TOOL_ID = 'select';

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
    const removed = doc.world.removeTopAt(gx, gz);
    if (removed) {
      recordHistory(
        docId,
        removalCommand(
          `erase ${removed.kind}`,
          doc.world,
          removed as Removed,
        ),
      );
      clearStaleSelection(docId);
      ed().markDirty(docId);
    }
    return;
  }
  if (doc.tool === POINT_LIGHT_TOOL_ID) {
    // The emitter sits at the cursor's ground point; the footprint corner
    // is the cell min corner so erase/pick ride the shared machinery.
    const light = doc.world.placeLight(
      gx - 0.5,
      gz - 0.5,
      y,
      DEFAULT_POINT_LIGHT.radius,
      DEFAULT_POINT_LIGHT.energy,
      DEFAULT_POINT_LIGHT.colorHex,
    );
    recordHistory(docId, placementCommand('place light', doc.world, light));
    update(docId, (d) => {
      d.selection = { kind: 'light', id: light.id };
    });
    ed().markDirty(docId);
    return;
  }
  if (doc.tool === CHARACTER_BRUSH_ID) {
    if (!doc.character) {
      ed().setStatus('brush "character" is not loaded — pick a brush from the toolbar');
      return;
    }
    const id = doc.world.placeMesh(CHARACTER_BRUSH_ID, gx - 0.5, gz - 0.5, y);
    const mesh = doc.world.meshAt(id);
    if (mesh) recordHistory(docId, placementCommand('place character', doc.world, mesh));
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
  const placed = doc.world.place(gx, gz, doc.tool, y, dir, doc.shadowLevel);
  recordHistory(docId, placementCommand('place sprite', doc.world, placed));
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

/**
 * Set the grounding-shadow strength new placements carry (0 = off, 1 =
 * full), like the brush height level. Clamped into [0, 1]; non-finite
 * input is ignored. Editor state only — the value persists with each
 * placement in the world file, not as document state.
 */
export function setShadowLevel(docId: string, strength: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (!Number.isFinite(strength)) return;
  const clamped = Math.min(1, Math.max(0, strength));
  if (clamped === doc.shadowLevel) return;
  update(docId, (d) => {
    d.shadowLevel = clamped;
  });
}

/** Toggle surface snap (per-document editor state, not saved). */
export function setSurfaceSnap(docId: string, on: boolean): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.surfaceSnap = on;
    // Turning snap off drops the eyedropper read with it.
    if (!on) d.snappedHeight = null;
  });
}

/**
 * Publish the height surface snap last read under the cursor (the height
 * field's eyedropper display). Transient editor chrome: never marks the
 * document dirty and never reaches a saved world file.
 */
export function setSnappedHeight(docId: string, h: number | null): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (h !== null && !Number.isFinite(h)) return;
  if (doc.snappedHeight === h) return;
  update(docId, (d) => {
    d.snappedHeight = h;
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
  const removed = doc.world.removeTopAt(gx, gz);
  if (removed) {
    recordHistory(docId, removalCommand(`erase ${removed.kind}`, doc.world, removed as Removed));
    ed().markDirty(docId);
  }
}

export function setLight(docId: string, patch: Partial<LightState>): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  update(docId, (d) => {
    d.light = { ...d.light, ...patch };
  });
  ed().markDirty(docId);
}

/**
 * Select a placement (sprite, mesh, or point light) by its stable id, or
 * clear the selection with null. In-memory editor state (ADR 0006).
 */
export function selectPlacement(docId: string, ref: PlacementRef | null): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (ref && !selectionExists(doc, ref)) return;
  update(docId, (d) => {
    d.selection = ref;
  });
}

/** Clear the world document's selection. */
export function clearSelection(docId: string): void {
  selectPlacement(docId, null);
}

/** Select a point light (null = clear the selection). */
export function selectLight(docId: string, id: number | null): void {
  selectPlacement(docId, id === null ? null : { kind: 'light', id });
}

/**
 * Live-move the selected placement on the ground plane during a drag:
 * updates x/z immediately without recording history (the release records
 * one command). Height is preserved; a light's footprint corner moves.
 */
export function moveSelectionLive(docId: string, ref: PlacementRef, x: number, z: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  update(docId, (d) => {
    if (ref.kind === 'sprite') d.world.updatePlacement(ref.id, { x, z });
    else if (ref.kind === 'mesh') d.world.updateMesh(ref.id, { x, z });
    else d.world.updateLight(ref.id, { x, z });
  });
}

/**
 * Record the drag that just ended as exactly one undoable move command
 * (undo = the pre-drag ground position, redo = the final one) and mark the
 * document dirty when the position actually changed.
 */
export function commitSelectionMove(
  docId: string,
  ref: PlacementRef,
  from: { x: number; z: number },
  to: { x: number; z: number },
): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  if (from.x === to.x && from.z === to.z) return;
  const apply = (p: { x: number; z: number }): void => {
    if (ref.kind === 'sprite') doc.world.updatePlacement(ref.id, p);
    else if (ref.kind === 'mesh') doc.world.updateMesh(ref.id, p);
    else doc.world.updateLight(ref.id, p);
  };
  update(docId, (d) => {
    apply(to);
    d.history.push({ label: 'move', undo: () => apply(from), redo: () => apply(to) });
  });
  ed().markDirty(docId);
}

/**
 * Patch a sprite placement's position, height, or grounding-shadow
 * strength as an undoable world edit (the properties-panel path).
 */
export function patchSprite(
  docId: string,
  id: number,
  patch: Partial<{ x: number; z: number; y: number; shadow: number }>,
): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  const placement = doc.world.placementAt(id);
  if (!placement) return;
  const clean: typeof patch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number' && Number.isFinite(v)) (clean as Record<string, number>)[k] = v;
  }
  if (clean.shadow !== undefined) clean.shadow = Math.min(1, Math.max(0, clean.shadow));
  const before: typeof patch = {};
  for (const k of Object.keys(clean) as (keyof typeof patch)[]) {
    before[k] = placement[k] as number;
  }
  update(docId, (d) => {
    d.world.updatePlacement(id, clean);
    d.history.push({
      label: 'edit sprite',
      undo: () => d.world.updatePlacement(id, before),
      redo: () => d.world.updatePlacement(id, clean),
    });
  });
  ed().markDirty(docId);
}

/**
 * Change a placed sprite's facing (its baked view slot) as an undoable
 * world edit. Ignored for directions the asset does not provide.
 */
export function setSpriteDir(docId: string, id: number, dir: ViewSlot): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  const placement = doc.world.placementAt(id);
  if (!placement) return;
  if (!brushDirections(doc, placement.primId).includes(dir)) return;
  if (placement.dir === dir) return;
  const before = placement.dir;
  update(docId, (d) => {
    d.world.updatePlacement(id, { dir });
    d.history.push({
      label: 'rotate sprite',
      undo: () => d.world.updatePlacement(id, { dir: before }),
      redo: () => d.world.updatePlacement(id, { dir }),
    });
  });
  ed().markDirty(docId);
}

/**
 * Cycle the selected sprite's facing through its available directions
 * (the `E` key while the Select tool holds a sprite). Returns true when a
 * sprite was rotated; false when there is no suitable selection.
 */
export function cycleSelectedSpriteDir(docId: string): boolean {
  const doc = worldDoc(docId);
  if (!doc || doc.selection?.kind !== 'sprite') return false;
  const placement = doc.world.placementAt(doc.selection.id);
  if (!placement) return false;
  const dirs = brushDirections(doc, placement.primId);
  if (dirs.length < 2) return false;
  const next = dirs[(dirs.indexOf(placement.dir) + 1) % dirs.length];
  setSpriteDir(docId, placement.id, next);
  return true;
}

/** Patch a mesh placement's position or height as an undoable world edit. */
export function patchMesh(
  docId: string,
  id: number,
  patch: Partial<{ x: number; z: number; y: number }>,
): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  const mesh = doc.world.meshAt(id);
  if (!mesh) return;
  const clean: typeof patch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number' && Number.isFinite(v)) (clean as Record<string, number>)[k] = v;
  }
  const before: typeof patch = {};
  for (const k of Object.keys(clean) as (keyof typeof patch)[]) {
    before[k] = mesh[k] as number;
  }
  update(docId, (d) => {
    d.world.updateMesh(id, clean);
    d.history.push({
      label: 'edit character',
      undo: () => d.world.updateMesh(id, before),
      redo: () => d.world.updateMesh(id, clean),
    });
  });
  ed().markDirty(docId);
}

/**
 * Patch a placed point light's properties (radius, energy, color, or
 * position — the position given as the emitter's ground point/height).
 */
export function setLightPlacement(
  docId: string,
  id: number,
  patch: Partial<{ x: number; z: number; y: number; radius: number; energy: number; colorHex: string }>,
): void {
  const doc = worldDoc(docId);
  if (!doc || !doc.world.lightAt(id)) return;
  const clean: typeof patch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'colorHex') {
      if (typeof v === 'string') clean.colorHex = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      (clean as Record<string, number>)[k] = v;
    }
  }
  // Capture the light's values for exactly the patched keys so undo
  // restores them and redo re-applies them (updateLight re-keys depth).
  const light = doc.world.lightAt(id)!;
  type LightPatch = typeof patch;
  const before: LightPatch = {};
  for (const k of Object.keys(clean) as (keyof LightPatch)[]) {
    before[k] = light[k] as never;
  }
  // Publish through the store (not just markDirty, which no-ops when the
  // document is already dirty) so the panel re-renders with the new values.
  update(docId, (d) => {
    d.world.updateLight(id, clean);
    d.history.push({
      label: 'edit light',
      undo: () => d.world.updateLight(id, before),
      redo: () => d.world.updateLight(id, clean),
    });
  });
  ed().markDirty(docId);
}

/** Remove a placed point light by id (deselects it when selected). */
export function removeLight(docId: string, id: number): void {
  const doc = worldDoc(docId);
  if (!doc) return;
  const removed = doc.world.removeLightById(id);
  if (!removed) return;
  update(docId, (d) => {
    d.history.push(
      removalCommand('delete light', d.world, {
        kind: 'light',
        placement: removed.placement,
        index: removed.index,
      }),
    );
    if (d.selection?.kind === 'light' && d.selection.id === id) d.selection = null;
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
  const placed = target.world.place(9.5, 5.5, id);
  update(target.docId, (d) => {
    d.layers = [...d.layers, layer];
    d.history.push(placementCommand('place sprite', d.world, placed));
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
