/**
 * Node-runnable verification for the dynamic-mesh path (no WebGL, no DOM):
 * CesiumMan GLB structure and parse, skinned-asset extraction, the pose
 * engine's joint palettes, and the SH irradiance probe against a direct
 * numerical integral. Run with:
 *   npx esbuild src/runtime/mesh-verify.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/mesh-verify.mjs && node /tmp/mesh-verify.mjs
 */
import { Box3, Matrix4, Vector3 } from 'three';
import { readContainerJson } from '../bake/gltf.js';
import cesiumManDataUrl from '../app/assets/CesiumMan.glb?url';
import {
  CharacterPlayer,
  MAX_JOINTS,
  bindPosePalette,
  parseCharacterAsset,
} from './meshAsset.js';
import {
  equirectFromProcedural,
  evalIrradianceSh,
  projectRadianceSh,
} from './shProbe.js';

/** The CPU SH basis, re-exported for the verify script's reconstruction. */
import { shBasis as shBasisProbe } from './shProbe.js';

// GLTFLoader picks its image loader by `typeof createImageBitmap`; stubs
// let the full parse run headless (texture pixels are never used here —
// the GPU path is browser-only).
const g = globalThis as Record<string, unknown>;
g.self = globalThis;
g.createImageBitmap = async (): Promise<{ width: number; height: number; close(): void }> => ({
  width: 4,
  height: 4,
  close() {},
});
(URL as unknown as Record<string, unknown>).createObjectURL = (): string => 'data:,';
(URL as unknown as Record<string, unknown>).revokeObjectURL = (): void => {};

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

