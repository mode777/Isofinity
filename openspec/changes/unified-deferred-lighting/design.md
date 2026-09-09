# Design — Unified deferred lighting + point lights

## Context

The world compositor (`src/runtime/renderer.ts`) is a painter's-order
composite into the default framebuffer (ground → contact shadows → meshes →
sprites → overlay). Lighting is forward: four programs each embed a light
factor, and they already disagree (meshes apply the factor post-tonemap;
sprites/ground pre-tonemap — the ADR 0003-era split). The per-sprite bake
g-buffer (RGBA16F: rgb = world normal, a = linear reference-plane depth,
ADR 0001) is consumed per fragment during the sprite draw only; after the
composite, no screen-space surface data survives. See proposal.md for
motivation.

## Goals / Non-Goals

**Goals:**

- One place where dynamic light is evaluated (the deferred pass), shared by
  every surface kind — killing the per-path shading drift.
- Point lights as a placement kind with an architecture whose cost does not
  grow per-fragment-per-light across every draw.
- Pixel-parity with the forward multiplicative model for sprites/ground
  when no point lights exist.
- A position for future work (per-light scissoring, shadow-blend
  modulation, transparent forward pass) without re-architecting.

**Non-Goals:** (see proposal.md — shadows, clustered lighting,
transparency pass, bake changes, locomotion/terrain.)

## Decisions

### D1: Two attachments, not a three-target g-buffer

The offscreen FBO carries:

- **RT1 (RGBA16F)**: rgb = world-space normal, a = linear reference-plane
  depth — byte-identical layout to the per-sprite bake g-buffer, so the
  sprite geometry shader forwards values it already samples, and the ADR
  0001 reconstruction code applies unchanged.
- **RT2 (RGBA8)**: rgb = albedo, a = AO. For sprites albedo·AO ≡ the baked
  render texel (AO = 1, the bake already carries its light — ADR 0003's
  "treat baked light as AO" formalized); for meshes the environment-lit
  tonemapped texel the mesh shader already produces before `shade()`;
  for ground the material albedo with the arm map's AO in alpha.

*Rejected a separate flat-color composite attachment (RT0 = shaded color)*:
ambient is evaluated in the deferred pass from g-buffer normals, so an
ambient-shaded composite target would be a derived image the pass never
needs — one less attachment, and the Dynamic-off path becomes "present
RT2·AO" with no special shader.

*Rejected storing raw albedo separately from AO for sprites*: the bake has
no albedo/AO split (ADR 0002); splitting one artificially would invent data.

### D2: Blending across MRT — accepted blended fringes first

WebGL2 core applies one blend state to all attachments. RT2 wants alpha
blending (AA fringes) while RT1 wants replace-only. **Chosen**: use the
existing alpha blend on both — a 1px antialiased fringe then holds an
alpha-weighted mix of front/back normals and depth, which the light pass
shades slightly wrong at exactly those pixels. Edge pixels are
half-background; the artifact is a 1px light-response error at silhouettes.

*Future alternative (documented upgrade path)*: `OES_draw_buffers_indexed`
(where available) gives exact per-attachment blending — RT1 replace-only,
RT2 blended — with a fallback to today's choice. An alpha-threshold write
mode on RT1 (front surface wins unblended, color still blends) is a second
fallback. Neither is required for v1.

### D3: The light pass is one fullscreen pass, one factor

`out = linearToSrgb(albedo·AO × (ambient(N) + key·max(N·L,0) + Σ point))`,
with world position reconstructed from RT1.a exactly as ADR 0001 specifies.
This reproduces the sprite forward formula bit-for-bit (the no-point-lights
parity argument). Point lights: UBO `PointLight[16]` (xyz + radius / rgb +
energy), quadratic window `atten = max(1 - d/radius, 0)²`, `max(N·L, 0)`
gating, radius early-out per light.

*Rejected forward per-fragment light loops in every draw shader*: same math
but re-implemented in four programs and paid per fragment of every draw
(even unlit-range ones); deferred also keeps the door open to per-light
scissored quads (a pure optimization: one scissored quad per light instead
of the fullscreen loop — the formula does not change).

*Rejected inverse-square attenuation*: unbounded near the source and hard
to art-direct; the quadratic window reaches exactly zero at the radius.

