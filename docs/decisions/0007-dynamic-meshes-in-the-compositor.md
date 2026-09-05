# 0007 — Dynamic meshes render inside the raw-GL compositor

Status: Accepted (2026-09-05)

## Context

The end goal is animated, skinned characters moving through the
prerendered scenery. That is the first feature needing per-frame vertex
data (joint palettes) in a renderer designed around static, CPU-projected
geometry — and the first that tempts a full scene-graph framework into the
runtime. The shared z-buffer requires characters and sprites to composite
in **one GL context, one frame**.

## Decision

Dynamic meshes are an **opaque mesh batch inside the existing raw-WebGL2
compositor** (Option A):

- **Skinning** is a 10-line palette blend in the mesh vertex shader
  (`Σ wᵢ·palette[jᵢ]·pos`); three.js serves as a **CPU-side library only**
  (GLTFLoader parse + AnimationMixer pose engine) and makes zero GL calls.
- **Depth** stays the shared world linear map
  (`gl_FragDepth = 0.5 − dot(worldPos, viewDir)/128`): a mesh texel and a
  sprite texel at the same world point write the same window depth. The
  bridge is portable — a tuned ortho near/far reproduces the same map in
  fixed-function depth, so the convention survives any future renderer.
- **Draw order**: opaque meshes between the shadow and sprite batches;
  sprite/character occlusion resolves pixel-accurately through the depth
  test (meshes must stay opaque — transparency is a different problem).
- **Shading parity**: meshes replicate the sprite formula
  `sRGB(ACES(albedo·E_env(N)) × factor)` — an SH diffuse-irradiance probe
  from the sprites' bake environment (provenance), the same key+ambient
  factor, the same ACES fit, double-shading included (ADR 0003).

## Consequences

- Single-context / single-state-owner per frame is mandatory: GL contexts
  cannot share a depth buffer (layered canvases kill per-pixel
  occlusion), and interleaving raw GL with a three.js render call desyncs
  its state cache.
- The compositor's invariant refines to: **no camera matrices; object
  transforms are per-instance data** (per-character palettes,
  per-placement yaw+translation).
- The mesh batch is mesh-generic — a future terrain/dynamic-ground change
  reuses it unskinned, and placement-`y`/surface-snap semantics are that
  change's design surface.

## Rejected alternatives

- **Full three.js renderer for the world view** — deferred, not rejected:
  buys the native SkinnedMesh path and morph targets, but costs a rewrite
  of a working compositor for capability not yet needed; the sprite
  shaders port to `ShaderMaterial` nearly verbatim when that day comes.
- **Interleaving raw GL and three.js renders in one frame** — three.js
  caches GL state assuming it owns the context; raw calls between three
  renders desync it (`renderer.resetState()` is a band-aid).
- **Two layered canvases** — GL contexts cannot share a depth buffer;
  pixel-accurate interpenetration (the core requirement) dies.
- **Hand-rolled animation runtime** — skinning math is trivial, but clip
  sampling/slerp/wrapping is not; three.js's CPU animation system is
  battle-tested and renderer-independent.
