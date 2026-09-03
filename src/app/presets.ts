/**
 * Bake-setting presets: named JSON documents in the workspace's `presets/`
 * folder that capture a sprite document's path-trace quality (samples,
 * bounces) and environment so a tuned bake look transfers between documents
 * and sessions. Texture size is deliberately not part of a preset — it is
 * model-dependent and stays per-document. Pure data + parsing: no editor or
 * workspace imports, so the parser stays directly Node-checkable.
 */

export const PRESET_FORMAT = 'isoinfinity-bake-preset/1';

export type BakePresetEnvironment =
  | { procedural: true }
  | {
      hdri: string;
      rotationDeg: number;
      intensity: number;
      exposure: number;
      saturation: number;
    };

export interface BakePreset {
  samples: number;
  bounces: number;
  environment: BakePresetEnvironment;
}

/** Resolve a user-supplied preset name to a `.json` file name. */
export function presetFileName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new Error('a preset name is required');
  if (/[/\\]/.test(name)) {
    throw new Error(`preset name "${name}" must not contain path separators`);
  }
  return /\.json$/i.test(name) ? name : `${name}.json`;
}

export function serializePreset(preset: BakePreset): string {
  return `${JSON.stringify({ format: PRESET_FORMAT, ...preset }, null, 2)}\n`;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function parseEnvironment(value: unknown): BakePresetEnvironment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('environment is missing');
  }
  const env = value as Record<string, unknown>;
  if ('procedural' in env) {
    if (env.procedural !== true) throw new Error('unknown environment shape');
    return { procedural: true };
  }
  const hdri = env.hdri;
  if (typeof hdri !== 'string' || hdri.trim() === '') {
    throw new Error('unknown environment shape');
  }
  return {
    hdri,
    rotationDeg: requireNumber(env.rotationDeg, 'environment.rotationDeg'),
    intensity: requireNumber(env.intensity, 'environment.intensity'),
    exposure: requireNumber(env.exposure, 'environment.exposure'),
    saturation: requireNumber(env.saturation, 'environment.saturation'),
  };
}

/** Strict reader: exact format match, known fields only, named errors. */
export function parsePreset(text: string): BakePreset {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('preset root is not a JSON object');
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== PRESET_FORMAT) {
    const found = typeof obj.format === 'string' ? obj.format : 'missing';
    throw new Error(`unknown format "${found}" — expected "${PRESET_FORMAT}"`);
  }
  return {
    samples: requireNumber(obj.samples, 'samples'),
    bounces: requireNumber(obj.bounces, 'bounces'),
    environment: parseEnvironment(obj.environment),
  };
}
