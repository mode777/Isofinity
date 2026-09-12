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
} from './document.js';

export const WORLD_FORMAT = 'isoinfinity-world/7';
/** Older formats the parser still accepts; heights/directions/shadows/lights/size default. */
export const LEGACY_WORLD_FORMATS = [
  'isoinfinity-world/1',
  'isoinfinity-world/2',
  'isoinfinity-world/3',
  'isoinfinity-world/4',
  'isoinfinity-world/5',
  'isoinfinity-world/6',
];

/** The sRGB hex a point light's color must match. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const VIEW_SLOT_SET: ReadonlySet<string> = new Set(['n', 'e', 's', 'w']);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
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
  /** Ground state (present on /4 files only). */
  groundMaterial?: string | null;
  groundTileScale?: number | null;
  /** Ground plane extent (present on /7 files only; omitted at 12 × 12). */
  groundWidth?: number;
  groundDepth?: number;
  /** User-selected world HDRI (present on /4 files only). */
  envHdri?: string | null;
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
 * lights, ground state, and the ground size only appear when they differ
 * from their defaults, so /7 saves of default-valued worlds stay close to
 * their /6 shape.
 */
export function buildWorldFile(input: WorldFileInput): WorldFile {
  const { ground } = input;
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
    // Ground + user-selected env are additive /4 fields, the size a /7
    // field; defaults omit.
    ...(ground.material ||
      ground.tileScale !== DEFAULT_GROUND_TILE_SCALE ||
      ground.width !== DEFAULT_GROUND_WIDTH ||
      ground.depth !== DEFAULT_GROUND_DEPTH
      ? {
          ground: {
            ...(ground.material ? { material: ground.material } : {}),
            ...(ground.tileScale !== DEFAULT_GROUND_TILE_SCALE
              ? { tileScale: ground.tileScale }
              : {}),
            ...(ground.width !== DEFAULT_GROUND_WIDTH ||
              ground.depth !== DEFAULT_GROUND_DEPTH
              ? { width: ground.width, depth: ground.depth }
              : {}),
          },
        }
      : {}),
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
  let groundWidth: number | undefined;
  let groundDepth: number | undefined;
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
    if (groundRaw.width !== undefined || groundRaw.depth !== undefined) {
      if (
        !isFiniteNumber(groundRaw.width) ||
        !isFiniteNumber(groundRaw.depth) ||
        groundRaw.width <= 0 ||
        groundRaw.depth <= 0
      ) {
        throw fail('malformed ground state — size must be finite positive numbers');
      }
      groundWidth = groundRaw.width;
      groundDepth = groundRaw.depth;
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
    groundWidth,
    groundDepth,
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
