import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { FloatType, RGBAFormat } from 'three';
import { proceduralEnvironment } from './assets.js';

/**
 * Environment-derived diffuse ambient for dynamic meshes: the equirect
 * environment the sprites' render pass was baked with, projected to a
 * 9-coefficient spherical-harmonics irradiance probe. Projected once per
 * environment; evaluated per pixel in the mesh fragment shader as a
 * quadratic polynomial of the normal.
 */

/** Raw equirect radiance: RGBA float pixels, plus row order. */
export interface EquirectRadiance {
  rgba: Float32Array;
  width: number;
  height: number;
  /** Row 0 is the bottom of the image (GL texture order) when true. */
  bottomUp: boolean;
}

/** Environment parameters that shape the probe (bake provenance values). */
export interface EnvParams {
  rotationDeg: number;
  intensity: number;
}

/**
 * The built-in default environment as raw radiance (used when no sprite
 * bundle provides an env in its provenance). The procedural sky's
 * DataTexture stores GL row order (row 0 = south pole).
 */
export function equirectFromProcedural(): EquirectRadiance {
  const env = proceduralEnvironment();
  const tex = env.texture;
  if (!tex) throw new Error('procedural environment has no texture');
  const image = tex.image as { data: Float32Array; width: number; height: number };
  if (!image?.data) throw new Error('procedural environment has no image data');
  return { rgba: image.data, width: image.width, height: image.height, bottomUp: true };
}

/** Decode an HDRI (.exr) file's equirect radiance (GL row order). */
export function equirectFromExr(buffer: ArrayBuffer): EquirectRadiance {
  const loader = new EXRLoader();
  loader.type = FloatType;
  const tex = loader.parse(buffer) as {
    width: number;
    height: number;
    format: number;
    type: number;
    data: Float32Array;
  };
  if (tex.type !== FloatType || tex.format !== RGBAFormat) {
    throw new Error('HDRI must decode to float RGBA');
  }
  return { rgba: tex.data, width: tex.width, height: tex.height, bottomUp: true };
}

/**
 * Direction for one equirect pixel, matching the procedural sky's
 * generation (phi = (u - 1/2)·2π, theta = (v - 1/2)·π with v measured
 * from the bottom row up).
 */
function pixelDirection(x: number, y: number, w: number, h: number, bottomUp: boolean): [number, number, number] {
  const u = (x + 0.5) / w;
  const row = bottomUp ? (y + 0.5) / h : 1 - (y + 0.5) / h;
  const theta = (row - 0.5) * Math.PI;
  const phi = (u - 0.5) * Math.PI * 2;
  const cos = Math.cos(theta);
  return [cos * Math.cos(phi), Math.sin(theta), cos * Math.sin(phi)];
}

/** Solid angle (steradians) of one equirect pixel (cosθ, from sinθ = dy). */
function pixelSolidAngle(w: number, h: number, dy: number): number {
  const cosTheta = Math.sqrt(Math.max(0, 1 - dy * dy));
  return cosTheta * (Math.PI / h) * ((Math.PI * 2) / w);
}

/**
 * Orthonormal real SH basis, l = 0..2, evaluated at `d`. Order:
 * [1, y, z, x, xy, yz, 3z²-1, xz, x²-y²] — mirrored in
 * `SH_IRRADIANCE_GLSL`; keep both in sync.
 */
function shBasis(d: readonly [number, number, number]): [
  number, number, number, number, number, number, number, number, number,
] {
  const [x, y, z] = d;
  return [
    0.282095,
    0.488603 * y,
    0.488603 * z,
    0.488603 * x,
    1.092548 * x * y,
    1.092548 * y * z,
    0.315392 * (3 * z * z - 1),
    1.092548 * x * z,
    0.315392 * (x * x - y * y),
  ];
}

/**
 * Project equirect radiance to the 9 RGB SH radiance coefficients (27
 * floats, `uSh[0..8]` order, no irradiance band weights). Applies the
 * environment's rotation (about world Y) and intensity.
 */
export function projectRadianceSh(env: EquirectRadiance, params: EnvParams): Float32Array {
  const coeffs = new Float32Array(27);
  const w = env.width;
  const h = env.height;
  const rot = (params.rotationDeg * Math.PI) / 180;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (y * w + x) * 4;
      const lr = env.rgba[px] * params.intensity;
      const lg = env.rgba[px + 1] * params.intensity;
      const lb = env.rgba[px + 2] * params.intensity;
      const [dx0, dy, dz0] = pixelDirection(x, y, w, h, env.bottomUp);
      // Environment rotation: look up the radiance the world direction
      // sees, with the env turned about Y (same axis as the bake's
      // environmentRotation).
      const dx = cr * dx0 + sr * dz0;
      const dz = -sr * dx0 + cr * dz0;
      const b = shBasis([dx, dy, dz]);
      const dOmega = pixelSolidAngle(w, h, dy);
      for (let k = 0; k < 9; k++) {
        coeffs[k * 3] += b[k] * lr * dOmega;
        coeffs[k * 3 + 1] += b[k] * lg * dOmega;
        coeffs[k * 3 + 2] += b[k] * lb * dOmega;
      }
    }
  }
  return coeffs;
}

/**
 * Evaluate the probe's irradiance at a normal from the RAW radiance
 * coefficients — the Ramamoorthi band weights (π, 2π/3, π/4) are applied
 * HERE and in `SH_IRRADIANCE_GLSL`, exactly once. This is the CPU twin of
 * the mesh shader's `shIrradiance()`, used by the Node verification to
 * check the GLSL basis against a direct numerical integral.
 */
export function evalIrradianceSh(coeffs: Float32Array, n: readonly [number, number, number]): [number, number, number] {
  const b = shBasis(n);
  const out: [number, number, number] = [0, 0, 0];
  const A = [Math.PI, (2 * Math.PI) / 3, Math.PI / 4];
  for (let k = 0; k < 9; k++) {
    const band = k === 0 ? 0 : k < 4 ? 1 : 2;
    out[0] += A[band] * coeffs[k * 3] * b[k];
    out[1] += A[band] * coeffs[k * 3 + 1] * b[k];
    out[2] += A[band] * coeffs[k * 3 + 2] * b[k];
  }
  return out;
}

export { shBasis };

/**
 * The mesh shader's probe evaluation — same basis and band weights as the
 * CPU functions above (single source of truth is the numeric validation in
 * `mesh-verify.ts`; keep all three in sync).
 */
export const SH_IRRADIANCE_GLSL = `
uniform vec3 uSh[9];
vec3 shIrradiance(vec3 N) {
  float y0 = 0.282095;
  float y1 = 0.488603 * N.y;
  float y2 = 0.488603 * N.z;
  float y3 = 0.488603 * N.x;
  float y4 = 1.092548 * N.x * N.y;
  float y5 = 1.092548 * N.y * N.z;
  float y6 = 0.315392 * (3.0 * N.z * N.z - 1.0);
  float y7 = 1.092548 * N.x * N.z;
  float y8 = 0.315392 * (N.x * N.x - N.y * N.y);
  return 3.141593 * uSh[0] * y0
       + 2.094395 * (uSh[1] * y1 + uSh[2] * y2 + uSh[3] * y3)
       + 0.785398 * (uSh[4] * y4 + uSh[5] * y5 + uSh[6] * y6 + uSh[7] * y7 + uSh[8] * y8);
}
`;
