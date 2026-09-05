## Why

The bake's fixed isometric orthographic camera fits its left/right/top/bottom
frustum to the projected model box, but its depth clip planes (near/far) are
fixed constants chosen for small test primitives. A model whose depth extent
along the view direction (≈ `0.61·(x+z) + 0.5·y`) reaches past that fixed slab
is clipped in the baked passes: geometry vanishes from the g-buffer and the
path-traced render pass, and the realtime mesh preview clips the same way
because it reuses the same camera. Sprites must bake complete, so the clip
volume must be derived from the model like the rest of the framing.

## What Changes

- `frameIsoBox` (`src/bake/iso.ts`) derives the camera's near/far planes from
  the same 8-corner camera-space projection it already uses for the lateral
  frustum, so the clip volume always contains the whole (yaw-rotated) model
  box, with a small safety margin and a positive near plane.
- All consumers of the frame inherit the fix unchanged: raster g-buffer bake,
  path-traced render pass (the tracer reads the same camera), realtime mesh
  preview, and the box-frame overlay projection (`projectBoxFrame`).
- Lateral framing, pixels-per-unit, padding, origin anchor, camera azimuth/
  elevation and the stored depth definition (`dot(worldPos, viewDir)`) are
  unchanged — for models that already fit, the frame stays identical.

## Capabilities

### New Capabilities

### Modified Capabilities

- `asset-baking`: new requirement pinning the bake camera's projection so its
  clip volume always includes the whole model in every view slot — passes of
  large models bake without geometry clipped by near/far planes.

## Impact

- Code: `src/bake/iso.ts` (`frameIsoBox` — the only place the bake camera is
  built); indirectly `src/bake/bake.ts`, `src/bake/pt.ts`,
  `src/app/realtime.ts`, `src/bake/export.ts` (frame consumers, no edits
  expected).
- Browser harness `scratch-verify.ts` gains a framing check for the new clip
  behavior (it exercises `frameIsoBox` directly).
- Docs: `docs/bake-pipeline.md` (Camera section — note the clip slab is
  derived from the box, not fixed); `docs/roadmap.md` row when it lands.
  No ADR — this tightens the existing fixed-camera invariant (ADR 0001/0005),
  it does not settle a new trade-off.
- **Format impact: none.** No manifest, bundle or pass layout change; stored
  depth is world-space (`dot(worldPos, viewDir)`) and independent of camera
  near/far, so `isoinfinity-bake/6` and older bundles are unaffected and no
  format bump is needed.

## Non-goals

- No change to the fixed isometric camera angle, elevation, pixels-per-unit,
  padding rule, origin anchor or lateral (left/right/top/bottom) framing.
- No manifest/bundle format change and no new recorded camera fields.
- No runtime world renderer changes (`src/runtime/renderer.ts` never uses the
  near/far planes; it reconstructs positions from stored world-space depth).
- No re-bake or migration of existing sprites: bundles baked before this fix
  stay as they are; affected sprites re-bake through the existing provenance
  flow.
