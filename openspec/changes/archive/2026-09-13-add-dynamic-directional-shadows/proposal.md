## Why

The world already re-lights its pre-rendered sprites dynamically (ADR 0003,
ADR 0011), but nothing in the scene casts a directional shadow: the only
ground darkening is the baked, direction-agnostic grounding patch composited
into each sprite's render pass (`src/bake/shadow.ts`). A day/night cycle can
therefore move the key light across the sky without moving a single shadow,
and sprites and characters never shadow one another. The runtime already
carries per-pixel world positions — the baked g-buffer stores linear ray
depth (ADR 0001) — so a real directional shadow can be reconstructed at
runtime from data the engine already ships, with no new bake pass and no
model decimation.

## What Changes

- Add a **reconstructed world-space occluder**: every placed sprite's covered
  g-buffer texels are unprojected to world positions and splatted into a
  world-space field (a vertical height field, with a per-frame dynamic layer
  for characters). The occluder is derived from the baked data, not from the
  source model, so high-poly and alpha-masked assets (grass) are supported
  without decimation; MASK coverage is preserved.
- Add a **directional shadow test** to the deferred light pass: each receiver
  pixel marches a ray toward the key light through the occluder field and
  multiplies the key term by the resulting visibility. Ambient and the baked
  albedo·AO are untouched.
- **Constrain the key-light direction** to an allowed domain — a cone around
  the fixed camera's view ray (plus an elevation floor) rather than only the
  elevation/azimuth examples discussed. The constraint guarantees the
  camera-facing relief is a well-conditioned occluder; the key-light and
  sun-position controls clamp into it.
- **Dynamic meshes cast and receive the same shadow**: character skinned
  vertices feed the same occluder/test, so sprite and character shadows
  compound into one region (union of visibility, never double-darkened).
- Keep the existing baked grounding shadow in place for now; removing it is a
  follow-on once the directional system is visually verified (see Non-goals).

## Capabilities

### New Capabilities

- `runtime-directional-shadows`: the reconstructed world-space occluder, the
  per-pixel directional shadow test in the light pass, the allowed
  key-light domain, and mesh/sprite shadow compounding.

### Modified Capabilities

- `runtime-deferred-lighting`: the key directional term is scaled by a
  per-pixel shadow visibility derived from the reconstructed occluder.
- `runtime-mesh-rendering`: placed meshes contribute to the occluder and
  receive the same directional shadow sprites receive.
- `integrated-editor`: the key-light azimuth/elevation and sun-position
  controls clamp to the allowed light domain.

## Impact

- **Code**: `src/runtime/renderer.ts` (deferred light pass + occluder texture
  upload/draw), a new occluder-build module (CPU reconstruction from the
  in-memory g-buffer layers, mirroring `src/runtime/surfaceSnap.ts`), world
  store wiring for rebuilds, `src/app/light.ts` and `src/shared/sun.ts` for
  the direction clamp, and the properties panel for the clamped controls.
- **No bundle or world-format change**: the occluder is rebuilt at runtime
  from bundles already loaded; `isoinfinity-bake/6` and
  `isoinfinity-world/8` are unchanged. No new fields, no tolerance change.
- **Docs**: `docs/runtime.md` (Lighting, Renderer), `docs/glossary.md`
  (occluder field, shadow visibility), `docs/roadmap.md` (the planned "Real
  shadow mapping" item), and a new ADR recording the reconstructed-occluder
  decision and the light-domain constraint. `docs/bake-pipeline.md` gets a
  note on the bake-environment/double-shadow coupling.
- **Verification**: a Node-runnable occluder-build/direction-clamp verifier
  (new `verify:*` script) plus `npm run build`; the GPU shadow pass is
  checked in `/scratch-verify.html` / `/mesh-debug.html`.

## Non-goals

- **Removing the baked grounding shadow** (`src/bake/shadow.ts`, the
  `groundShadow` provenance toggle, the per-placement shadow strength, and
  the runtime shadow-pixel classifier). This is the explicit follow-on once
  the directional shadow is verified; the design records how the two
  systems would reconcile in the meantime (bake the ground shadow off, or
  accept a bounded double-shadow).
- **True 3D occluder volumes / overhangs** (voxel grids, layered depth
  images, or source-model proxies): the reconstructed vertical field is a
  single layer, so overhangs and the underside of arches are approximated.
  The light-domain constraint is what keeps this approximation valid, and a
  layered/voxel upgrade is recorded as future work.
- Shadow casting from point lights, soft/area shadows, and any bake-pipeline
  format addition.
