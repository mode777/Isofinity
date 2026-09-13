/**
 * Node-runnable verification for the reconstructed directional shadow
 * (no WebGL, no DOM): light-domain clamping, per-layer occluder point
 * reconstruction, field sizing, splatting, and the CPU height-field march
 * that mirrors the deferred shader. Run with:
 *   npx esbuild src/runtime/shadow-verify.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/shadow-verify.mjs && node /tmp/shadow-verify.mjs
 */
import { DataUtils } from 'three';
import { VIEW_DIR } from '../shared/iso.js';
import {
  clampAzEl,
  clampLightDirection,
  directionFromAzEl,
  isInLightDomain,
  LIGHT_AZIMUTH_MAX_DEG,
  LIGHT_AZIMUTH_MIN_DEG,
  LIGHT_ELEVATION_MAX_DEG,
  LIGHT_ELEVATION_MIN_DEG,
  MAX_OFF_AXIS_DEG,
} from '../shared/lightDomain.js';
import {
  buildLayerShadowPoints,
  buildShadowField,
  shadowFieldSize,
  shadowVisibilityCPU,
  splatWorldPoints,
  type ShadowField,
  type ShadowLayerSource,
} from './shadowField.js';

declare const process: { exit(code?: number): void };

let passed = 0;
let failed = 0;

