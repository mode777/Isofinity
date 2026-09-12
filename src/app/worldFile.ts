import type { ViewSlot } from '../shared/iso.js';
import type { LightPlacement, Placement } from '../runtime/world.js';
import type {
  EnvSource,
  GroundState,
  LightState,
  SunState,
} from './document.js';
import {
  DEFAULT_GROUND_DEPTH,
  DEFAULT_GROUND_TILE_SCALE,
  DEFAULT_GROUND_WIDTH,
  GROUND_MATERIAL_SLOTS,
} from './document.js';

export const WORLD_FORMAT = 'isoinfinity-world/8';
/** Older formats the parser still accepts; heights/directions/shadows/lights/size/materials default. */
export const LEGACY_WORLD_FORMATS = [
  'isoinfinity-world/1',
  'isoinfinity-world/2',
  'isoinfinity-world/3',
  'isoinfinity-world/4',
  'isoinfinity-world/5',
  'isoinfinity-world/6',
  'isoinfinity-world/7',
];

/** The sRGB hex a point light's color must match. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const VIEW_SLOT_SET: ReadonlySet<string> = new Set(['n', 'e', 's', 'w']);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The nested `ground` section a world file carries (/4 and later). */
export interface WorldGroundFile {
  /** Legacy (/4-/7) single material binding; loads as slot 0. */
  material?: string | null;
  /** /8 slot bindings (up to four; null = unbound). */
  materials?: (string | null)[];
  tileScale?: number | null;
  width?: number;
  depth?: number;
  /** /8 painted-coverage descriptor. */
  paint?: { file: string; texelsPerUnit: number } | null;
}

/** The JSON payload a world save writes (and a world load parses). */
export interface WorldFile {
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
  /** Ground state (/4+). */
  ground?: WorldGroundFile;
  /** User-selected world HDRI (/4+). */
  env?: { hdri: string | null };
}

/** The scene state a world save serializes (the document's persisted slice). */
export interface WorldFileInput {
  name: string;
  savedAt: string;
  sprites: Placement[];
  lights: LightPlacement[];
  light: LightState;
  sun: SunState;
  ground: GroundState;
  userEnv: EnvSource | null;
}

/**
 * Build the world-file payload from a document's persisted state. Every
 * field is written additively: heights, directions, shadow strengths,
 * lights, ground state (material slots, tile scale, size, painted
 * coverage), and the ground size only appear when they differ from their
 * defaults, so `/8` saves of default-valued worlds stay close to their
 * `/7` shape. The coverage PNG itself is written beside the JSON by the
 * caller.
 */
