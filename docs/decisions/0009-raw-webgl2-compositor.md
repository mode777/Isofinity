# 0009 — The compositor stays raw WebGL2 (three.js as CPU-side libraries only)

Status: Accepted (2026-09, change `add-ground-plane-material`)

## Context

The runtime compositor (`src/runtime/renderer.ts`) implements a rendering
model no off-the-shelf scene graph provides: painter-sorted alpha-blended
baked sprites whose every pixel depth-tests against a custom-packed linear
ray-depth map (`uDepthA/uDepthB`), shared by real-time geometry (dynamic
meshes, the ground plane) through `gl_FragDepth`. Adopting three.js's
renderer was proposed while adding the ground plane's PBR-style material,
on the argument that rolling our own shading "gets expensive".

## Decision

World rendering stays on the raw WebGL2 compositor. three.js is used
CPU-side only — loaders, skinning math, animation, image decode (ADR 0007)
— and never draws to the canvas. New shading features are additive GLSL
chunks in the existing shader architecture (`SHADE_CHUNK`, `ACES_GLSL`,
`SH_IRRADIANCE_GLSL`), consumed by flat/sprite/mesh/ground programs alike.

## Consequences

- Every new lighting/material feature (ground materials now; specular,
  reflections, shadows later) is written by hand as shader chunks — an
  accepted, bounded cost that keeps the depth-compositing invariants in one
  place.
- The shared linear depth mapping remains the single contract between bake
  and runtime; no foreign renderer may re-implement or bypass it.
- Migrating the sprite compositor into three.js later remains possible in
  principle but is a one-way door the other direction; feature pressure
  (e.g. mesh shadow casting) should first be met by porting the specific
  technique, not the framework.

## Rejected alternatives

- Adopt three.js's renderer wholesale: the expensive parts of rolling our
  own (ecosystem shading) are exactly the parts we keep deliberately lean,
  while the irreplaceable part (per-pixel sprite occlusion against baked
  ray-depth) would have to be re-implemented through custom
  materials/depth overrides — same shader work, plus a framework
  translation layer and upgrade risk on top.