/** The committed GLB, embedded as a base64 data URL by esbuild. */
const glbBuffer: ArrayBuffer = (() => {
  const bin = atob(cesiumManDataUrl.slice(cesiumManDataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
})();

function structuralChecks(): void {
  console.log('CesiumMan GLB structure:');
  const json = readContainerJson('CesiumMan.glb', glbBuffer) as {
    skins?: { joints: number[]; inverseBindMatrices?: number }[];
    animations?: unknown[];
    meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  };
  ok((json.skins?.length ?? 0) === 1, 'exactly one skin');
  ok((json.skins?.[0]?.joints.length ?? 0) > 0 && (json.skins?.[0]?.joints.length ?? 0) <= MAX_JOINTS,
    `joint count ${json.skins?.[0]?.joints.length} within the ${MAX_JOINTS} cap`);
  ok(json.skins?.[0]?.inverseBindMatrices !== undefined, 'skin carries inverse bind matrices');
  ok((json.animations?.length ?? 0) >= 1, 'at least one animation clip');
  const attrs = json.meshes?.[0]?.primitives?.[0]?.attributes ?? {};
  ok(attrs.JOINTS_0 !== undefined && attrs.WEIGHTS_0 !== undefined, 'JOINTS_0/WEIGHTS_0 attributes');
  ok(attrs.POSITION !== undefined && attrs.NORMAL !== undefined, 'POSITION/NORMAL attributes');
}

async function assetChecks(): Promise<void> {
  console.log('Skinned asset extraction:');
  const asset = await parseCharacterAsset(glbBuffer);
  const g = asset.geometry;
  ok(g.jointCount === 19, `joint count ${g.jointCount} (CesiumMan rig)`);
  ok(asset.clips.length === 1, `one clip (${asset.clips.length})`);
  ok(g.vertexCount > 0 && g.indices.length > 0, `geometry ${g.vertexCount} verts, ${g.indices.length} indices`);
  ok(g.positions.length === g.vertexCount * 3 && g.normals.length === g.vertexCount * 3,
    'position/normal arrays sized');
  ok(g.joints.length === g.vertexCount * 4 && g.weights.length === g.vertexCount * 4,
    'joint/weight arrays sized');
  ok(g.joints.every((j) => j >= 0 && j < g.jointCount), 'joint indices in range');
  ok(Number.isFinite(asset.height) && asset.height > 0, `first-pose height ${asset.height.toFixed(3)}`);
  ok(asset.worldOffset.every(Number.isFinite), 'world offset finite');

  console.log('Pose engine palettes:');
  const player = new CharacterPlayer(asset);
  const identity = bindPosePalette(g.jointCount);
  ok(identity[0] === 1 && identity[5] === 1 && identity[10] === 1 && identity[15] === 1,
    'bind-pose palette is identity');
  ok(identity.length === g.jointCount * 16, 'bind-pose palette sized');

  // End-to-end: CPU-skin the bind-pose geometry with a live palette —
  // the composed chain (extraction · palette · world offset) is what the
  // vertex shader + draw origin do. The character must stand roughly on
  // y = 0, centered over x/z.
  const skinBbox = (): Box3 => {
    const b = new Box3(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity),
    );
    const p = new Vector3();
    for (let i = 0; i < g.vertexCount; i++) {
      p.set(0, 0, 0);
      for (let c = 0; c < 4; c++) {
        const w = g.weights[i * 4 + c];
        if (w === 0) continue;
        const j = g.joints[i * 4 + c] * 16;
        const m = player.palette;
        p.x += w * (m[j] * g.positions[i * 3] + m[j + 4] * g.positions[i * 3 + 1] + m[j + 8] * g.positions[i * 3 + 2] + m[j + 12]);
        p.y += w * (m[j + 1] * g.positions[i * 3] + m[j + 5] * g.positions[i * 3 + 1] + m[j + 9] * g.positions[i * 3 + 2] + m[j + 13]);
        p.z += w * (m[j + 2] * g.positions[i * 3] + m[j + 6] * g.positions[i * 3 + 1] + m[j + 10] * g.positions[i * 3 + 2] + m[j + 14]);
      }
      p.x += asset.worldOffset[0];
      p.y += asset.worldOffset[1];
      p.z += asset.worldOffset[2];
      b.expandByPoint(p);
    }
    return b;
  };
  player.update(0);
  const skinned = skinBbox();
  console.log(`    [probe] worldOffset=${asset.worldOffset.map((v) => v.toFixed(3)).join(',')}`);
  console.log(`    [probe] player t=0 bbox min=${skinned.min.toArray().map((v) => v.toFixed(3)).join(',')} max=${skinned.max.toArray().map((v) => v.toFixed(3)).join(',')}`);
  ok(Math.abs(skinned.min.y) < 0.25, `rendered pose near the ground (min y ${skinned.min.y.toFixed(3)})`);
  ok(Math.abs(skinned.min.x + skinned.max.x) < 0.05 && Math.abs(skinned.min.z + skinned.max.z) < 0.05,
    'rendered pose centered over the origin');
  ok(skinned.max.y - skinned.min.y > 1 && skinned.max.y - skinned.min.y < 2.5,
    `rendered height plausible (${(skinned.max.y - skinned.min.y).toFixed(3)})`);
  player.update(0.25);
  const s25 = skinBbox();
  player.update(0.25);
  const s50 = skinBbox();
  player.update(0.25);
  const s75 = skinBbox();
  const fmt = (b: Box3): string => `min.y=${b.min.y.toFixed(3)} max.y=${b.max.y.toFixed(3)}`;
  console.log(`    [probe] walk cycle: t25 ${fmt(s25)} | t50 ${fmt(s50)} | t75 ${fmt(s75)}`);
  ok(Math.abs(s25.min.y) < 0.3 && Math.abs(s50.min.y) < 0.3 && Math.abs(s75.min.y) < 0.3,
    'feet stay near the ground across the walk cycle');

  // Playback state: the animated palette differs from the bind pose and
  // keeps changing across sampled frames.
  player.update(0);
  const first = new Float32Array(player.palette);
  let differsFromIdentity = false;
  for (let i = 0; i < first.length; i++) {
    if (Math.abs(first[i] - identity[i]) > 1e-4) {
      differsFromIdentity = true;
      break;
    }
  }
  ok(differsFromIdentity, 'animated pose differs from the bind pose');
  player.update(0.5);
  let differsOverTime = false;
  for (let i = 0; i < player.palette.length; i++) {
    if (Math.abs(player.palette[i] - first[i]) > 1e-4) {
      differsOverTime = true;
      break;
    }
  }
  ok(differsOverTime, 'palette changes across sampled frames');
  const m = new Matrix4().fromArray(player.palette.subarray(0, 16));
  const pos = new Vector3().setFromMatrixPosition(m);
  ok(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z),
    'palette matrices finite');
  player.release();
}