export function buildWorldFile(input: WorldFileInput): WorldFile {
  const { ground } = input;
  const materials = ground.materials.slice(0, GROUND_MATERIAL_SLOTS);
  const groundSection: WorldGroundFile = {};
  if (materials.some((m) => !!m)) {
    groundSection.materials = materials.map((m) => m ?? null);
  }
  if (ground.tileScale !== DEFAULT_GROUND_TILE_SCALE) {
    groundSection.tileScale = ground.tileScale;
  }
  if (ground.width !== DEFAULT_GROUND_WIDTH || ground.depth !== DEFAULT_GROUND_DEPTH) {
    groundSection.width = ground.width;
    groundSection.depth = ground.depth;
  }
  if (ground.paint?.file) {
    groundSection.paint = {
      file: ground.paint.file,
      texelsPerUnit: ground.paint.texelsPerUnit,
    };
  }
  return {
    format: WORLD_FORMAT,
    name: input.name,
    savedAt: input.savedAt,
    sprites: input.sprites.map((p) => ({
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
    lights: input.lights.map((l) => ({
      x: l.x + 0.5,
      z: l.z + 0.5,
      // Ground level is the default; a ground-level light may omit y.
      ...(l.y !== 0 ? { y: l.y } : {}),
      radius: l.radius,
      energy: l.energy,
      color: l.colorHex,
    })),
    light: input.light,
    sun: input.sun,
    ...(Object.keys(groundSection).length > 0 ? { ground: groundSection } : {}),
    ...(input.userEnv?.kind === 'hdri' ? { env: { hdri: input.userEnv.fileName } } : {}),
  };
}

/**
 * Validate a world file completely before anything is mutated. Throws a
 * named error for unsupported formats and malformed entries; the caller
 * builds the scene only after this returns.
 */
export function parseWorldFile(text: string, fileName: string): WorldFile {
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
      const p = entry as Record<string, unknown>;
      if (!isFiniteNumber(p.x) || !isFiniteNumber(p.z)) {
        throw fail('malformed point light (needs finite x/z)');
      }
      if (p.y !== undefined && !isFiniteNumber(p.y)) {
        throw fail('malformed point light — height must be a finite number');
      }
      if (!isFiniteNumber(p.radius) || !isFiniteNumber(p.energy)) {
        throw fail('malformed point light — radius and energy must be finite numbers');
      }
      if (typeof p.color !== 'string' || !HEX_COLOR_RE.test(p.color)) {
        throw fail('malformed point light — color must be #rrggbb');
      }
      lights.push({
        x: p.x,
        z: p.z,
        y: p.y === undefined ? 0 : p.y,
        radius: p.radius,
        energy: p.energy,
        color: p.color,
      });
    }
  }
  // Ground + user-selected environment: optional, /4 and later only.
  let ground: WorldGroundFile | undefined;
  const groundRaw = obj.ground as Record<string, unknown> | undefined;
  if (groundRaw !== undefined) {
    if (typeof groundRaw !== 'object' || groundRaw === null) throw fail('malformed ground state');
    const section: WorldGroundFile = {};
    // Legacy single material (/4-/7) loads as slot 0.
    if (groundRaw.material !== undefined && groundRaw.material !== null && typeof groundRaw.material !== 'string') {
      throw fail('malformed ground state — material must be a file name');
    }
    if (typeof groundRaw.material === 'string') section.material = groundRaw.material;
    if (groundRaw.materials !== undefined) {
      if (!Array.isArray(groundRaw.materials)) {
        throw fail('malformed ground state — materials must be an array');
      }
      const materials: (string | null)[] = [];
      for (const m of groundRaw.materials) {
        if (m !== null && typeof m !== 'string') {
          throw fail('malformed ground state — each material slot must be a file name or null');
        }
        materials.push(m);
      }
      while (materials.length < GROUND_MATERIAL_SLOTS) materials.push(null);
      section.materials = materials.slice(0, GROUND_MATERIAL_SLOTS);
    }
    if (groundRaw.tileScale !== undefined) {
      if (!isFiniteNumber(groundRaw.tileScale) || groundRaw.tileScale <= 0) {
        throw fail('malformed ground state — tile scale must be a positive number');
      }
      section.tileScale = groundRaw.tileScale;
    }
    if (groundRaw.width !== undefined || groundRaw.depth !== undefined) {
      if (
        !isFiniteNumber(groundRaw.width) ||
        !isFiniteNumber(groundRaw.depth) ||
        groundRaw.width <= 0 ||
        groundRaw.depth <= 0
      ) {
        throw fail('malformed ground state — size must be finite positive numbers');
      }
      section.width = groundRaw.width;
      section.depth = groundRaw.depth;
    }
    if (groundRaw.paint !== undefined && groundRaw.paint !== null) {
      const p = groundRaw.paint as Record<string, unknown>;
      if (
        typeof p.file !== 'string' ||
        !isFiniteNumber(p.texelsPerUnit) ||
        p.texelsPerUnit <= 0
      ) {
        throw fail(
          'malformed ground state — paint needs a file name and positive texels per unit',
        );
      }
      section.paint = { file: p.file, texelsPerUnit: p.texelsPerUnit };
    }
    ground = section;
  }
  let env: { hdri: string | null } | undefined;
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
    env = { hdri: (envRaw.hdri as string | null | undefined) ?? null };
  }
  return {
    format: WORLD_FORMAT,
    name: typeof obj.name === 'string' ? obj.name : fileName.replace(/\.json$/i, ''),
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : undefined,
    sprites,
    lights,
    light: {
      azimuthDeg: l.azimuthDeg,
      elevationDeg: l.elevationDeg,
      intensity: l.intensity,
      colorHex: l.colorHex,
      ambientHex: l.ambientHex,
      enabled: l.enabled,
    },
    sun: { hour: sunRaw.hour, day: sunRaw.day, lat: sunRaw.lat },
    ...(ground !== undefined ? { ground } : {}),
    ...(env !== undefined ? { env } : {}),
  };
}