*Rejected ambient in the geometry pass* (the user's original sketch):
ambient needs normals, normals are in RT1, and evaluating it in the pass
unifies sprites (flat ambient today) with meshes/ground (SH today) on one
ambient model.

### D4: Mesh factor relocation (ADR 0003 successor)

The mesh fragment writes its env-lit tonemapped texel to RT2 (the value it
computes today before `shade()`); the deferred pass applies the factor.
Today it applies the factor post-tonemap in its own shader — this changes
mesh appearance slightly (accepted by decision; the point is the fix: a
mesh texel and sprite texel of equal material/light now receive identical
light response through identical math). A new ADR records the successor
decision: *the dynamic-light factor is applied exactly once, in the
deferred pass, for every surface kind*; ADR 0003's multiplicative form and
its identity-off semantics are preserved.

### D5: Grounding-shadow pixels map to the ground plane

The shadow pixel class (g-buffer-empty, shadow-tinted render texel) writes
RT1 = (up normal, analytic ground-plane depth — the GLSL ground unprojection
the sprite vertex stage already computes) and its render texel to RT2.
They are then first-class floor for the deferred pass, and the shared depth
buffer keeps its ground-plane depth (the interleaving rule from the
existing grounding-shadow spec is unchanged).

### D6: Ground normals for both ground paths

The material plane writes its perturbed surface normal (the value it
already computes) and albedo·AO. The flat batch (no material) writes
world-up normal, its flat vertex color as albedo, AO = 1 — without this,
point lights would pool nowhere on default-ground worlds.

### D7: Point lights are a placement kind (in-memory model + /6)

`world.ts` gains a `LightPlacement` (stable id, ground position, height,
radius, energy, color, depth key) — place/erase ride the existing
placement machinery; erase picks the topmost placement across kinds, so a
light occupies its ground cell footprint like sprites do. Persistence:
`isoinfinity-world/6` adds light placement entries; the loader accepts
`/1`–`/6` (older files simply carry no light entries). Save emits `/6`.
Light placements persist; **mesh placements remain in-memory editor state,
never serialized** (ADR 0006), and light markers/gizmos are editor chrome,
never serialized as anything but light placements.

### D8: Cap of 16 lights, placement-side accounting

`MAX_POINT_LIGHTS = 16` compile-time UBO cap (mirrors `MAX_MESH_JOINTS`).
Placements beyond the cap are legal editor state that render dark; the
runtime uploads the first 16 (deterministic order: placement order). The
editor MAY surface a status note when the cap is exceeded.

### D9: Frame plumbing

Geometry pass renders into the offscreen FBO sized to the canvas
(recreated on resize, deleted in `dispose()`); the light pass renders
fullscreen to the default framebuffer sampling RT1/RT2; overlay draws
after, unchanged. The texture-sampler budget of the light pass is two
textures plus the UBO. `gl_FragDepth` writes (the shared linear depth map)
continue to drive occlusion exactly as today; RT1.a stores the same linear
depth value pre-map.

## Risks / Trade-offs

- [MRT fringes blend normals/depth at AA edges → 1px light-response error
  at silhouettes] → accepted for v1 (D2); upgrade path documented
  (`OES_draw_buffers_indexed` / alpha-threshold writes).
- [Mesh appearance shifts (factor now pre-tonemap-multiplied through the
  shared pass)] → accepted by decision (D4); ADR records it as deliberate,
  with the unification benefit.
- [Baked-shadow areas receive key/point light scaled by their dark baked
  albedo — residual relighting of baked shadow cavities] → accepted: this
  is the current multiplicative model's behavior, extended; future hook is
  RT2.a as a POE-style shadow-blend modulation channel (an authored
  control map scaling key/point contribution) — reserved, not built.
- [Deferred cannot represent alpha-ordered transparent geometry] →
  documented ceiling: future transparent geometry (ghosts, particles,
  POE-style emissive) draws in a forward pass *after* the light pass,
  ignoring or sampling the light result; nothing in this design blocks it.
- [Full-res RGBA16F + RGBA8 attachments double-ish the frame's bandwidth;
  three fullscreen passes] → acceptable on the desktop-GL targets this
  editor runs on; per-light scissoring and attachment format slimming
  (e.g. two-channel packed normal) remain available optimizations.
- [Half-float depth precision in RT1 (≈0.0008 units, ADR 0001's accepted
  figure)] → already the pipeline's precision through the bake; unchanged.
- [Parity regressions during migration] → the no-point-lights frame is the
  regression target: `scratch-verify.html` gains composite-hash checks
  (existing primitive bundle hashes plus deferred-output hashes) so a
  browser diff is mechanical; sprite/ground parity is exact by
  construction, mesh parity is the accepted D4 exception.

## Migration Plan

Land in two independently-verifiable stages: (1) the compositor
restructure with zero new user-facing features — same lights, same
placement kinds, deferred output hash-compared against the forward frame
in the scratch harness; (2) point lights end to end (placement kind,
properties, `/6`, deferred evaluation). Rollback is a revert; no data
migration exists (world files are additive; old files load on new code and
vice versa).

## Open Questions

None — all decision points were resolved during exploration (D1–D9).