function groundTruthIrradiance(
  radiance: (d: [number, number, number]) => [number, number, number],
  n: readonly [number, number, number],
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  const env = equirectFromProcedural();
  const { width: w, height: h, bottomUp } = env;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const row = bottomUp ? (y + 0.5) / h : 1 - (y + 0.5) / h;
      const theta = (row - 0.5) * Math.PI;
      const phi = (u - 0.5) * Math.PI * 2;
      const cos = Math.cos(theta);
      const d: [number, number, number] = [cos * Math.cos(phi), Math.sin(theta), cos * Math.sin(phi)];
      const ndl = Math.max(n[0] * d[0] + n[1] * d[1] + n[2] * d[2], 0);
      const dOmega = Math.max(Math.cos(theta), 0) * (Math.PI / h) * ((Math.PI * 2) / w);
      const L = radiance(d);
      out[0] += L[0] * ndl * dOmega;
      out[1] += L[1] * ndl * dOmega;
      out[2] += L[2] * ndl * dOmega;
    }
  }
  return out;
}

function shChecks(): void {
  console.log('SH irradiance probe:');
  const env = equirectFromProcedural();
  ok(env.rgba.length === env.width * env.height * 4, 'procedural radiance extracted');
  const coeffs = projectRadianceSh(env, { rotationDeg: 0, intensity: 1 });
  ok(coeffs.length === 27, '27 coefficients');
  ok([...coeffs].every(Number.isFinite), 'coefficients finite');

  // The ground truth is the direct integral of the *band-limited* radiance
  // (reconstructed from the same 9 coefficients): this isolates the kernel
  // and weights — which must be near-exact — from the inherent band
  // truncation of sharp features (the sun disc), which irradiance envmaps
  // smooth by design.
  const radiance = projectRadianceSh(env, { rotationDeg: 0, intensity: 1 });
  const reconstruct = (d: [number, number, number]): [number, number, number] => {
    const b = shBasisProbe(d);
    return [0, 1, 2].map((c) => {
      let v = 0;
      for (let k = 0; k < 9; k++) v += radiance[k * 3 + c] * b[k];
      return v;
    }) as [number, number, number];
  };
  let worst = 0;
  const probes: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [0.577, 0.577, 0.577], [-0.707, 0, 0.707],
  ];
  for (const n of probes) {
    const len = Math.hypot(n[0], n[1], n[2]);
    const unit: [number, number, number] = [n[0] / len, n[1] / len, n[2] / len];
    const sh = evalIrradianceSh(coeffs, unit);
    const truth = groundTruthIrradiance(reconstruct, unit);
    for (let c = 0; c < 3; c++) {
      worst = Math.max(worst, Math.abs(sh[c] - truth[c]));
    }
  }
  ok(worst < 0.05, `SH kernel matches the band-limited integral (worst absolute ${worst.toFixed(4)})`);

  // Rotational plausibility: the procedural sun sits at azimuth 60°,
  // elevation 45°; the bright side must face the sun, and rotating the env
  // must move the response.
  const sunAz = (60 * Math.PI) / 180;
  const sunEl = (45 * Math.PI) / 180;
  const sun: [number, number, number] = [
    Math.cos(sunEl) * Math.cos(sunAz),
    Math.sin(sunEl),
    Math.cos(sunEl) * Math.sin(sunAz),
  ];
  const anti: [number, number, number] = [-sun[0], sun[1], -sun[2]];
  const lit = evalIrradianceSh(coeffs, sun);
  const dark = evalIrradianceSh(coeffs, anti);
  ok(lit[0] > dark[0], `sunlit side brighter (${lit[0].toFixed(3)} > ${dark[0].toFixed(3)})`);
  const rotated = projectRadianceSh(env, { rotationDeg: 90, intensity: 1 });
  const litR = evalIrradianceSh(rotated, sun);
  ok(Math.abs(litR[0] - lit[0]) > 1e-3, `rotation moves the light (${lit[0].toFixed(3)} → ${litR[0].toFixed(3)})`);
  const dim = projectRadianceSh(env, { rotationDeg: 0, intensity: 0.5 });
  const litD = evalIrradianceSh(dim, sun);
  ok(Math.abs(litD[0] - lit[0] * 0.5) < 1e-3, 'intensity scales linearly');
}

async function main(): Promise<void> {
  structuralChecks();
  await assetChecks();
  shChecks();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
