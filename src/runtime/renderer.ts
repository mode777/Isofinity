import { SCREEN_RIGHT, SCREEN_UP, VIEW_DIR } from '../shared/iso.js';
import { SH_IRRADIANCE_GLSL } from './shProbe.js';
import type { MeshGeometry, MeshSurface } from './meshAsset.js';
import {
  SHADOW_BIAS,
  SHADOW_BIAS_EPSILON,
  SHADOW_MAX_STEPS,
  type ShadowField,
} from './shadowField.js';

/** Joint-palette cap, mirroring `meshAsset.ts`. */
export const MAX_MESH_JOINTS = 64;

/** Compile-time cap on concurrently rendered point lights (deferred pass). */
export const MAX_POINT_LIGHTS = 16;

/**
 * A point light for the deferred light pass. `color` is linear RGB (the
 * editor converts its sRGB picker before upload); `energy` scales it.
 */
export interface PointLightGpu {
  /** World-space emitting position (x, y, z). */
  pos: readonly [number, number, number];
  /** Falloff radius (world units; contribution reaches zero at the edge). */
  radius: number;
  /** Linear-space RGB of the emitted color. */
  color: readonly [number, number, number];
  /** Radiance scale. */
  energy: number;
}

const COLOR_CHUNK = `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;

// The fixed iso frame as shader literals, generated from the shared
// constants so CPU projection (sprites) and GPU projection (meshes) can
// never drift apart.
const isoFloat = (n: number): string => n.toPrecision(9);
const ISO_GLSL = `
const vec3 VIEW_DIR = vec3(${isoFloat(VIEW_DIR[0])}, ${isoFloat(VIEW_DIR[1])}, ${isoFloat(VIEW_DIR[2])});
const vec3 SCREEN_RIGHT = vec3(${isoFloat(SCREEN_RIGHT[0])}, ${isoFloat(SCREEN_RIGHT[1])}, ${isoFloat(SCREEN_RIGHT[2])});
const vec3 SCREEN_UP = vec3(${isoFloat(SCREEN_UP[0])}, ${isoFloat(SCREEN_UP[1])}, ${isoFloat(SCREEN_UP[2])});
`;

// Inverse of the 2x2 right/up ground basis (the x/z columns of
// SCREEN_RIGHT/SCREEN_UP): screen coords -> ground (x, z). Generated from
// the same shared constants as ISO_GLSL; the CPU twin is
// `screenToGround`/`groundFromWorldImagePx` in src/shared/iso.ts.
const GROUND_UNPROJ_GLSL = `
const float SH_A11 = ${isoFloat(SCREEN_RIGHT[0])};
const float SH_A12 = ${isoFloat(SCREEN_RIGHT[2])};
const float SH_A21 = ${isoFloat(SCREEN_UP[0])};
const float SH_A22 = ${isoFloat(SCREEN_UP[2])};
const float SH_DET = ${isoFloat(SCREEN_RIGHT[0] * SCREEN_UP[2] - SCREEN_RIGHT[2] * SCREEN_UP[0])};
`;

// Three's ACES filmic fit (the bake tonemap's `tonemapping_fragment`),
// with exposure folded in as uExposure — the mesh path produces the same
// tonemapped texel the path-traced render pass stores.
const ACES_GLSL = `
uniform float uExposure;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  color *= uExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
`;

// Ground plane: a unit quad scaled to the world extent in the vertex
// stage (same iso projection as the mesh path); UVs derive from world xz
// so the material tiles in world units with REPEAT wrap.
const GROUND_VERT = `#version 300 es
precision highp float;
in vec2 aCorner;  // 0..1 over the world extent
uniform vec3 uProj;    // world-image origin px (x, y), px per unit
uniform vec2 uRes;
uniform vec4 uView;    // view transform: scale.xy, offset.xy (backing px)
uniform vec2 uExtent; // world extent (the plane spans [0, extent.x] × [0, extent.y])
out vec3 vWorldPos;
${ISO_GLSL}
void main() {
  vec3 wp = vec3(aCorner.x * uExtent.x, 0.0, aCorner.y * uExtent.y);
  vWorldPos = wp;
  vec2 px = vec2(uProj.x + dot(SCREEN_RIGHT, wp) * uProj.z,
                 uProj.y - dot(SCREEN_UP, wp) * uProj.z);
  px = px * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

// Lean PBR, geometry stage: the ground blends up to four materials' env-lit
// tonemapped texels (albedo·AO·SH ambient — its "prerender" equivalent) by
// their painted coverage, weighted by each material's displacement height,
// then writes the composited surface normal and depth; the deferred light
// pass adds the dynamic lights on top.
const GROUND_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uDiffuse;
uniform sampler2DArray uNormal;
uniform sampler2DArray uArm;
uniform sampler2DArray uDisp;
uniform sampler2D uSplat;
uniform vec2 uExtent;         // ground extent (world units)
uniform float uTileScale;     // tiles per world unit
uniform vec4 uSlotBound;      // 1.0 for slots with a bound material
uniform float uHeightScale;   // displacement seam strength
uniform vec4 uHeightBias;     // per-slot height bias
uniform float uDepthA;
uniform float uDepthB;
uniform float uSaturation;
in vec3 vWorldPos;
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outGbuf;
layout(location = 2) out vec4 outDepth;
${COLOR_CHUNK}
${ACES_GLSL}
${SH_IRRADIANCE_GLSL}
${ISO_GLSL}
void main() {
  vec2 uv = vWorldPos.xz * uTileScale;
  // Coverage: rgb = slots 0-2, slot 3 is the derived remainder.
  vec4 s = texture(uSplat, vWorldPos.xz / max(uExtent, vec2(1.0)));
  vec3 w3 = clamp(s.rgb, 0.0, 1.0);
  vec4 w = vec4(w3, max(0.0, 1.0 - (w3.r + w3.g + w3.b))) * uSlotBound;
  if (dot(w, vec4(1.0)) < 1e-4) w = uSlotBound;
  // Displacement height seam: absent maps sample as 1.0 (neutral).
  vec4 h = vec4(
    texture(uDisp, vec3(uv, 0.0)).r,
    texture(uDisp, vec3(uv, 1.0)).r,
    texture(uDisp, vec3(uv, 2.0)).r,
    texture(uDisp, vec3(uv, 3.0)).r);
  vec4 wf = w * max(vec4(1.0) + (h - vec4(0.5)) * uHeightScale + uHeightBias, vec4(0.0));
  wf = wf / max(dot(wf, vec4(1.0)), 1e-4);
  vec4 d0 = texture(uDiffuse, vec3(uv, 0.0));
  vec4 d1 = texture(uDiffuse, vec3(uv, 1.0));
  vec4 d2 = texture(uDiffuse, vec3(uv, 2.0));
  vec4 d3 = texture(uDiffuse, vec3(uv, 3.0));
  vec3 albedo = d0.rgb * wf.r + d1.rgb * wf.g + d2.rgb * wf.b + d3.rgb * wf.a;
  vec3 n0 = texture(uNormal, vec3(uv, 0.0)).xyz * 2.0 - 1.0;
  vec3 n1 = texture(uNormal, vec3(uv, 1.0)).xyz * 2.0 - 1.0;
  vec3 n2 = texture(uNormal, vec3(uv, 2.0)).xyz * 2.0 - 1.0;
  vec3 n3 = texture(uNormal, vec3(uv, 3.0)).xyz * 2.0 - 1.0;
  vec3 n = normalize(n0 * wf.r + n1 * wf.g + n2 * wf.b + n3 * wf.a);
  // gl tangent convention: xy tangent (+X/+Z world), +Z blue is up ->
  // world +Y. The plane's tangents are analytic, no per-vertex data.
  vec3 N = normalize(vec3(n.x, n.z, n.y));
  float ao = texture(uArm, vec3(uv, 0.0)).r * wf.r
           + texture(uArm, vec3(uv, 1.0)).r * wf.g
           + texture(uArm, vec3(uv, 2.0)).r * wf.b
           + texture(uArm, vec3(uv, 3.0)).r * wf.a;
  vec3 hdr = srgbToLinear(albedo) * ao * max(shIrradiance(N), vec3(0.0));
  vec3 texel = linearToSrgb(ACESFilmic(hdr));
  float lum = dot(texel, vec3(0.2126, 0.7152, 0.0722));
  outAlbedo = vec4(mix(vec3(lum), texel, uSaturation), 1.0);
  outGbuf = vec4(N, dot(VIEW_DIR, vWorldPos));
  outDepth = vec4(dot(VIEW_DIR, vWorldPos), 0.0, 0.0, 1.0);
  gl_FragDepth = uDepthA * dot(VIEW_DIR, vWorldPos) + uDepthB;
}
`;

const FLAT_VERT = `#version 300 es
in vec2 aPos;
in vec4 aColor;   // rgb + per-vertex alpha
uniform vec2 uRes;
uniform vec4 uView;  // view transform: scale.xy, offset.xy (backing-store px)
out vec4 vColor;
void main() {
  vec2 px = aPos * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vColor = aColor;
}
`;

// Editor chrome (hover highlight, gizmo) over the finished frame: unlit.
const OVERLAY_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main() {
  outColor = vColor;
}
`;

// Geometry-stage flat batch (the default ground): each vertex carries its
// ground-plane depth (the flat batch IS the ground plane) so the deferred
// pass can reconstruct the floor position; the flat ground keeps today's
// no-window-depth behavior (sprites always composite over it).
const FLAT_GROUND_VERT = `#version 300 es
in vec2 aPos;
in vec4 aColor;
uniform vec2 uRes;
uniform vec4 uView;
uniform vec3 uProj;
out vec4 vColor;
out float vGroundDepth;
${ISO_GLSL}
${GROUND_UNPROJ_GLSL}
void main() {
  vec2 px = aPos * uView.xy + uView.zw;
  vec2 s = vec2(aPos.x - uProj.x, uProj.y - aPos.y) / uProj.z;
  float gx = (SH_A22 * s.x - SH_A12 * s.y) / SH_DET;
  float gz = (SH_A11 * s.y - SH_A21 * s.x) / SH_DET;
  vGroundDepth = dot(VIEW_DIR, vec3(gx, 0.0, gz));
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vColor = aColor;
}
`;

const FLAT_GROUND_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in float vGroundDepth;
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outGbuf;
layout(location = 2) out vec4 outDepth;
void main() {
  outAlbedo = vec4(vColor.rgb, 1.0);
  outGbuf = vec4(0.0, 1.0, 0.0, 1.0);
  outDepth = vec4(vGroundDepth, 0.0, 0.0, 1.0);
}
`;

// Contact shadows: color-only composite (straight source, the blend
// applies the alpha); g-buffer and depth outputs are zero-weight so
// blending preserves the surface data behind them.
const FLAT_SHADOW_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in float vGroundDepth;
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outGbuf;
layout(location = 2) out vec4 outDepth;
void main() {
  outAlbedo = vColor;
  outGbuf = vec4(0.0);
  outDepth = vec4(0.0);
}
`;

const SPRITE_VERT = `#version 300 es
in vec2 aCorner;
in vec4 aInst;   // px.xy, layer, depthOff
in vec4 aInst2;  // quadSize px, sprite texel size
in float aHeight;  // placement height (grounding-shadow suppression)
in float aStrength; // grounding-shadow strength multiplier (0 = off)
uniform vec2 uRes;
uniform vec2 uMaxSize;
uniform vec3 uProj;  // world-image origin px (x, y), px per unit
uniform vec4 uView;  // view transform: scale.xy, offset.xy (backing-store px)
out vec2 vUv;
out vec2 vWorldPx;  // fragment position in world-image pixels
out float vGroundDepth; // corner's ground-plane linear depth (see frag)
flat out float vLayer;
flat out float vDepthOff;
flat out float vHeight;
flat out float vStrength;
${ISO_GLSL}
${GROUND_UNPROJ_GLSL}
void main() {
  vec2 quadPx = aInst.xy + aCorner * aInst2.xy;
  vWorldPx = quadPx;
  // Ground-plane depth per corner: the ground basis inverse is affine in
  // world-image px, so interpolating the corner depths across the quad
  // matches the material ground plane's own interpolated depth exactly
  // (both linear in screen space) — per-fragment unprojection sampled the
  // plane too coarsely at low zoom and straddled its depth (z-fighting).
  vec2 s = vec2(quadPx.x - uProj.x, uProj.y - quadPx.y) / uProj.z;
  float gx = (SH_A22 * s.x - SH_A12 * s.y) / SH_DET;
  float gz = (SH_A11 * s.y - SH_A21 * s.x) / SH_DET;
  vGroundDepth = dot(VIEW_DIR, vec3(gx, 0.0, gz));
  vec2 px = quadPx * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = mix(vec2(0.5), aInst2.zw - 0.5, aCorner) / uMaxSize;
  vLayer = aInst.z;
  vDepthOff = aInst.w;
  vHeight = aHeight;
  vStrength = aStrength;
}
`;

// Geometry stage: routes the bake data into the screen-space g-buffer
// (RT1: world normal + linear depth) and the albedo·AO surface (RT2,
// rgb = the baked render texel — its baked light IS its albedo·AO). The
// dynamic-light factor moves to the deferred pass.
const SPRITE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uRender;
uniform sampler2DArray uGbuffer;
uniform float uDepthA;
uniform float uDepthB;
in vec2 vUv;
in vec2 vWorldPx;
in float vGroundDepth;
flat in float vLayer;
flat in float vDepthOff;
flat in float vHeight;
flat in float vStrength;
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outGbuf;
layout(location = 2) out vec4 outDepth;
void main() {
  vec4 g = texture(uGbuffer, vec3(vUv, vLayer));
  vec4 r = texture(uRender, vec3(vUv, vLayer));
  if (dot(g.rgb, g.rgb) == 0.0) {
    // G-buffer-empty render pixels: historically pure background, now also
    // the baked grounding shadow — a blue-dominant, near-black tint with
    // mid alpha (r < b). Object-colored AA fringe (r >= b) keeps the
    // historical discard, so legacy sprites composite unchanged.
    if (r.a <= 0.0 || r.b <= r.r) discard;
    // Raised placements would carry the patch into the air: suppress it
    // (the contact-shadow ellipses cover the raised case). A per-layer
    // strength of 0 turns the shadow off entirely.
    float a = r.a * vStrength;
    if (vHeight != 0.0 || a <= 0.0) discard;
    gl_FragDepth = uDepthA * (vGroundDepth + 1e-3) + uDepthB;
    outAlbedo = vec4(r.rgb, a);
    outGbuf = vec4(0.0, 1.0, 0.0, a); // up normal, ground-plane surface
    outDepth = vec4(vGroundDepth, 0.0, 0.0, 1.0);
    return;
  }
  float d = g.a + vDepthOff;
  gl_FragDepth = uDepthA * d + uDepthB;
  outAlbedo = vec4(r.rgb, r.a);
  outGbuf = vec4(g.rgb, r.a);
  outDepth = vec4(d, 0.0, 0.0, 1.0);
}
`;

// Skinned character mesh: palette skinning in the vertex stage, then the
// same projection/depth pipeline the sprite path uses. The screen
// projection inlines the shared iso constants (ISO_GLSL) so CPU-projected
// sprites and GPU-projected meshes can never drift apart.
// GPU-skinning vertex stage: palette blend against per-joint matrices
// uploaded per frame by the CPU pose engine. Joint indices are floats
// (integers 0..jointCount-1) rounded explicitly — float attributes avoid
// the integer-attribute pitfalls hit during bring-up.
const MESH_VERT_GPU = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
in vec2 aUv;
in vec4 aWeight;
in vec4 aJoint;
uniform mat4 uPalette[${MAX_MESH_JOINTS}];
uniform mat3 uYaw;
uniform vec3 uOrigin;  // placement feet position (world x, y, z)
uniform vec3 uProj;    // world-image origin px (x, y), px per unit
uniform vec2 uRes;
uniform vec4 uView;    // view transform: scale.xy, offset.xy (backing px)
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUv;
${ISO_GLSL}
void main() {
  mat4 skin = aWeight.x * uPalette[int(aJoint.x + 0.5)]
            + aWeight.y * uPalette[int(aJoint.y + 0.5)]
            + aWeight.z * uPalette[int(aJoint.z + 0.5)]
            + aWeight.w * uPalette[int(aJoint.w + 0.5)];
  vec3 skinned = (skin * vec4(aPos, 1.0)).xyz;
  vec3 wp = uYaw * skinned + uOrigin;
  vWorldPos = wp;
  vNormal = uYaw * (mat3(skin) * aNormal);
  vUv = aUv;
  vec2 px = vec2(uProj.x + dot(SCREEN_RIGHT, wp) * uProj.z,
                 uProj.y - dot(SCREEN_UP, wp) * uProj.z);
  px = px * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

// CPU-skinning vertex stage: vertices arrive pre-skinned in world space
// (CharacterPlayer.skinInto); this stage is a pure passthrough through the
// shared iso projection.
const MESH_VERT = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
in vec2 aUv;
uniform mat3 uYaw;
uniform vec3 uOrigin;  // placement feet position (world x, y, z)
uniform vec3 uProj;    // world-image origin px (x, y), px per unit
uniform vec2 uRes;
uniform vec4 uView;    // view transform: scale.xy, offset.xy (backing px)
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUv;
${ISO_GLSL}
void main() {
  vec3 wp = uYaw * aPos + uOrigin;
  vWorldPos = wp;
  vNormal = uYaw * aNormal;
  vUv = aUv;
  vec2 px = vec2(uProj.x + dot(SCREEN_RIGHT, wp) * uProj.z,
                 uProj.y - dot(SCREEN_UP, wp) * uProj.z);
  px = px * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

// Geometry stage: writes the env-lit tonemapped texel (SH irradiance over
// live normals — the mesh's "prerender" equivalent) as albedo·AO plus its
// live normals and world depth. The dynamic factor is applied once, in the
// deferred pass, exactly as sprites receive it.
const MESH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uAlbedo;
uniform vec3 uAlbedoFactor;
uniform float uSaturation;
uniform float uDepthA;
uniform float uDepthB;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUv;
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outGbuf;
layout(location = 2) out vec4 outDepth;
${COLOR_CHUNK}
${ACES_GLSL}
${SH_IRRADIANCE_GLSL}
${ISO_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 albedo = uAlbedoFactor * srgbToLinear(texture(uAlbedo, vUv).rgb);
  vec3 hdr = albedo * max(shIrradiance(N), vec3(0.0));
  vec3 texel = linearToSrgb(ACESFilmic(hdr));
  float lum = dot(texel, vec3(0.2126, 0.7152, 0.0722));
  texel = mix(vec3(lum), texel, uSaturation);
  outAlbedo = vec4(texel, 1.0);
  outGbuf = vec4(N, 1.0);
  outDepth = vec4(dot(VIEW_DIR, vWorldPos), 0.0, 0.0, 1.0);
  gl_FragDepth = uDepthA * dot(VIEW_DIR, vWorldPos) + uDepthB;
}
`;

// The deferred light pass: reconstructs world position from the
// g-buffer depth (ADR 0001 — fixed orthographic camera), shades with the
// ambient picker, key directional, and the point-light UBO, and applies
// the multiplicative factor once for every surface kind.
const LIGHT_VERT = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const LIGHT_FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uGbuf;    // RT1: rgb = world normal, a = blend weight
uniform sampler2D uAlbedo;  // RT0: rgb = display texel (albedo·AO), a = AO hook
uniform sampler2D uDepthLin; // RT2: r = linear reference-plane depth
uniform vec2 uRes;
uniform vec4 uView;   // view transform: scale.xy, offset.xy (backing px)
uniform vec3 uProj;   // world-image origin px (x, y), px per unit
uniform vec3 uLightDir;
uniform vec3 uKeyLight;
uniform vec3 uAmbient;
uniform sampler2D uOccluder;   // reconstructed world-space height field
uniform float uOccluderActive; // 0 = no occluder (visibility 1)
uniform vec2 uOccluderOrigin;  // world x/z of cell (0,0)'s corner
uniform vec2 uOccluderCell;    // world units per cell (x, z)
uniform vec2 uOccluderSize;    // grid dimensions in cells (x, z)
uniform float uOccluderMax;    // tallest occluder height (world units)
uniform int uPointCount;
uniform float uLightsOn; // 0 = dynamic lights off: the identity factor
layout(std140) uniform PointLights {
  vec4 uPointPosRadius[${MAX_POINT_LIGHTS}];    // xyz world pos, w radius
  vec4 uPointColorEnergy[${MAX_POINT_LIGHTS}];  // rgb linear color, w energy
};
out vec4 outColor;
${COLOR_CHUNK}
${ISO_GLSL}
/**
 * Reconstructed-occluder directional shadow (add-dynamic-directional-shadows):
 * march the key-light ray from the receiver through the height field and
 * return 1 when the key light reaches it, 0 when blocked. The ray starts
 * offset along the surface normal (a normal-offset bias, tunable), which is
 * what keeps a large light-facing structure from shadowing its own surface:
 * the field represents it as a solid column, so an unoffset ray grazes back
 * into its footprint. Mirrors shadowVisibilityCPU in shadowField.ts.
 */
float shadowVisibility(vec3 wp, vec3 N) {
  if (uOccluderActive < 0.5) return 1.0;
  vec2 lh = uLightDir.xz;
  float lxz = length(lh);
  if (lxz < 1e-5) return 1.0;
  lh /= lxz;
  float rise = uLightDir.y / lxz;
  // Normal-offset: push the ray origin off the surface, more at grazing
  // incidence (where N.L is small) so a glancing ray clears the column.
  float ndl = max(dot(N, uLightDir), 0.0);
  vec3 origin = wp + normalize(N) * (${SHADOW_BIAS} * (1.0 + 2.0 * (1.0 - ndl)));
  // The ray only rises (the light domain floors elevation): once the
  // receiver clears the tallest occluder, nothing further can block it.
  if (rise >= 0.0 && origin.y >= uOccluderMax) return 1.0;
  float step = min(uOccluderCell.x, uOccluderCell.y);
  vec2 extent = uOccluderSize * uOccluderCell;
  float s = step;
  for (int i = 0; i < ${SHADOW_MAX_STEPS}; i++) {
    vec2 pos = origin.xz + lh * s;
    vec2 rel = pos - uOccluderOrigin;
    if (rel.x < 0.0 || rel.y < 0.0 || rel.x >= extent.x || rel.y >= extent.y) break;
    ivec2 cell = ivec2(floor(rel / uOccluderCell));
    float fh = texelFetch(uOccluder, cell, 0).r;
    float rayH = origin.y + rise * s;
    if (fh > rayH + ${SHADOW_BIAS_EPSILON}) return 0.0;
    if (rise >= 0.0 && rayH >= uOccluderMax) break;
    s += step;
  }
  return 1.0;
}
void main() {
  ivec2 uv = ivec2(gl_FragCoord.xy);
  vec4 g = texelFetch(uGbuf, uv, 0);
  vec4 a = texelFetch(uAlbedo, uv, 0);
  if (dot(g.rgb, g.rgb) == 0.0) {
    outColor = vec4(a.rgb, 1.0);
    return;
  }
  vec3 N = normalize(g.rgb);
  // ADR 0001: full world position from the pixel coordinate plus one
  // scalar (the g-buffer depth) — the fixed-camera orthonormal frame.
  float d = texelFetch(uDepthLin, uv, 0).r;
  vec2 worldPx = vec2((gl_FragCoord.x - uView.z) / uView.x,
                      (uRes.y - gl_FragCoord.y - uView.w) / uView.y);
  vec2 s = vec2(worldPx.x - uProj.x, uProj.y - worldPx.y) / uProj.z;
  vec3 wp = SCREEN_RIGHT * s.x + SCREEN_UP * s.y + VIEW_DIR * d;
  float vis = shadowVisibility(wp, N);
  vec3 factor = uAmbient + uKeyLight * (max(dot(N, uLightDir), 0.0) * vis);
  for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
    if (i >= uPointCount) break;
    vec3 L = uPointPosRadius[i].xyz - wp;
    float dist = length(L);
    float radius = uPointPosRadius[i].w;
    if (radius <= 0.0 || dist >= radius) continue;
    float win = 1.0 - dist / radius;
    win *= win;
    float nl = max(dot(N, L / max(dist, 1e-5)), 0.0);
    factor += uPointColorEnergy[i].rgb * (uPointColorEnergy[i].w * win * nl);
  }
  vec3 lit = mix(vec3(1.0), factor, uLightsOn);
  outColor = vec4(linearToSrgb(srgbToLinear(clamp(a.rgb, 0.0, 1.0)) * lit), 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export const DEPTH_LINEAR_RANGE = 64;

/**
 * A 2D view transform over the world-projected image: zoom/pan given in
 * backing-store (device) pixels. All vertex data stays in world-image
 * pixels; this transform scales/offsets it at draw time. Structurally
 * compatible with the editor's `ViewTransform`.
 */
export interface RenderView {
  zoom: number;
  panX: number;
  panY: number;
}

const IDENTITY_VIEW: RenderView = { zoom: 1, panX: 0, panY: 0 };

/**
 * One flat-shaded draw batch (the ground grid, contact shadows, or the
 * hover/gizmo overlay): triangle vertices as `[x, y, r, g, b, a]` in
 * world-image pixels.
 */
export interface FlatBatch {
  data: Float32Array;
  verts: number;
}

export interface LightParams {
  dir: [number, number, number];
  key: [number, number, number];
  ambient: [number, number, number];
}

/** How the mesh batch skins: GPU palette blend or pre-skinned vertices. */
export type MeshSkinningMode = 'gpu' | 'cpu';

interface MeshUniformSet {
  res: WebGLUniformLocation;
  view: WebGLUniformLocation;
  yaw: WebGLUniformLocation;
  origin: WebGLUniformLocation;
  proj: WebGLUniformLocation;
  sh: WebGLUniformLocation;
  exposure: WebGLUniformLocation;
  saturation: WebGLUniformLocation;
  factor: WebGLUniformLocation;
  palette: WebGLUniformLocation | null;
}

/**
 * One skinned-character draw: the placement's world transform plus the
 * skinning input for the active mode — a joint palette (GPU) or
 * pre-skinned vertex buffers (CPU). Opaque, drawn between the shadow and
 * sprite batches.
 */
export interface MeshDraw {
  /** GPU mode: column-major `mat4[jointCount]` (`CharacterPlayer.palette`). */
  palette?: Float32Array;
  /** CPU mode: pre-skinned world-space positions (bind-space * palette). */
  positions?: Float32Array;
  /** CPU mode: pre-skinned world-space normals (same transform). */
  normals?: Float32Array;
  /** Feet position in world units. */
  origin: [number, number, number];
  /** Column-major rotation about +Y (`meshYawMat`). */
  yawMat: Float32Array;
}

/** Rotation about +Y as a column-major mat3 (local → world). */
export function meshYawMat(yawRad: number, out: Float32Array = new Float32Array(9)): Float32Array {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  out[0] = c;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = s;
  out[7] = 0;
  out[8] = c;
  return out;
}

/** Scene background clear color (also the light pass's backdrop). */
const CLEAR_COLOR: [number, number, number] = [0.078, 0.086, 0.102];

/** Default displacement seam strength (see `GROUND_FRAG`). */
const DEFAULT_HEIGHT_SCALE = 0.6;

/** Structural material layer: mirrors the app-side `GroundMaterialMaps`. */
export interface GroundMaterialLayer {
  diffuse:
    | { kind: 'srgb'; image: ImageBitmap }
    | { kind: 'linear'; data: Float32Array; width: number; height: number };
  normal: ImageBitmap | null;
  arm: ImageBitmap | null;
  disp: ImageBitmap | null;
}

/** A splat coverage mirror (RGBA8, top-down rows; row 0 = world z 0). */
export interface SplatImage {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * The square texel size the four material arrays are built at: the first
 * bound material's diffuse size, clamped to `maxSize`. Mirrors the pure
 * `groundMaterialArraySize` in `src/app/groundMaterial.ts`.
 */
function materialArraySize(
  materials: readonly (GroundMaterialLayer | null)[],
  maxSize: number,
): number {
  for (const m of materials) {
    if (!m) continue;
    const width =
      m.diffuse.kind === 'srgb' ? m.diffuse.image.width : m.diffuse.width;
    const height =
      m.diffuse.kind === 'srgb' ? m.diffuse.image.height : m.diffuse.height;
    return Math.max(1, Math.min(maxSize, Math.min(width, height)));
  }
  return 1;
}

function linearToSrgbByte(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** Resample a float EXR radiance diffuse to 8-bit sRGB bytes (nearest). */
function linearDiffuseToRgba(
  data: Float32Array,
  width: number,
  height: number,
  size: number,
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(height - 1, Math.floor((y / size) * height));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor((x / size) * width));
      const s = (sy * width + sx) * 4;
      const d = (y * size + x) * 4;
      out[d] = linearToSrgbByte(data[s]);
      out[d + 1] = linearToSrgbByte(data[s + 1]);
      out[d + 2] = linearToSrgbByte(data[s + 2]);
      out[d + 3] = 255;
    }
  }
  return out;
}

/** Read an ImageBitmap as top-down RGBA8 bytes, resampling to `size`. */
function bitmapToRgba(src: ImageBitmap, size: number): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, size, size);
  return new Uint8Array(ctx.getImageData(0, 0, size, size).data);
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private flatGroundProg: WebGLProgram;
  private flatShadowProg: WebGLProgram;
  private overlayProg: WebGLProgram;
  private spriteProg: WebGLProgram;
  private renderTex: WebGLTexture | null = null;
  private gbufferTex: WebGLTexture | null = null;
  private groundVao: WebGLVertexArrayObject;
  private groundVbo: WebGLBuffer;
  private shadowVao: WebGLVertexArrayObject;
  private shadowVbo: WebGLBuffer;
  private highlightVao: WebGLVertexArrayObject;
  private highlightVbo: WebGLBuffer;
  private spriteVao: WebGLVertexArrayObject;
  private instVbo: WebGLBuffer;
  /** Skinning location: 'gpu' blends in the vertex stage, 'cpu' draws
   *  pre-skinned vertices (see design.md D2). */
  private meshSkinning: MeshSkinningMode = 'gpu';
  private meshProgGpu: WebGLProgram;
  private meshProgCpu: WebGLProgram;
  private meshVao: WebGLVertexArrayObject;
  private meshPosVbo: WebGLBuffer | null = null;
  private meshNrmVbo: WebGLBuffer | null = null;
  private meshUvVbo: WebGLBuffer | null = null;
  private meshJointVbo: WebGLBuffer | null = null;
  private meshWeightVbo: WebGLBuffer | null = null;
  private meshIbo: WebGLBuffer | null = null;
  private meshAlbedoTex: WebGLTexture | null = null;
  private meshIndexCount = 0;
  private meshUniforms: Record<'gpu' | 'cpu', MeshUniformSet>;
  private meshFrame: [number, number, number] = [0, 0, 64];
  private groundProg: WebGLProgram;
  private groundTexVao: WebGLVertexArrayObject;
  private groundTexVbo: WebGLBuffer;
  // Four 4-layer texture arrays (one layer per material slot) + the painted
  // coverage splat. Five units total.
  private groundDiffuseArr: WebGLTexture | null = null;
  private groundNormalArr: WebGLTexture | null = null;
  private groundArmArr: WebGLTexture | null = null;
  private groundDispArr: WebGLTexture | null = null;
  private groundSplatTex: WebGLTexture | null = null;
  private groundMatTiles = false;
  private splatW = 0;
  private splatH = 0;
  /** Display saturation of the env the baked renders were produced with. */
  private envSaturation = 1;
  /** Display exposure of the env the baked renders were produced with. */
  private envExposure = 1;
  private groundUniforms: {
    res: WebGLUniformLocation;
    view: WebGLUniformLocation;
    proj: WebGLUniformLocation;
    extent: WebGLUniformLocation;
    tileScale: WebGLUniformLocation;
    slotBound: WebGLUniformLocation;
    heightScale: WebGLUniformLocation;
    heightBias: WebGLUniformLocation;
    exposure: WebGLUniformLocation;
    saturation: WebGLUniformLocation;
    depthA: WebGLUniformLocation;
    depthB: WebGLUniformLocation;
    sh: WebGLUniformLocation;
  };
  private uOverlayRes: WebGLUniformLocation;
  private uOverlayView: WebGLUniformLocation;
  private uFlatGroundRes: WebGLUniformLocation;
  private uFlatGroundView: WebGLUniformLocation;
  private uFlatGroundProj: WebGLUniformLocation;
  private uFlatShadowRes: WebGLUniformLocation;
  private uFlatShadowView: WebGLUniformLocation;
  private uFlatShadowProj: WebGLUniformLocation;
  private uSpriteRes: WebGLUniformLocation;
  private uSpriteMaxSize: WebGLUniformLocation;
  private uSpriteView: WebGLUniformLocation;
  private uSpriteProj: WebGLUniformLocation;
  private uDepthA: WebGLUniformLocation;
  private uDepthB: WebGLUniformLocation;
  private light: LightParams = {
    dir: [0, 1, 0],
    key: [1, 1, 1],
    ambient: [0.3, 0.3, 0.3],
  };
  private lightsEnabled = true;
  private pointLights: readonly PointLightGpu[] = [];
  // --- deferred geometry targets ---
  private geoFbo: WebGLFramebuffer | null = null;
  private albedoTex: WebGLTexture | null = null;  // RT0: display texel
  private gbufTex: WebGLTexture | null = null;    // RT1: normal + linear depth
  private depthLinTex: WebGLTexture | null = null; // RT2: linear depth
  private geoDepthRbo: WebGLRenderbuffer | null = null;
  private geoW = 0;
  private geoH = 0;
  private lightProg: WebGLProgram;
  private lightVao: WebGLVertexArrayObject;
  private lightVbo: WebGLBuffer;
  private pointUbo: WebGLBuffer;
  private lightUniforms: {
    res: WebGLUniformLocation;
    view: WebGLUniformLocation;
    proj: WebGLUniformLocation;
    light: Uniforms3;
      pointCount: WebGLUniformLocation;
      lightsOn: WebGLUniformLocation;
    };
  // Reconstructed directional-shadow occluder (add-dynamic-directional-shadows).
  private occluderTex: WebGLTexture | null = null;
  private occluderActive = false;
  private occluderOrigin: [number, number] = [0, 0];
  private occluderCell: [number, number] = [1, 1];
  private occluderSize: [number, number] = [0, 0];
  private occluderMax = 0;
  private occluderUniforms: {
    sampler: WebGLUniformLocation;
    active: WebGLUniformLocation;
    origin: WebGLUniformLocation;
    cell: WebGLUniformLocation;
    size: WebGLUniformLocation;
    max: WebGLUniformLocation;
  };

  constructor(
    canvas: HTMLCanvasElement,
    renderLayers: Uint8Array[],
    gbufferLayers: Uint16Array[],
    maxW: number,
    maxH: number,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      stencil: false,
    });
    if (!gl) {
      throw new Error('WebGL2 unavailable');
    }
    // Half-float rendering: the deferred geometry targets are RGBA16F.
    // EXT_color_buffer_float covers it everywhere; Safari-lineage browsers
    // ship only EXT_color_buffer_half_float — accept either.
    if (!gl.getExtension('EXT_color_buffer_float') &&
        !gl.getExtension('EXT_color_buffer_half_float')) {
      throw new Error('float render targets unavailable (EXT_color_buffer_float / half_float)');
    }
    this.gl = gl;

    this.flatGroundProg = link(gl, FLAT_GROUND_VERT, FLAT_GROUND_FRAG);
    this.flatShadowProg = link(gl, FLAT_GROUND_VERT, FLAT_SHADOW_FRAG);
    this.overlayProg = link(gl, FLAT_VERT, OVERLAY_FRAG);
    this.spriteProg = link(gl, SPRITE_VERT, SPRITE_FRAG);
    this.lightProg = link(gl, LIGHT_VERT, LIGHT_FRAG);

    const flatGroundU = (n: string): WebGLUniformLocation =>
      gl.getUniformLocation(this.flatGroundProg, n)!;
    this.uFlatGroundRes = flatGroundU('uRes');
    this.uFlatGroundView = flatGroundU('uView');
    this.uFlatGroundProj = flatGroundU('uProj');
    const flatShadowU = (n: string): WebGLUniformLocation =>
      gl.getUniformLocation(this.flatShadowProg, n)!;
    this.uFlatShadowRes = flatShadowU('uRes');
    this.uFlatShadowView = flatShadowU('uView');
    this.uFlatShadowProj = flatShadowU('uProj');
    this.uOverlayRes = gl.getUniformLocation(this.overlayProg, 'uRes')!;
    this.uOverlayView = gl.getUniformLocation(this.overlayProg, 'uView')!;
    this.uSpriteRes = gl.getUniformLocation(this.spriteProg, 'uRes')!;
    this.uSpriteMaxSize = gl.getUniformLocation(this.spriteProg, 'uMaxSize')!;
    this.uSpriteView = gl.getUniformLocation(this.spriteProg, 'uView')!;
    this.uSpriteProj = gl.getUniformLocation(this.spriteProg, 'uProj')!;
    this.uDepthA = gl.getUniformLocation(this.spriteProg, 'uDepthA')!;
    this.uDepthB = gl.getUniformLocation(this.spriteProg, 'uDepthB')!;
    gl.useProgram(this.spriteProg);
    gl.uniform1f(this.uDepthA, -1 / (2 * DEPTH_LINEAR_RANGE));
    gl.uniform1f(this.uDepthB, 0.5);

    // Deferred light pass: fullscreen quad + std140 point-light UBO.
    const lu = (n: string): WebGLUniformLocation => gl.getUniformLocation(this.lightProg, n)!;
    this.lightUniforms = {
      res: lu('uRes'),
      view: lu('uView'),
      proj: lu('uProj'),
      light: {
        dir: lu('uLightDir'),
        key: lu('uKeyLight'),
        ambient: lu('uAmbient'),
      },
      pointCount: lu('uPointCount'),
      lightsOn: lu('uLightsOn'),
    };
    gl.useProgram(this.lightProg);
    gl.uniform1i(lu('uGbuf'), 1);
    gl.uniform1i(lu('uAlbedo'), 0);
    gl.uniform1i(lu('uDepthLin'), 2);
    gl.uniform1i(lu('uOccluder'), 3);
    this.occluderUniforms = {
      sampler: lu('uOccluder'),
      active: lu('uOccluderActive'),
      origin: lu('uOccluderOrigin'),
      cell: lu('uOccluderCell'),
      size: lu('uOccluderSize'),
      max: lu('uOccluderMax'),
    };
    const blockIndex = gl.getUniformBlockIndex(this.lightProg, 'PointLights');
    gl.uniformBlockBinding(this.lightProg, blockIndex, 0);
    this.pointUbo = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.pointUbo);
    gl.bufferData(gl.UNIFORM_BUFFER, MAX_POINT_LIGHTS * 32, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.pointUbo);
    this.lightVao = gl.createVertexArray()!;
    this.lightVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.lightVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aLightPos = gl.getAttribLocation(this.lightProg, 'aPos');
    gl.enableVertexAttribArray(aLightPos);
    gl.vertexAttribPointer(aLightPos, 2, gl.FLOAT, false, 8, 0);

    this.setSprites(renderLayers, gbufferLayers, maxW, maxH);

    this.groundVao = gl.createVertexArray()!;
    this.groundVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundVbo);
    const aFlatPos = gl.getAttribLocation(this.flatGroundProg, 'aPos');
    const aFlatColor = gl.getAttribLocation(this.flatGroundProg, 'aColor');
    gl.enableVertexAttribArray(aFlatPos);
    gl.vertexAttribPointer(aFlatPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aFlatColor);
    gl.vertexAttribPointer(aFlatColor, 4, gl.FLOAT, false, 24, 8);

    this.shadowVao = gl.createVertexArray()!;
    this.shadowVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
    // The shadow program shares the flat vertex source, but query ITS OWN
    // attribute locations — locations are per-program, not global.
    const aShPos = gl.getAttribLocation(this.flatShadowProg, 'aPos');
    const aShColor = gl.getAttribLocation(this.flatShadowProg, 'aColor');
    gl.enableVertexAttribArray(aShPos);
    gl.vertexAttribPointer(aShPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aShColor);
    gl.vertexAttribPointer(aShColor, 4, gl.FLOAT, false, 24, 8);

    // Overlay runs on its own flat program (aPos/aColor locations coincide
    // with the geometry flat batch's, but keep the layout self-contained).
    this.highlightVao = gl.createVertexArray()!;
    this.highlightVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.highlightVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightVbo);
    const aOvPos = gl.getAttribLocation(this.overlayProg, 'aPos');
    const aOvColor = gl.getAttribLocation(this.overlayProg, 'aColor');
    gl.enableVertexAttribArray(aOvPos);
    gl.vertexAttribPointer(aOvPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aOvColor);
    gl.vertexAttribPointer(aOvColor, 4, gl.FLOAT, false, 24, 8);

    this.spriteVao = gl.createVertexArray()!;
    this.instVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.spriteVao);
    const cornerVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aCorner = gl.getAttribLocation(this.spriteProg, 'aCorner');
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    const aInst = gl.getAttribLocation(this.spriteProg, 'aInst');
    gl.enableVertexAttribArray(aInst);
    gl.vertexAttribPointer(aInst, 4, gl.FLOAT, false, 40, 0);
    gl.vertexAttribDivisor(aInst, 1);
    const aInst2 = gl.getAttribLocation(this.spriteProg, 'aInst2');
    gl.enableVertexAttribArray(aInst2);
    gl.vertexAttribPointer(aInst2, 4, gl.FLOAT, false, 40, 16);
    gl.vertexAttribDivisor(aInst2, 1);
    const aHeight = gl.getAttribLocation(this.spriteProg, 'aHeight');
    gl.enableVertexAttribArray(aHeight);
    gl.vertexAttribPointer(aHeight, 1, gl.FLOAT, false, 40, 32);
    gl.vertexAttribDivisor(aHeight, 1);
    const aStrength = gl.getAttribLocation(this.spriteProg, 'aStrength');
    gl.enableVertexAttribArray(aStrength);
    gl.vertexAttribPointer(aStrength, 1, gl.FLOAT, false, 40, 36);
    gl.vertexAttribDivisor(aStrength, 1);

    gl.bindVertexArray(null);
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uRender')!, 0);
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uGbuffer')!, 1);

    // Mesh programs (GPU- and CPU-skinning variants share the fragment
    // stage); the depth map matches the sprite path exactly.
    this.meshProgGpu = link(gl, MESH_VERT_GPU, MESH_FRAG);
    this.meshProgCpu = link(gl, MESH_VERT, MESH_FRAG);
    this.meshUniforms = {
      gpu: this.meshUniformSet(this.meshProgGpu, true),
      cpu: this.meshUniformSet(this.meshProgCpu, false),
    };
    this.meshVao = gl.createVertexArray()!;
    this.setMesh(null, null);

    // Textured ground plane (replaces the flat batch while a material is
    // set); the shared depth map matches the mesh path exactly.
    this.groundProg = link(gl, GROUND_VERT, GROUND_FRAG);
    const gu = (name: string): WebGLUniformLocation => gl.getUniformLocation(this.groundProg, name)!;
    this.groundUniforms = {
      res: gu('uRes'),
      view: gu('uView'),
      proj: gu('uProj'),
      extent: gu('uExtent'),
      tileScale: gu('uTileScale'),
      slotBound: gu('uSlotBound'),
      heightScale: gu('uHeightScale'),
      heightBias: gu('uHeightBias'),
      exposure: gu('uExposure'),
      saturation: gu('uSaturation'),
      depthA: gu('uDepthA'),
      depthB: gu('uDepthB'),
      sh: gu('uSh'),
    };
    gl.useProgram(this.groundProg);
    gl.uniform1f(this.groundUniforms.depthA, -1 / (2 * DEPTH_LINEAR_RANGE));
    gl.uniform1f(this.groundUniforms.depthB, 0.5);
    gl.uniform1f(this.groundUniforms.heightScale, DEFAULT_HEIGHT_SCALE);
    gl.uniform4f(this.groundUniforms.heightBias, 0, 0, 0, 0);
    gl.uniform1f(this.groundUniforms.exposure, 1);
    gl.uniform1i(gu('uDiffuse'), 0);
    gl.uniform1i(gu('uNormal'), 1);
    gl.uniform1i(gu('uArm'), 2);
    gl.uniform1i(gu('uDisp'), 3);
    gl.uniform1i(gu('uSplat'), 4);
    this.groundTexVao = gl.createVertexArray()!;
    this.groundTexVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.groundTexVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundTexVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aGroundCorner = gl.getAttribLocation(this.groundProg, 'aCorner');
    gl.enableVertexAttribArray(aGroundCorner);
    gl.vertexAttribPointer(aGroundCorner, 2, gl.FLOAT, false, 8, 0);

    gl.disable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], 1);
    gl.clearDepth(1);
  }

  /** (Re)builds the sprite texture arrays; callable again after loading new layers. */
  setSprites(
    renderLayers: Uint8Array[],
    gbufferLayers: Uint16Array[],
    maxW: number,
    maxH: number,
  ): void {
    const gl = this.gl;
    if (this.renderTex !== null) gl.deleteTexture(this.renderTex);
    if (this.gbufferTex !== null) gl.deleteTexture(this.gbufferTex);

    this.renderTex = this.byteArray(renderLayers, maxW, maxH, gl.LINEAR);
    this.gbufferTex = this.halfArray(gbufferLayers, maxW, maxH);

    gl.useProgram(this.spriteProg);
    gl.uniform2f(this.uSpriteMaxSize, maxW, maxH);
  }

  private byteArray(layers: Uint8Array[], maxW: number, maxH: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA8,
      maxW,
      maxH,
      layers.length,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    layers.forEach((bytes, i) => {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        i,
        maxW,
        maxH,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private halfArray(layers: Uint16Array[], maxW: number, maxH: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA16F,
      maxW,
      maxH,
      layers.length,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    layers.forEach((data, i) => {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        i,
        maxW,
        maxH,
        1,
        gl.RGBA,
        gl.HALF_FLOAT,
        data,
      );
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  setLight(light: LightParams): void {
    this.light = light;
  }

  /**
   * Gate the dynamic lights (the deferred pass applies the identity factor
   * and point lights drop out when off — the pure prerendered composite).
   */
  setLightsEnabled(on: boolean): void {
    this.lightsEnabled = on;
  }

  /** Point lights for the deferred pass; only the first 16 are uploaded. */
  setPointLights(lights: readonly PointLightGpu[]): void {
    this.pointLights = lights;
  }

  /**
   * Upload the reconstructed world-space occluder (null clears it, pinning
   * the shadow visibility to 1). Rebuilt by the editor on world load and
   * placement edits; engine state only, never serialized (ADR 0006).
   */
  setOccluder(field: ShadowField | null): void {
    const gl = this.gl;
    if (this.occluderTex !== null) {
      gl.deleteTexture(this.occluderTex);
      this.occluderTex = null;
    }
    if (!field) {
      this.occluderActive = false;
      this.occluderMax = 0;
      return;
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Single-channel float height field, sampled with texelFetch (NEAREST —
    // float textures are not guaranteed linearly filterable without an
    // extension, and a shadow field must not interpolate across a cliff).
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      field.width,
      field.height,
      0,
      gl.RED,
      gl.FLOAT,
      field.data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.occluderTex = tex;
    this.occluderActive = true;
    this.occluderOrigin = [field.originX, field.originZ];
    this.occluderCell = [field.cellX, field.cellZ];
    this.occluderSize = [field.width, field.height];
    this.occluderMax = field.maxHeight;
  }

  /**
   * Read back the uploaded occluder field (verification harnesses only).
   * Returns false when no occluder is set or the readback FBO is incomplete.
   */
  readOccluder(out: Float32Array): boolean {
    if (!this.occluderTex) return false;
    const gl = this.gl;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.occluderTex,
      0,
    );
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (complete) {
      gl.readPixels(0, 0, this.occluderSize[0], this.occluderSize[1], gl.RED, gl.FLOAT, out);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return complete;
  }

  /**
   * Upload a character's skinned geometry + surface (null clears).
   * Callable again when the document's character changes; one upload per
   * asset, shared by every placement draw.
   */
  setMesh(geometry: MeshGeometry | null, surface: MeshSurface | null): void {
    const gl = this.gl;
    const gpu = this.meshSkinning === 'gpu';
    const prog = gpu ? this.meshProgGpu : this.meshProgCpu;
    gl.bindVertexArray(this.meshVao);
    if (this.meshPosVbo) gl.deleteBuffer(this.meshPosVbo);
    if (this.meshNrmVbo) gl.deleteBuffer(this.meshNrmVbo);
    if (this.meshUvVbo) gl.deleteBuffer(this.meshUvVbo);
    if (this.meshJointVbo) gl.deleteBuffer(this.meshJointVbo);
    if (this.meshWeightVbo) gl.deleteBuffer(this.meshWeightVbo);
    if (this.meshIbo) gl.deleteBuffer(this.meshIbo);
    if (this.meshAlbedoTex) gl.deleteTexture(this.meshAlbedoTex);
    this.meshPosVbo = this.meshNrmVbo = this.meshUvVbo = this.meshIbo = null;
    this.meshJointVbo = this.meshWeightVbo = null;
    this.meshAlbedoTex = null;
    this.meshIndexCount = 0;
    if (!geometry) {
      gl.bindVertexArray(null);
      return;
    }

    this.meshPosVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshPosVbo);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);

    this.meshNrmVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshNrmVbo);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.DYNAMIC_DRAW);
    const aNormal = gl.getAttribLocation(prog, 'aNormal');
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 12, 0);

    this.meshUvVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshUvVbo);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.uvs, gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(prog, 'aUv');
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 8, 0);
    if (gpu) {
      this.meshJointVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshJointVbo);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.joints, gl.STATIC_DRAW);
      const aJoint = gl.getAttribLocation(prog, 'aJoint');
      gl.enableVertexAttribArray(aJoint);
      gl.vertexAttribPointer(aJoint, 4, gl.FLOAT, false, 16, 0);

      this.meshWeightVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshWeightVbo);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.weights, gl.STATIC_DRAW);
      const aWeight = gl.getAttribLocation(prog, 'aWeight');
      gl.enableVertexAttribArray(aWeight);
      gl.vertexAttribPointer(aWeight, 4, gl.FLOAT, false, 16, 0);
    }

    this.meshIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    this.meshIndexCount = geometry.indices.length;

    // Base color: sRGB image, flipped to GL orientation on upload (glTF
    // UVs are top-down); the shader does the sRGB → linear decode.
    this.meshAlbedoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.meshAlbedoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (surface?.image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface.image);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const u = this.meshUniforms[this.meshSkinning];
    gl.useProgram(this.meshProgram);
    if (surface) gl.uniform3f(u.factor, surface.factor[0], surface.factor[1], surface.factor[2]);
    gl.bindVertexArray(null);
  }

  /** World-image pixel origin (the editor's ORIGIN_X/ORIGIN_Y) + PPU. */
  setMeshFrame(originXpx: number, originYpx: number, ppu: number): void {
    this.meshFrame = [originXpx, originYpx, ppu];
  }

  /** SH irradiance probe coefficients (27 floats; null = black ambient). */
  setShProbe(coeffs: Float32Array | null): void {
    const gl = this.gl;
    const zeros = new Float32Array(27);
    for (const u of [this.meshUniforms.gpu, this.meshUniforms.cpu]) {
      gl.useProgram(u === this.meshUniforms.gpu ? this.meshProgGpu : this.meshProgCpu);
      gl.uniform3fv(u.sh, coeffs ?? zeros);
    }
    // The ground program shares the ambient probe (SH chunk).
    gl.useProgram(this.groundProg);
    gl.uniform3fv(this.groundUniforms.sh, coeffs ?? zeros);
  }

  /** Display-referred env parameters that shaped the baked render texels. */
  setEnvDisplay(exposure: number, saturation: number): void {
    this.envSaturation = saturation;
    this.envExposure = exposure;
    const gl = this.gl;
    for (const [mode, u] of [
      ['gpu', this.meshUniforms.gpu],
      ['cpu', this.meshUniforms.cpu],
    ] as const) {
      gl.useProgram(mode === 'gpu' ? this.meshProgGpu : this.meshProgCpu);
      gl.uniform1f(u.exposure, exposure);
      gl.uniform1f(u.saturation, saturation);
    }
    // The ground's ACES fit shares `uExposure` (see ACES_GLSL); leaving it
    // unset would default to 0 and blacken the material ground.
    gl.useProgram(this.groundProg);
    gl.uniform1f(this.groundUniforms.exposure, exposure);
  }

  /**
   * Release every GL object (tab close / StrictMode remount). The context
   * itself is per-canvas and stays usable: a remount re-creates its
   * programs, buffers and textures on it.
   */
  dispose(): void {
    const gl = this.gl;
    if (this.renderTex) gl.deleteTexture(this.renderTex);
    if (this.gbufferTex) gl.deleteTexture(this.gbufferTex);
    if (this.occluderTex) gl.deleteTexture(this.occluderTex);
    this.deleteGeoTargets();
    gl.deleteBuffer(this.groundVbo);
    gl.deleteVertexArray(this.groundVao);
    gl.deleteBuffer(this.groundTexVbo);
    gl.deleteVertexArray(this.groundTexVao);
    this.deleteGroundTextures();
    gl.deleteBuffer(this.shadowVbo);
    gl.deleteVertexArray(this.shadowVao);
    gl.deleteBuffer(this.highlightVbo);
    gl.deleteVertexArray(this.highlightVao);
    gl.deleteBuffer(this.instVbo);
    gl.deleteVertexArray(this.spriteVao);
    gl.deleteBuffer(this.lightVbo);
    gl.deleteVertexArray(this.lightVao);
    gl.deleteBuffer(this.pointUbo);
    if (this.meshPosVbo) gl.deleteBuffer(this.meshPosVbo);
    if (this.meshNrmVbo) gl.deleteBuffer(this.meshNrmVbo);
    if (this.meshUvVbo) gl.deleteBuffer(this.meshUvVbo);
    if (this.meshJointVbo) gl.deleteBuffer(this.meshJointVbo);
    if (this.meshWeightVbo) gl.deleteBuffer(this.meshWeightVbo);
    if (this.meshIbo) gl.deleteBuffer(this.meshIbo);
    if (this.meshAlbedoTex) gl.deleteTexture(this.meshAlbedoTex);
    gl.deleteVertexArray(this.meshVao);
    gl.deleteProgram(this.flatGroundProg);
    gl.deleteProgram(this.flatShadowProg);
    gl.deleteProgram(this.overlayProg);
    gl.deleteProgram(this.groundProg);
    gl.deleteProgram(this.meshProgGpu);
    gl.deleteProgram(this.meshProgCpu);
    gl.deleteProgram(this.spriteProg);
    gl.deleteProgram(this.lightProg);
  }

  /** The raw context (diagnostic harnesses only — do not draw through it). */
  get context(): WebGL2RenderingContext {
    return this.gl;
  }

  /** The mesh program for the active skinning mode (diagnostics). */
  get meshProgram(): WebGLProgram {
    return this.meshSkinning === 'gpu' ? this.meshProgGpu : this.meshProgCpu;
  }

  private meshUniformSet(prog: WebGLProgram, gpu: boolean): MeshUniformSet {
    const gl = this.gl;
    gl.useProgram(prog);
    const set: MeshUniformSet = {
      res: gl.getUniformLocation(prog, 'uRes')!,
      view: gl.getUniformLocation(prog, 'uView')!,
      yaw: gl.getUniformLocation(prog, 'uYaw')!,
      origin: gl.getUniformLocation(prog, 'uOrigin')!,
      proj: gl.getUniformLocation(prog, 'uProj')!,
      sh: gl.getUniformLocation(prog, 'uSh[0]')!,
      exposure: gl.getUniformLocation(prog, 'uExposure')!,
      saturation: gl.getUniformLocation(prog, 'uSaturation')!,
      factor: gl.getUniformLocation(prog, 'uAlbedoFactor')!,
      palette: gpu ? gl.getUniformLocation(prog, 'uPalette[0]') : null,
    };
    gl.uniform1f(set.exposure, 1);
    gl.uniform1f(set.saturation, 1);
    gl.uniform3f(set.proj, 0, 0, 64);
    gl.uniform1f(gl.getUniformLocation(prog, 'uDepthA')!, -1 / (2 * DEPTH_LINEAR_RANGE));
    gl.uniform1f(gl.getUniformLocation(prog, 'uDepthB')!, 0.5);
    gl.uniform1i(gl.getUniformLocation(prog, 'uAlbedo')!, 0);
    gl.uniform3fv(set.sh, new Float32Array(27));
    return set;
  }

  /** Select the skinning path; call before `setMesh` (it picks the VAO layout). */
  setSkinningMode(mode: MeshSkinningMode): void {
    this.meshSkinning = mode;
  }

  /** Readback of the default framebuffer (verification harnesses). */
  readPixels(out: Uint8Array): void {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    this.gl.readPixels(0, 0, canvas.width, canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out);
  }

  setGround(data: Float32Array): void {
    const gl = this.gl;
    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.groundVerts = data.length / 6;
    gl.bindVertexArray(null);
  }

  /** World extent for the textured ground plane (world units per axis). */
  setGroundExtent(width: number, depth: number): void {
    this.gl.useProgram(this.groundProg);
    this.gl.uniform2f(this.groundUniforms.extent, width, depth);
  }

  /**
   * Set the textured ground plane's material slots (all null = none: the
   * flat batch draws instead), the painted coverage splat, and the shared
   * tile scale (tiles per world unit). Builds four 4-layer texture arrays
   * (one layer per slot) plus the splat — five texture units. Structural
   * counterpart of the app-side `GroundMaterialMaps[]`.
   */
  setGroundMaterials(
    materials: readonly (GroundMaterialLayer | null)[],
    splat: SplatImage | null,
    tileScale: number,
  ): void {
    const gl = this.gl;
    this.deleteGroundTextures();
    this.groundMatTiles = materials.some((m) => m !== null);
    gl.useProgram(this.groundProg);
    gl.uniform1f(this.groundUniforms.tileScale, tileScale);
    const bound: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) if (materials[i]) bound[i] = 1;
    gl.uniform4f(this.groundUniforms.slotBound, ...bound);
    if (!this.groundMatTiles) return;

    const size = materialArraySize(materials, 2048);
    const makeArray = (): WebGLTexture => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.texImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        gl.RGBA8,
        size,
        size,
        4,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return tex;
    };
    this.groundDiffuseArr = makeArray();
    this.groundNormalArr = makeArray();
    this.groundArmArr = makeArray();
    this.groundDispArr = makeArray();

    const defaultLayer = (r: number, g: number, b: number, a: number): Uint8Array => {
      const bytes = new Uint8Array(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        bytes[i * 4] = r;
        bytes[i * 4 + 1] = g;
        bytes[i * 4 + 2] = b;
        bytes[i * 4 + 3] = a;
      }
      return bytes;
    };
    // Absent maps degrade to neutrals: flat normal (+Z), no AO, unit
    // displacement (the shader's height seam is centered on 1.0).
    const diffuseDefault = defaultLayer(0, 0, 0, 255);
    const normalDefault = defaultLayer(128, 128, 255, 255);
    const armDefault = defaultLayer(255, 255, 255, 255);
    const dispDefault = defaultLayer(255, 255, 255, 255);

    const uploadLayer = (
      tex: WebGLTexture,
      layer: number,
      src: ImageBitmap | Uint8Array,
    ): void => {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      if (src instanceof Uint8Array) {
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          0,
          0,
          0,
          layer,
          size,
          size,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          src,
        );
      } else {
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          0,
          0,
          0,
          layer,
          size,
          size,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          src,
        );
      }
    };
    const mapSource = (
      src: ImageBitmap | null,
      fallback: Uint8Array,
    ): ImageBitmap | Uint8Array =>
      !src ? fallback : src.width === size && src.height === size ? src : bitmapToRgba(src, size);

    for (let i = 0; i < 4; i++) {
      const m = materials[i];
      if (!m) {
        uploadLayer(this.groundDiffuseArr, i, diffuseDefault);
        uploadLayer(this.groundNormalArr, i, normalDefault);
        uploadLayer(this.groundArmArr, i, armDefault);
        uploadLayer(this.groundDispArr, i, dispDefault);
        continue;
      }
      const diffuse =
        m.diffuse.kind === 'linear'
          ? linearDiffuseToRgba(m.diffuse.data, m.diffuse.width, m.diffuse.height, size)
          : mapSource(m.diffuse.image, diffuseDefault);
      uploadLayer(this.groundDiffuseArr, i, diffuse);
      uploadLayer(this.groundNormalArr, i, mapSource(m.normal, normalDefault));
      uploadLayer(this.groundArmArr, i, mapSource(m.arm, armDefault));
      uploadLayer(this.groundDispArr, i, mapSource(m.disp, dispDefault));
    }
    for (const tex of [
      this.groundDiffuseArr,
      this.groundNormalArr,
      this.groundArmArr,
      this.groundDispArr,
    ]) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    }
    this.setSplat(splat);
  }

  /**
   * Upload (or re-upload) the painted coverage splat. Sizes may change on a
   * ground resize; tracks the current size so `updateSplatRect` can fall
   * back to a full upload.
   */
  setSplat(splat: SplatImage | null): void {
    const gl = this.gl;
    if (this.groundSplatTex) gl.deleteTexture(this.groundSplatTex);
    this.groundSplatTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.groundSplatTex);
    const img = splat ?? { data: new Uint8Array([255, 0, 0, 255]), width: 1, height: 1 };
    this.splatW = img.width;
    this.splatH = img.height;
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      img.width,
      img.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      img.data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Clip-and-upload one changed rectangle of the coverage splat. */
  updateSplatRect(
    splat: SplatImage,
    rect: { x: number; y: number; w: number; h: number },
  ): void {
    if (!this.groundSplatTex || this.splatW !== splat.width || this.splatH !== splat.height) {
      this.setSplat(splat);
      return;
    }
    const x = Math.max(0, Math.min(splat.width - 1, rect.x));
    const y = Math.max(0, Math.min(splat.height - 1, rect.y));
    const w = Math.max(1, Math.min(splat.width - x, rect.w));
    const h = Math.max(1, Math.min(splat.height - y, rect.h));
    const sub = new Uint8Array(w * h * 4);
    for (let row = 0; row < h; row++) {
      const srcOff = ((y + row) * splat.width + x) * 4;
      sub.set(splat.data.subarray(srcOff, srcOff + w * 4), row * w * 4);
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.groundSplatTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, sub);
  }

  private deleteGroundTextures(): void {
    const gl = this.gl;
    for (const tex of [
      this.groundDiffuseArr,
      this.groundNormalArr,
      this.groundArmArr,
      this.groundDispArr,
      this.groundSplatTex,
    ]) {
      if (tex) gl.deleteTexture(tex);
    }
    this.groundDiffuseArr = null;
    this.groundNormalArr = null;
    this.groundArmArr = null;
    this.groundDispArr = null;
    this.groundSplatTex = null;
    this.splatW = 0;
    this.splatH = 0;
  }

  // --- deferred geometry targets -------------------------------------------

  /** (Re)create the offscreen geometry FBO when the canvas size changes. */
  private ensureGeoTargets(w: number, h: number): void {
    if (this.geoFbo !== null && this.geoW === w && this.geoH === h) return;
    const gl = this.gl;
    this.deleteGeoTargets();
    this.geoW = w;
    this.geoH = h;

    this.albedoTex = this.geoTexture(w, h, gl.RGBA8);
    this.gbufTex = this.geoTexture(w, h, gl.RGBA16F);
    // RGBA16F (depth in r), not R16F: R16F renderability is only covered
    // by EXT_color_buffer_float, while RGBA16F also renders under
    // EXT_color_buffer_half_float.
    this.depthLinTex = this.geoTexture(w, h, gl.RGBA16F);
    this.geoDepthRbo = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.geoDepthRbo);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

    this.geoFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.geoFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.albedoTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.gbufTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.depthLinTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.geoDepthRbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error(
        `deferred geometry framebuffer incomplete (status ${gl.checkFramebufferStatus(gl.FRAMEBUFFER)})`,
      );
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private geoTexture(w: number, h: number, internal: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (internal === gl.RGBA8) {
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private deleteGeoTargets(): void {
    const gl = this.gl;
    if (this.geoFbo) gl.deleteFramebuffer(this.geoFbo);
    if (this.albedoTex) gl.deleteTexture(this.albedoTex);
    if (this.gbufTex) gl.deleteTexture(this.gbufTex);
    if (this.depthLinTex) gl.deleteTexture(this.depthLinTex);
    if (this.geoDepthRbo) gl.deleteRenderbuffer(this.geoDepthRbo);
    this.geoFbo = null;
    this.albedoTex = null;
    this.gbufTex = null;
    this.depthLinTex = null;
    this.geoDepthRbo = null;
  }

  render(
    instances: Float32Array,
    count: number,
    shadows: FlatBatch | null,
    overlay: FlatBatch | null,
    view: RenderView = IDENTITY_VIEW,
    meshes: readonly MeshDraw[] = [],
    /** Editor-side layer visibility: false skips the ground draw stage. */
    options: { groundVisible?: boolean } = {},
  ): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = canvas.width;
    const h = canvas.height;
    this.ensureGeoTargets(w, h);

    // ---- geometry pass: RT0 albedo·AO, RT1 normal+depth, RT2 depth ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.geoFbo);
    gl.viewport(0, 0, w, h);
    gl.clearBufferfv(gl.COLOR, 0, [...CLEAR_COLOR, 1]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 2, [0, 0, 0, 0]);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Shared uniforms: the geometry programs project with the same view
    // transform and world-image frame; the light pass reconstructs with
    // their inverse.
    gl.useProgram(this.spriteProg);
    gl.uniform2f(this.uSpriteRes, w, h);
    gl.uniform4f(this.uSpriteView, view.zoom, view.zoom, view.panX, view.panY);
    gl.uniform3f(this.uSpriteProj, this.meshFrame[0], this.meshFrame[1], this.meshFrame[2]);
    const flatU = (
      res: WebGLUniformLocation,
      viewU: WebGLUniformLocation,
      proj: WebGLUniformLocation,
      prog: WebGLProgram,
    ): void => {
      gl.useProgram(prog);
      gl.uniform2f(res, w, h);
      gl.uniform4f(viewU, view.zoom, view.zoom, view.panX, view.panY);
      gl.uniform3f(proj, this.meshFrame[0], this.meshFrame[1], this.meshFrame[2]);
    };
    flatU(this.uFlatGroundRes, this.uFlatGroundView, this.uFlatGroundProj, this.flatGroundProg);
    flatU(this.uFlatShadowRes, this.uFlatShadowView, this.uFlatShadowProj, this.flatShadowProg);
    for (const mode of ['gpu', 'cpu'] as const) {
      const u = this.meshUniforms[mode];
      gl.useProgram(mode === 'gpu' ? this.meshProgGpu : this.meshProgCpu);
      gl.uniform2f(u.res, w, h);
      gl.uniform4f(u.view, view.zoom, view.zoom, view.panX, view.panY);
      gl.uniform3f(u.proj, this.meshFrame[0], this.meshFrame[1], this.meshFrame[2]);
    }
    gl.useProgram(this.groundProg);
    gl.uniform2f(this.groundUniforms.res, w, h);
    gl.uniform4f(this.groundUniforms.view, view.zoom, view.zoom, view.panX, view.panY);
    gl.uniform3f(this.groundUniforms.proj, this.meshFrame[0], this.meshFrame[1], this.meshFrame[2]);
    gl.uniform1f(this.groundUniforms.saturation, this.envSaturation);
    gl.uniform1f(this.groundUniforms.exposure, this.envExposure);

    // 1. Ground: opaque. The flat batch keeps today's no-depth behavior
    //    (sprites always composite over it) but now writes the g-buffer's
    //    ground-plane surface so the deferred pass lights the floor; with
    //    a material selected the textured plane draws instead, also
    //    writing the shared window depth for per-pixel occlusion.
    //    The editor's layer visibility skips the whole stage (nothing
    //    re-uploaded — the draw is just gated off); the editor likewise
    //    empties the shadow batch then, since no floor remains to receive
    //    the contact shadows.
    gl.disable(gl.BLEND);
    if (options.groundVisible === false) {
      // Ground hidden by the editor's layer visibility.
    } else if (this.groundMatTiles) {
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.groundProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.groundDiffuseArr);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.groundNormalArr);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.groundArmArr);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.groundDispArr);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.groundSplatTex);
      gl.bindVertexArray(this.groundTexVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.DEPTH_TEST);
    } else if (this.groundVerts > 0) {
      gl.useProgram(this.flatGroundProg);
      gl.bindVertexArray(this.groundVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.groundVerts);
    }

    // 2. Contact shadows: color-only (g-buffer/depth outputs are
    //    zero-weight), still no depth interaction.
    if (shadows && shadows.verts > 0) {
      gl.enable(gl.BLEND);
      gl.useProgram(this.flatShadowProg);
      gl.bindVertexArray(this.shadowVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
      gl.bufferData(gl.ARRAY_BUFFER, shadows.data, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, shadows.verts);
    }

    // 3. Meshes (skinned characters): opaque, depth WRITE + test — every
    //    sprite/character overlap below resolves pixel-accurately against
    //    this depth. Skipped entirely when nothing is placed.
    if (meshes.length > 0 && this.meshIndexCount > 0) {
      const gpu = this.meshSkinning === 'gpu';
      const u = this.meshUniforms[this.meshSkinning];
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(this.meshProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.meshAlbedoTex);
      gl.bindVertexArray(this.meshVao);
      for (const mesh of meshes) {
        gl.uniform3f(u.origin, mesh.origin[0], mesh.origin[1], mesh.origin[2]);
        gl.uniformMatrix3fv(u.yaw, false, mesh.yawMat);
        if (gpu) {
          gl.uniformMatrix4fv(u.palette!, false, mesh.palette!);
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.meshPosVbo);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.positions!, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.meshNrmVbo);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.normals!, gl.DYNAMIC_DRAW);
        }
        gl.drawElements(gl.TRIANGLES, this.meshIndexCount, gl.UNSIGNED_INT, 0);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(null);
    }

    // 4. Sprites: blended, per-pixel depth-tested against each other and
    //    against any mesh depth written above.
    if (count > 0) {
      gl.enable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.spriteProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.renderTex!);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.gbufferTex!);
      gl.bindVertexArray(this.spriteVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
      gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
    }

    // ---- deferred light pass over the default framebuffer ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.lightProg);
    gl.uniform2f(this.lightUniforms.res, w, h);
    gl.uniform4f(this.lightUniforms.view, view.zoom, view.zoom, view.panX, view.panY);
    gl.uniform3f(this.lightUniforms.proj, this.meshFrame[0], this.meshFrame[1], this.meshFrame[2]);
    uploadLight(gl, this.lightUniforms.light, this.light);
    const active = this.lightsEnabled
      ? Math.min(this.pointLights.length, MAX_POINT_LIGHTS)
      : 0;
    gl.uniform1i(this.lightUniforms.pointCount, active);
    gl.uniform1f(this.lightUniforms.lightsOn, this.lightsEnabled ? 1 : 0);
    // Reconstructed directional shadow: the occluder is inert when absent
    // or when the dynamic-light switch pins the factor to identity.
    gl.uniform1f(this.occluderUniforms.active, this.occluderActive && this.lightsEnabled ? 1 : 0);
    gl.uniform2f(this.occluderUniforms.origin, this.occluderOrigin[0], this.occluderOrigin[1]);
    gl.uniform2f(this.occluderUniforms.cell, this.occluderCell[0], this.occluderCell[1]);
    gl.uniform2f(this.occluderUniforms.size, this.occluderSize[0], this.occluderSize[1]);
    gl.uniform1f(this.occluderUniforms.max, this.occluderMax);
    if (active > 0) {
      // std140: each vec4 array is contiguous — all 16 posRadius entries,
      // then all 16 colorEnergy entries.
      const block = new Float32Array(MAX_POINT_LIGHTS * 8);
      for (let i = 0; i < active; i++) {
        const l = this.pointLights[i];
        block[i * 4] = l.pos[0];
        block[i * 4 + 1] = l.pos[1];
        block[i * 4 + 2] = l.pos[2];
        block[i * 4 + 3] = l.radius;
        block[(MAX_POINT_LIGHTS + i) * 4] = l.color[0];
        block[(MAX_POINT_LIGHTS + i) * 4 + 1] = l.color[1];
        block[(MAX_POINT_LIGHTS + i) * 4 + 2] = l.color[2];
        block[(MAX_POINT_LIGHTS + i) * 4 + 3] = l.energy;
      }
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.pointUbo);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, block);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.albedoTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.gbufTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.depthLinTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.occluderTex);
    gl.bindVertexArray(this.lightVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 5. Overlay (hover highlight, height gizmo): unlit editor chrome
    //    blended over the finished frame.
    if (overlay && overlay.verts > 0) {
      gl.useProgram(this.overlayProg);
      gl.uniform2f(this.uOverlayRes, w, h);
      gl.uniform4f(this.uOverlayView, view.zoom, view.zoom, view.panX, view.panY);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.highlightVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightVbo);
      gl.bufferData(gl.ARRAY_BUFFER, overlay.data, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, overlay.verts);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(null);
    } else {
      gl.bindVertexArray(null);
    }
  }

  private groundVerts = 0;
}

interface Uniforms3 {
  dir: WebGLUniformLocation;
  key: WebGLUniformLocation;
  ambient: WebGLUniformLocation;
}

function uploadLight(gl: WebGL2RenderingContext, u: Uniforms3, light: LightParams): void {
  gl.uniform3f(u.dir, light.dir[0], light.dir[1], light.dir[2]);
  gl.uniform3f(u.key, light.key[0], light.key[1], light.key[2]);
  gl.uniform3f(u.ambient, light.ambient[0], light.ambient[1], light.ambient[2]);
}