function ok(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ok - ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL - ${msg}`);
  }
}

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;
const half = (v: number): number => DataUtils.toHalfFloat(v);

function domainChecks(): void {
  console.log('test: light-domain clamping');
  // Every clamp lands inside the domain across the whole az/el space.
  let allIn = true;
  for (let az = -30; az <= 390; az += 15) {
    for (let el = -40; el <= 100; el += 10) {
      if (!isInLightDomain(clampLightDirection(directionFromAzEl(az, el)), 1e-6)) {
        allIn = false;
      }
    }
  }
  ok(allIn, 'every clamped direction lies in the domain');

  // A direction already inside is unchanged (VIEW_DIR = az 45, el 30).
  const inDom = directionFromAzEl(45, 30);
  const kept = clampLightDirection(inDom);
  ok(
    near(kept[0], VIEW_DIR[0]) && near(kept[1], VIEW_DIR[1]) && near(kept[2], VIEW_DIR[2]),
    'a valid direction passes through unchanged',
  );

  // Below the elevation floor is raised.
  const low = clampLightDirection(directionFromAzEl(45, -20));
  ok(low[1] >= Math.sin((10 * Math.PI) / 180) - 1e-6, 'a below-floor direction is raised');

  // Far off-axis is pulled into the cone.
  const far = clampLightDirection(directionFromAzEl(225, 30));
  const dot = far[0] * VIEW_DIR[0] + far[1] * VIEW_DIR[1] + far[2] * VIEW_DIR[2];
  ok(dot >= Math.cos((MAX_OFF_AXIS_DEG * Math.PI) / 180) - 1e-6, 'a far off-axis direction is pulled in');

  // The editor's slider window is inscribed in the cone: every boundary
  // az/el maps to a direction the cone clamp leaves untouched, so a slider
  // drag never snaps back.
  let windowInscribed = true;
  for (let az = LIGHT_AZIMUTH_MIN_DEG; az <= LIGHT_AZIMUTH_MAX_DEG; az += 5) {
    for (let el = LIGHT_ELEVATION_MIN_DEG; el <= LIGHT_ELEVATION_MAX_DEG; el += 5) {
      const raw = directionFromAzEl(az, el);
      const clamped = clampLightDirection(raw);
      if (
        Math.hypot(clamped[0] - raw[0], clamped[1] - raw[1], clamped[2] - raw[2]) > 1e-6
      ) {
        windowInscribed = false;
      }
    }
  }
  ok(windowInscribed, 'the slider window is inscribed in the shadow-valid cone');

  // Azimuth clamping is wrap-aware: 350° (≡ -10°) clamps to the near edge
  // of the window, not the far one (105°).
  const wrapped = clampAzEl(350, 45);
  ok(
    wrapped.azimuthDeg < 0 && wrapped.azimuthDeg >= LIGHT_AZIMUTH_MIN_DEG,
    `wrap clamps to the near edge (${wrapped.azimuthDeg}°)`,
  );
}

function buildChecks(): void {
  console.log('test: occluder point reconstruction + field');
  // One covered texel (normal +Y, depth 1.0) and one empty texel.
  const gb = new Uint16Array(2 * 4);
  gb[0] = half(0);
  gb[1] = half(1);
  gb[2] = half(0);
  gb[3] = half(1);
  const set: ShadowLayerSource = {
    sizes: [[2, 1]],
    origins: [[0, 0]],
    anchors: [[0, 0, 0]],
    ppus: [1],
    maxW: 2,
    gbufferLayers: [gb],
  };

  const pts = buildLayerShadowPoints(set, 0);
  ok(pts.length === 3, `masked-out texels cast nothing (kept ${pts.length / 3} of 2)`);
  ok(
    near(pts[0], VIEW_DIR[0], 1e-3) && near(pts[1], VIEW_DIR[1], 1e-3) && near(pts[2], VIEW_DIR[2], 1e-3),
    'a covered texel reconstructs to its expected world offset',
  );

  const field = buildShadowField(
    set,
    [{ x: 0, y: 0, z: 0, layer: 0 }],
    2,
    2,
    new Map([[0, pts]]),
  );
  ok(near(field.maxHeight, VIEW_DIR[1], 1e-3), `field peak height (${field.maxHeight.toFixed(3)})`);

  // Sizing under the texel cap.
  const big = shadowFieldSize(128, 128);
  ok(big.width === 2048 && big.height === 2048, 'a 128-unit world caps at 2048 texels/axis');
  const small = shadowFieldSize(12, 12);
  ok(small.width === 192 && near(small.cellX, 0.0625), 'a 12-unit world uses the target cell size');
}

function marchChecks(): void {
  console.log('test: height-field march (CPU reference)');
  const size = shadowFieldSize(4, 4);
  const field: ShadowField = {
    data: new Float32Array(size.width * size.height),
    width: size.width,
    height: size.height,
    originX: 0,
    originZ: 0,
    cellX: size.cellX,
    cellZ: size.cellZ,
    maxHeight: 1.5,
  };
  // A 1.5-high occluder at world (2, 0).
  const cx = Math.floor(2 / field.cellX);
  const cz = 0;
  field.data[cz * field.width + cx] = 1.5;

  const lxz = Math.hypot(1, 0);
  const light: [number, number, number] = [1 / lxz, 0.2 / lxz, 0];
  // Receiver in front of the occluder along the light's horizontal ray.
  ok(shadowVisibilityCPU(field, 0, 0, 0, light) === 0, 'a receiver in the ray is occluded');
  // Receiver past the occluder: the ray marches away from it.
  ok(shadowVisibilityCPU(field, 3, 0, 0, light) === 1, 'a receiver beyond the occluder is lit');

  // A shorter occluder is cleared by the normal offset (a plain height bias
  // would have kept it): the ray origin lifts along the receiver's normal.
  const lower: ShadowField = { ...field, data: field.data.slice() };
  lower.data[cz * lower.width + cx] = 0.5;
  ok(
    shadowVisibilityCPU(lower, 0, 0, 0, light) === 1,
    'normal offset clears an occluder a plain height bias would keep',
  );

  // Extra world points splat on top (mesh compounding).
  const before = field.maxHeight;
  const raised = splatWorldPoints(field, new Float32Array([1, 2.0, 1]));
  ok(raised > before && near(field.maxHeight, 2.0), 'splatWorldPoints raises the field peak');
}

function main(): void {
  domainChecks();
  buildChecks();
  marchChecks();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
