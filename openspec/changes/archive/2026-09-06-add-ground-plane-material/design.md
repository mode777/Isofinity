# Design: add-ground-plane-material

## Context

The runtime compositor (`src/runtime/renderer.ts`, raw WebGL2) draws three
families today: the flat ground batch (unlit color, first, no depth), the
sprite batch (baked render + g-buffer arrays, per-pixel depth test against
the shared linear ray-depth mapping `uDepthA/uDepthB`), and the dynamic mesh
(albedo texture × SH-9 diffuse irradiance + key N·L, ACES/exposure/
saturation, writes `gl_FragDepth = uDepthA·dot(VIEW_DIR, pos) + uDepthB`).
The world's environment already exists as state (`doc.env`:
`{kind:'hdri', fileName}` in `src/app/store/world.ts`), but today it is only
inherited from sprite bake provenance — nothing lets the user pick an HDRI
for the world. EXR/equirect decoding exists (`src/app/hdr.ts`,
`shProbe.ts`); three.js is used CPU-side only (ADR 0007). World JSON is at
`isoinfinity-world/3`.

## Goals / Non-Goals

**Goals:**
- Ground plane as real geometry: shared depth mapping, so sprite occlusion
  works per pixel unchanged.
- One lean material pipeline (zip → maps → GL textures) that later changes
  can extend (mesh ARM/normal maps, specular, terrain).
- Ground lighting identical to the mesh path's ambient model so the two
  dynamic families stay visually consistent.

**Non-Goals:**
- See proposal Non-goals (terrain heights, specular/reflections, R/M
  semantics, mesh material upgrade, ground interactivity).

## Decisions

### D1: Ground joins the mesh family, not the flat-batch family
A new ground program draws a world-space quad at y=0 with the same
`gl_FragDepth` mapping as the mesh program. The flat ground batch remains
only as the pre-material default (its unlit color shows until a material is
selected — and as such also serves as the no-workspace fallback).
Alternative considered: render the ground into a giant g-buffer — rejected;
the ground is generated geometry, not a baked asset with passes.

### D2: Lean shading now, structured for later
Fragment shader: linearized diffuse albedo × SH-9 ambient (`SH_IRRADIANCE_GLSL`,
perturbed tangent-space normal) × AO (arm.r), plus key N·L, through the
shared ACES/exposure/saturation chunk — i.e. the mesh shader plus a normal
map and AO term, minus skinning. ARM is decoded to a texture now; R/M
channels are read but unused, so enabling GGX later is shader work only.
Tangents: computed on the CPU from the plane's analytic parameterization
(up = +Y), no per-asset tangent data needed.
Alternative considered: full IBL specular from the equirect — deferred
(deliberately, per user decision); also deferred for sprite consistency:
the baked sprites only know SH ambient.

### D3: Material zips, identified by file-name pattern
Reuse the existing zip tooling (same path as `.sprite` bundles). On load,
match entry names against `<name>_(diff|arm|nor_gl)_*.(exr|png|jpg)`
(case-insensitive); exactly one entry per slot expected, first wins with a
notice if duplicated. Decode: EXR floats via the existing EXR decoder;
PNG/JPG via ImageBitmap (`UNPACK_FLIP_Y_WEBGL` for gl-style UVs, matching
the mesh albedo upload). Normal maps stay byte textures (LINEAR, repeat
wrap); diffuse EXR (if float) uploads as float texture, otherwise sRGB
bytes decoded in-shader — same convention as existing texture paths.
Invalid material (no `diff`) → named error, previous material kept.

### D4: World JSON bumps to `/4`, additive
`isoinfinity-world/4` gains three optional top-level fields: `ground:
{material: string, tileScale: number}`, `env: {hdri: string}`-style
user-selected HDRI (reconciled with provenance-inherited env: user selection
wins when present). Loader accepts `/1`–`/4`; absent fields leave defaults
(no material → flat-batch look, default tile scale, provenance env).
Unresolvable material on load → status notice, ground default, scene loads.
Alternative considered: stay at `/3` with optional fields — rejected; the
`/2`→`/3` precedent bumps the marker when fields are added, keeping the
marker a truthful capability statement.

### D5: World HDRI becomes first-class state
`doc.env` gains a user-selected variant (`{kind:'hdri', fileName, source:
'user'}` vs provenance-derived). The SH probe and ground ambient rebuild
from it exactly as they do today from provenance env. Properties panel gets
an HDRI picker listing `hdri/` files. Changing it does NOT re-bake sprites —
their baked render texels keep their own provenance environment; only the
dynamic ambient (SH probe) and ground respond. This asymmetry is acceptable
now and worth an explicit note in docs/runtime.md.

### D6: Renderer stays raw WebGL2 (ADR)
three.js stays CPU-side (loaders, animation). The expensive part of rolling
our own is ecosystem shading features; this change adds ~60 lines of GLSL to
an existing chunk architecture, whereas adopting three's renderer would mean
migrating the invariant-heavy painter-order + custom-packed-depth sprite
compositor into a foreign scene graph. Captured as a new ADR in
`docs/decisions/` per the AGENTS.md dividing rule.

## Risks / Trade-offs

- [Ground normals + repeat-wrap sampling of EXR float textures on some
  drivers] → keep map textures LINEAR with REPEAT, clamp mip levels; the
  browser harness (`scratch-verify.html`) gains a ground check.
- [User-selected HDRI makes ground/mesh ambient diverge from baked sprite
  texels] → D5 documents the one-way relationship; a future re-bake loop
  (provenance already supports it) is the escape hatch.
- [Tile scale in world units may surprise with very small scales] → clamp
  UI input to a sane range; scale semantics documented (tiles per world
  unit).
- [`/4` acceptance widens the parser matrix] → existing parse tests in the
  Node harnesses stay green; add old-format tolerance cases to the world
  load path if it gains Node-runnable checks.

## Migration Plan

Additive only: new folder convention, new optional JSON fields, new program
in the renderer. Rollback = revert; `/3` files keep loading either way.

## Open Questions

None — the lean-vs-PBR scope, persistence shape, and framework decision
were settled during exploration.
