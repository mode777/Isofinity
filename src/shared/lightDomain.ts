import { VIEW_DIR, type Vec3 } from './iso.js';

/**
 * The shadow-valid key-light domain (see the add-dynamic-directional-shadows
 * change, design D3). The directional shadow is reconstructed from the
 * camera-facing sprite relief, which is a well-conditioned occluder only
 * when the light comes from roughly the camera's side. The domain is the
 * intersection of:
 *
 *  - an off-axis cone around the camera view direction (`VIEW_DIR`) with
 *    half-angle `MAX_OFF_AXIS_DEG`, and
 *  - an elevation floor of `MIN_ELEVATION_DEG` above the ground plane.
 *
 * The single angular bound is what makes the constraint robust: separate
 * azimuth/elevation ranges can pick an unlucky combination that leaves the
 * relief edge-on, while one cone around the view ray cannot.
 */
export const MAX_OFF_AXIS_DEG = 65;
export const MIN_ELEVATION_DEG = 10;

const MAX_OFF_AXIS_COS = Math.cos((MAX_OFF_AXIS_DEG * Math.PI) / 180);
const MIN_ELEVATION_SIN = Math.sin((MIN_ELEVATION_DEG * Math.PI) / 180);

const DEG = 180 / Math.PI;

/** Unit direction (toward the light) from panel azimuth/elevation degrees. */
export function directionFromAzEl(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

/** Panel azimuth/elevation degrees (rounded) from a unit direction. */
export function azElFromDirection(dir: Vec3): { azimuthDeg: number; elevationDeg: number } {
  const elevationDeg = Math.asin(Math.min(1, Math.max(-1, dir[1]))) * DEG;
  let azimuthDeg = Math.atan2(dir[2], dir[0]) * DEG;
  azimuthDeg = ((azimuthDeg % 360) + 360) % 360;
  return { azimuthDeg, elevationDeg };
}

function normalize(v: Vec3): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Project a direction (toward the light) onto the shadow-valid domain,
 * returning the nearest valid unit direction. Alternating projection onto
 * the two spherical caps converges quickly (the intersection is a caps
 * intersection containing `VIEW_DIR`). Deterministic and pure.
 */
export function clampLightDirection(dir: Vec3): Vec3 {
  let [x, y, z] = normalize(dir);
  const vx = VIEW_DIR[0];
  const vy = VIEW_DIR[1];
  const vz = VIEW_DIR[2];
  for (let i = 0; i < 8; i++) {
    // Elevation floor: raise toward +Y until y meets the minimum.
    if (y < MIN_ELEVATION_SIN) {
      let hx = x;
      let hz = z;
      const horiz = Math.hypot(hx, hz);
      if (horiz < 1e-6) {
        hx = vx;
        hz = vz;
      } else {
        hx /= horiz;
        hz /= horiz;
      }
      const h = Math.sqrt(Math.max(0, 1 - MIN_ELEVATION_SIN * MIN_ELEVATION_SIN));
      x = hx * h;
      z = hz * h;
      y = MIN_ELEVATION_SIN;
    }
    // Off-axis cone: rotate toward VIEW_DIR until inside the cap.
    const dot = x * vx + y * vy + z * vz;
    if (dot < MAX_OFF_AXIS_COS) {
      let ux = vx - dot * x;
      let uy = vy - dot * y;
      let uz = vz - dot * z;
      const ul = Math.hypot(ux, uy, uz);
      if (ul < 1e-9) {
        x = vx;
        y = vy;
        z = vz;
        continue;
      }
      ux /= ul;
      uy /= ul;
      uz /= ul;
      const delta = Math.acos(Math.min(1, Math.max(-1, dot))) - Math.acos(MAX_OFF_AXIS_COS);
      const c = Math.cos(delta);
      const s = Math.sin(delta);
      x = x * c + ux * s;
      y = y * c + uy * s;
      z = z * c + uz * s;
      const l = Math.hypot(x, y, z) || 1;
      x /= l;
      y /= l;
      z /= l;
    }
  }
  return [x, y, z];
}

/** True when a direction lies inside the domain (with a tolerance). */
export function isInLightDomain(dir: Vec3, tolerance = 1e-3): boolean {
  const [x, y, z] = normalize(dir);
  const dot = x * VIEW_DIR[0] + y * VIEW_DIR[1] + z * VIEW_DIR[2];
  return dot >= MAX_OFF_AXIS_COS - tolerance && y >= MIN_ELEVATION_SIN - tolerance;
}
