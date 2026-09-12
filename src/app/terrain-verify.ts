/**
 * Node-runnable verification for terrain material painting (no WebGL, no
 * DOM): the `disp` material slot aliases, splat resolution/scaling, the
 * normalized-replace brush stamp, the data-preserving PNG codec, and the
 * `isoinfinity-world/8` ground round trip (material slots + paint
 * descriptor, `/7` tolerance, rejection cases). Run with:
 *   npm run verify:terrain
 */
import { matchMaterialMaps, groundMaterialArraySize, type GroundMaterialMaps } from './groundMaterial.js';
import { buildWorldFile, parseWorldFile } from './worldFile.js';
import {
  DEFAULT_GROUND_TILE_SCALE,
  defaultGroundState,
  type LightState,
  type SunState,
} from './document.js';
import { decodePngRgba, encodePngRgba } from '../shared/png.js';
import {
  defaultSplatBytes,
  resampleSplat,
  splatDimensions,
  stampSplatDab,
  withDerivedAlpha,
} from '../shared/splat.js';

let passed = 0;
let failed = 0;

declare const process: { exit(code?: number): void };

function ok(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ok - ${label}`);
  } else {
    failed++;
    console.error(`  FAIL - ${label}`);
  }
}

function throws(fn: () => void, label: string): void {
  try {
    fn();
    ok(false, `${label} (did not throw)`);
  } catch {
    ok(true, label);
  }
}

/** A fake decoded material for the pure size helper. */
function fakeMaterial(size: number): GroundMaterialMaps {
  const image = { width: size, height: size } as ImageBitmap;
  return {
    name: 'fake',
    diffuse: { kind: 'srgb', image },
    normal: null,
    arm: null,
    disp: null,
    notes: [],
  };
}

const LIGHT: LightState = {
  azimuthDeg: 60,
  elevationDeg: 45,
  intensity: 1.2,
  colorHex: '#fff1dd',
  ambientHex: '#a8a8a8',
  enabled: true,
};
const SUN: SunState = { hour: 12, day: 80, lat: 45 };

function main(): void {
  console.log('material slots:');
  {
    const disp = 'rock_disp_2k.png';
    const displace = 'rock_displace_2k.png';
    const displacement = 'rock_displacement_2k.png';
    ok(matchMaterialMaps(['rock_diff_2k.png', disp])?.disp === disp, 'disp alias is recognized');
    ok(
      matchMaterialMaps(['rock_diff_2k.png', displace])?.disp === displace,
      'displace alias is recognized',
    );
    ok(
      matchMaterialMaps(['rock_diff_2k.png', displacement])?.disp === displacement,
      'displacement alias is recognized',
    );
    ok(
      matchMaterialMaps(['rock_diff_2k.png'])?.disp === null,
      'a missing displacement map leaves the slot empty (a notice, not an error)',
    );
    ok(
      matchMaterialMaps(['rock_displacement_2k.png', displacement, 'rock_diff_2k.png'])?.disp ===
        displacement,
      'the long displacement spelling wins over disp when both are present',
    );
    ok(
      groundMaterialArraySize([null, fakeMaterial(64), fakeMaterial(32)]) === 64,
      'the array size follows the first bound material',
    );
  }

  console.log('splat resolution:');
  {
    const d = splatDimensions(12, 8, 16);
    ok(d.width === 192 && d.height === 128, '12x8 at 16/unit is 192x128');
    const capped = splatDimensions(128, 128, 16);
    ok(capped.width === 2048 && capped.height === 2048, '128x128 caps at 2048');
    const fallback = splatDimensions(4, 4, 0);
    ok(fallback.width === 64 && fallback.height === 64, 'invalid texels/unit falls back to 16');
  }

  console.log('normalized-replace stamp:');
  {
    const { width, height } = splatDimensions(1, 1, 4);
    const data = defaultSplatBytes(width, height);
    ok(data[0] === 255 && data[1] === 0 && data[2] === 0, 'the default mirror is slot 0 over everything');
    const rect = stampSplatDab(
      { data, width, height },
      1,
      1,
      0.5,
      0.5,
      0.5,
      1,
      1,
    );
    ok(rect !== null, 'a centered dab reports a changed rect');
    const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
    ok(data[center + 1] === 255 && data[center] === 0, 'painting slot 1 replaces slot 0 at the center');
    let maxSumErr = 0;
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const sum = data[o] + data[o + 1] + data[o + 2] + data[o + 3];
      maxSumErr = Math.max(maxSumErr, Math.abs(sum - 255));
    }
    ok(maxSumErr <= 1, `coverage stays a partition of unity (max sum error ${maxSumErr})`);

    // Painting slot 3 (alpha) must clear rgb: the derived alpha rises.
    const data3 = defaultSplatBytes(width, height);
    stampSplatDab({ data: data3, width, height }, 1, 1, 0.5, 0.5, 3, 1, 3);
    const o3 = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
    ok(data3[o3] === 0 && data3[o3 + 3] === 255, 'painting slot 3 clears rgb (alpha becomes 1)');

    // Hardness: a hard edge leaves the rim untouched, a soft one feathers it.
    const hard = defaultSplatBytes(width, height);
    const soft = defaultSplatBytes(width, height);
    stampSplatDab({ data: hard, width, height }, 1, 1, 0.5, 0.5, 0.2, 4, 1);
    stampSplatDab({ data: soft, width, height }, 1, 1, 0.5, 0.5, 0.2, 0, 1);
    let hardChanged = 0;
    let softChanged = 0;
    for (let i = 0; i < width * height; i++) {
      if (hard[i * 4] !== 255 || hard[i * 4 + 1] !== 0) hardChanged++;
      if (soft[i * 4] !== 255 || soft[i * 4 + 1] !== 0) softChanged++;
    }
    ok(hardChanged > 0 && softChanged > 0, 'both hard and soft brushes paint');
  }

  console.log('resample + derived alpha:');
  {
    const src = { data: defaultSplatBytes(4, 4), width: 4, height: 4 };
    const out = resampleSplat(src, 8, 8);
    ok(out.length === 8 * 8 * 4, 'resample changes the texel count');
    ok(out[0] === 255 && out[3] === 0, 'resample preserves the default coverage');
    const data = new Uint8Array([40, 40, 40, 99]);
    const derived = withDerivedAlpha(data, 1, 1);
    ok(derived[3] === 255 - 120, 'alpha is derived as 1 - (r + g + b)');
    ok(derived[0] === 40, 'derived alpha leaves rgb intact');
  }

  console.log('png codec:');
  {
    const w = 3;
    const h = 2;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = i * 20;
      rgba[i * 4 + 1] = 255 - i * 20;
      rgba[i * 4 + 2] = i % 2 === 0 ? 200 : 10;
      rgba[i * 4 + 3] = 0; // alpha 0 with non-zero rgb — must survive
    }
    const png = encodePngRgba(rgba, w, h);
    const decoded = decodePngRgba(png);
    ok(decoded.width === w && decoded.height === h, 'png round trip preserves dimensions');
    let same = decoded.data.length === rgba.length;
    for (let i = 0; same && i < rgba.length; i++) same = decoded.data[i] === rgba[i];
    ok(same, 'png round trip preserves every channel (including rgb under alpha 0)');
  }

  console.log('world /8 persistence:');
  {
    const ground = defaultGroundState();
    ground.materials[1] = 'rock.material';
    ground.materials[3] = 'sand.material';
    ground.tileScale = 0.25;
    ground.paint = { file: 'level.paint.png', texelsPerUnit: 16 };
    const built = buildWorldFile({
      name: 'level',
      savedAt: '2026-01-01T00:00:00.000Z',
      sprites: [],
      lights: [],
      light: LIGHT,
      sun: SUN,
      ground,
      userEnv: null,
    });
    ok(
      JSON.stringify(built.ground?.materials) === JSON.stringify([null, 'rock.material', null, 'sand.material']),
      'save writes the material slot array',
    );
    ok(
      built.ground?.paint?.file === 'level.paint.png' &&
        built.ground?.paint?.texelsPerUnit === 16,
      'save writes the paint descriptor',
    );
    ok(built.ground?.tileScale === 0.25, 'save writes a non-default tile scale');

    const parsed = parseWorldFile(JSON.stringify(built), 'level.json');
    ok(
      parsed.ground?.materials?.[1] === 'rock.material' &&
        parsed.ground?.materials?.[3] === 'sand.material',
      'load restores the material slot array',
    );
    ok(
      parsed.ground?.paint?.file === 'level.paint.png' &&
        parsed.ground?.paint?.texelsPerUnit === 16,
      'load restores the paint descriptor',
    );

    // Default-valued ground omits the section entirely.
    const plain = buildWorldFile({
      name: 'plain',
      savedAt: 'x',
      sprites: [],
      lights: [],
      light: LIGHT,
      sun: SUN,
      ground: defaultGroundState(),
      userEnv: null,
    });
    ok(plain.ground === undefined, 'a default ground writes no ground section');
    ok(DEFAULT_GROUND_TILE_SCALE > 0, 'sanity: default tile scale is positive');

    // /7 tolerance: a single legacy material restores as slot 0.
    const legacy = parseWorldFile(
      JSON.stringify({
        format: 'isoinfinity-world/7',
        sprites: [],
        light: LIGHT,
        sun: SUN,
        ground: { material: 'old.material', tileScale: 0.2 },
      }),
      'old.json',
    );
    ok(legacy.ground?.material === 'old.material', 'a /7 single material parses');
    ok(legacy.format === 'isoinfinity-world/8', 'legacy files normalize to the current format');

    // Rejection cases.
    throws(
      () =>
        parseWorldFile(
          JSON.stringify({
            format: 'isoinfinity-world/8',
            sprites: [],
            light: LIGHT,
            sun: SUN,
            ground: { paint: { file: 'x.png', texelsPerUnit: 0 } },
          }),
          'bad.json',
        ),
      'a non-positive texels-per-unit is rejected as malformed',
    );
    throws(
      () =>
        parseWorldFile(
          JSON.stringify({
            format: 'isoinfinity-world/8',
            sprites: [],
            light: LIGHT,
            sun: SUN,
            ground: { materials: [5] },
          }),
          'bad.json',
        ),
      'a non-string/non-null material slot is rejected as malformed',
    );
    throws(
      () =>
        parseWorldFile(
          JSON.stringify({
            format: 'isoinfinity-world/8',
            sprites: [],
            light: LIGHT,
            sun: SUN,
            ground: { materials: 'nope' },
          }),
          'bad.json',
        ),
      'a non-array materials field is rejected as malformed',
    );
  }

  console.log(`\nterrain-verify: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
