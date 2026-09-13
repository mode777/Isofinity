# 0015 — Reconstructed-occluder directional shadows from the baked g-buffers

Status: Accepted (2026-09, add-dynamic-directional-shadows)

## Context

The world re-lights its prerendered sprites dynamically (ADR 0003, ADR 0011)
but casts no directional shadow: the only ground darkening was the baked,
direction-agnostic grounding patch (`src/bake/shadow.ts`). A day/night key
light therefore moved without moving a shadow, and sprites and characters
never shadowed one another. The obvious route — a real light-space shadow map
— needs geometry the runtime does not have: sprites are 2.5D camera-view
reliefs, and the source models are high-poly with alpha-card foliage that
decimation destroys. Full process record:
`openspec/changes/add-dynamic-directional-shadows/`.

## Decision

Cast the key directional light by marching a shadow ray through an occluder
**reconstructed at runtime from the baked g-buffers**, and confine the light
to a domain where that reconstruction is valid.

- **Occluder = a world-space vertical height field.** Every placed sprite's
  covered g-buffer texels are unprojected to world positions (the anchored
  draw minus the baked depth, in the fixed orthonormal iso frame) and splatted
  to the maximum surface height per ground cell (`src/runtime/shadowField.ts`).
  The per-layer point cloud is in placement-local space, so it is cached once
  and offset by each placement. Alpha-masked texels read empty and cast
  nothing. **No bundle or world-format change; no source-model geometry.**
- **The deferred light pass marches it.** From each receiver's reconstructed
  world position, a height-field DDA toward the key light multiplies only the
  key term by a binary visibility (`renderer.ts`, `LIGHT_FRAG`). The ray
  starts offset along the receiver's surface normal (a normal-offset bias,
  larger at grazing incidence): the height field represents a large structure
  as a solid column, so an unoffset ray from its own light-facing surface
  grazes back into the footprint and self-shadows the whole object. The CPU
  twin `shadowVisibilityCPU` is the verification reference.
- **The key light is confined to a shadow-valid domain** (`src/shared/lightDomain.ts`):
  within `MAX_OFF_AXIS_DEG` (65°) of the camera view ray and above
  `MIN_ELEVATION_DEG` (10°), clamped on edit and on sun-position output. The
  cone keeps the camera-facing relief well conditioned instead of edge-on.
  The editor's azimuth/elevation sliders are bounded to an axis-aligned
  window inscribed in the cone (azimuth ±60° about the camera azimuth,
  elevation 15°–85°) so a drag never produces a direction the cone would
  snap back; typed and sun-computed values clamp into the same window.
- **Meshes compound.** Characters splat their per-frame CPU-skinned vertices
  into the same field, so sprite and character shadows are one union (`max`
  height per cell, shadowed once) with no separate overlay.
- The occluder is engine state rebuilt on world load / placement edit; it is
  never serialized (ADR 0006). The baked grounding shadow remains for now;
  removing it is a follow-on gated on visual verification.

## Consequences

- Real, direction-correct shadows from data the engine already ships, with a
  dynamic day/night key, and no authoring step: it works out of the box.
- A sprite's shadow can only be as good as its camera-view relief. Overhangs
  and arches are approximated (single height layer); the domain constraint
  bounds the error rather than eliminating it. A layered/voxel occluder is
  the future upgrade if needed.
- The path-traced render pass may already carry a baked HDRI sun shadow; a
  dynamically-shadowed world should bake with a sunless/overcast environment
  or the two shadows double (`docs/bake-pipeline.md`).
- Per-pixel cost is one bounded height-field march in the existing light pass;
  the CPU field rebuild is paid on world load / edit, not per frame.

## Rejected alternatives

- **Light-space shadow map from reconstructed geometry.** Direction-dependent
  (re-rasterize on every sun move), and at low sun the map must cover ~10×
  object heights, blowing up resolution and causing peter-panning; point-
  splatting the relief into it leaves holes.
- **Baked occluder proxy mesh per asset.** Highest fidelity, but a new bundle
  pass and source-model simplification, and decimation is actively wrong for
  alpha-card foliage; the shipped g-buffer already is a resampled occluder.
- **Voxel grid / layered depth image.** Handles overhangs, but far more memory
  and a 3D DDA in WebGL2; a single-layer g-buffer only populates the front
  shell regardless.
- **Screen-space ray march (SSS) against the screen g-buffer.** Only knows the
  camera-visible frame; isometric sun angles make long shadows leave the
  screen and leak.
- **The discussed 5° altitude / 170° arc.** 5° gives ~11× shadow lengths and
  the arc ends sit nearly edge-on to the relief; the single cone bound is
  robust in a way separate az/el ranges are not.
