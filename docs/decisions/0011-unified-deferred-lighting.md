# 0011 — Unified deferred lighting: one factor, applied in the light pass

Status: Accepted (2026-09, unified-deferred-lighting)

## Context

Lighting was forward and per-draw: sprite, mesh and ground fragments each
applied the dynamic factor, with the mesh applying it post-tonemap in its
own shader — three implementations of one idea that had already drifted.
Adding point lights would have meant touching every path, and POE (our
reference architecture) applies dynamic lights as deferred screen-space
passes over baked position/normal data. The screen-space g-buffer the
deferred pass needs did not exist: the per-sprite bake g-buffer was
consumed at composite time and nothing survived into a sampleable form.

## Decision

The world compositor (`src/runtime/renderer.ts`) is a two-phase frame:

1. A geometry pass draws ground, meshes and sprites into an offscreen MRT
   set — RT0 (RGBA8): display-referred albedo·AO texel; RT1 (RGBA16F):
   world-space normal + linear reference-plane depth (the bake g-buffer
   layout); RT2 (RGBA16F, depth in r — RGBA16F rather than R16F so the set also renders under EXT_color_buffer_half_float). A sprite's RT0 texel is its baked
   render texel — its baked light IS its albedo·AO (ADR 0003's trade,
   formalized); meshes and the ground bake their SH-environment ambient
   into the texel at write time.
2. One fullscreen deferred light pass applies the ADR 0003 multiplicative
   factor — `albedo·AO × (ambient + key·N·L + Σ point lights)` — exactly
   once, for every surface kind, over the world position reconstructed
   from the g-buffer depth (ADR 0001). Point lights live in a std140 UBO
   capped at `MAX_POINT_LIGHTS = 16` with a quadratic window to zero at
   the radius. The Dynamic-light switch pins the factor to identity — the
   composite presents RT0·AO, the pure prerendered image.

This refines ADR 0009 (still raw WebGL2, no camera matrices) and relocates
ADR 0003's factor application from per-draw fragments to the one pass; its
multiplicative form and identity-off semantics are unchanged. Alpha-blended
geometry writes straight color with its own alpha as the blend weight on
every attachment (WebGL2 core has one blend state per draw); the grounding
shadow maps to the ground plane (up normal, ground depth, ADR 0010's rule
extended to the screen g-buffer).

## Consequences

- One lighting implementation for every surface kind; a mesh texel and a
  sprite texel of equal material/light respond identically to every
  dynamic light (the mesh's post-tonemap factor wart is gone).
- Sprite shading is pixel-equivalent to the old forward formula; the
  ground's key light is no longer double-sRGB-decoded and the ambient
  picker now reaches it (it previously did not) — both deliberate
  corrections, recorded in the change's design.
- Every surface must write all three targets; a future drawable forgets
  the g-buffer at its own peril (it would light wrong, not fail loudly).
- AA fringe pixels hold blended normals/depth (1px silhouette error,
  accepted); `OES_draw_buffers_indexed` is the upgrade path if it ever
  shows.
- Transparency cannot enter the g-buffer: future transparent/emissive
  geometry draws forward, after the light pass.
- RT2's alpha channel is reserved as the future shadow-blend hook (a POE
  style control map scaling key/point contribution inside baked shadows).

## Rejected alternatives

- **Forward per-fragment light loops in every draw shader**: same math but
  re-implemented in four programs, paid per fragment of every draw, and no
  position reconstruction for point lights.
- **Ambient applied in the geometry pass**: ambient needs normals and the
  pass has them for everything — evaluating it per-kind at write time
  would keep the per-path drift the restructure exists to remove.
- **Premultiplied-alpha g-buffer blending**: works but forces
  un-premultiplying display-referred sRGB texels in the light pass and
  gives the depth channel no blend-safe home; straight alpha with
  per-attachment weights is simpler and exact for the opaque interior.
- **Inverse-square point-light attenuation**: unbounded near the source,
  hard to art-direct; the quadratic window reaches exactly zero at the
  radius.
