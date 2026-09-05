## Context

`frameIsoBox` (`src/bake/iso.ts`) is the single place the bake camera is
built; every consumer frames through it — raster g-buffer bake
(`bakePrimitive`), path-traced render pass (`PtBaker` hands the same camera
to the tracer), realtime mesh preview (`RealtimeMeshView`), and the pure-math
box overlay (`projectBoxFrame`). The lateral frustum is already fit to the 8
box corners projected into camera space; the depth planes are not: the
camera is constructed with near = 1, far = `2·CAMERA_DISTANCE + 1` = 9 while
parked `CAMERA_DISTANCE` = 4 units from the box center, giving a usable
depth slab of [center−3, center+5] along the view direction. The box's depth
span is `|dx|·sx + |dy|·sy + |dz|·sz` (the `depthRange` definition), ≈
`0.61·(sx+sz) + 0.5·sy` at the fixed iso angle — so boxes with
`sx+sz ≳ 10` start clipping near, `≳ 16` also clipping far. See
proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Derive near/far from the same corner projection that already computes the
  lateral frustum, so the clip volume always contains the yaw-rotated model
  box for every view slot and every size under the sprite pixel cap.
- Keep every other frame property bit-stable for boxes that already fit:
  same left/right/top/bottom, sprite rect, `originPx`, and pass alignment.

**Non-Goals:**

- No change to camera distance, angle, elevation, padding, pixels-per-unit,
  or the stored depth definition (`dot(worldPos, viewDir)`).
- No bundle format change; no migration or re-bake of existing sprites
  (see proposal Non-goals). Editor state touched by this change is engine
  camera state only — nothing new to serialize (ADR 0006).

## Decisions

### D1: Fit near/far from the existing 8-corner camera-space projection

The corner loop already transforms all 8 box corners into camera space to
compute lateral extents; extend it to also track `minZ`/`maxZ` of the same
camera-space coordinates and set, after the loop:

- `near = max(ε, −maxZ − margin)` (camera looks down −Z; −maxZ is the
  closest corner distance)
- `far = −minZ + margin`

with a small multiplicative or absolute margin (e.g. 1% of the depth span,
floored at a small absolute epsilon) so boundary geometry can't sit exactly
on a clip plane. `ε` guards the degenerate flat-box case (`depthRange`
span 0 → near must stay > 0).

- *Why:* one code path, one invariant — "the projection is derived from the
  box" — matching how the lateral frustum and the world-runtime
  reconstruction already work; zero drift possible between consumers.
- *Alternative — scale the camera distance with the box and keep fixed
  near/far:* rejected; it couples two concerns, changes nothing observable
  over D1, and still needs a span-derived far plane for very large boxes.
- *Alternative — enlarge the fixed slab (e.g. near 0.01, far 1000):*
  rejected; arbitrary constants just move the clip threshold and, for
  raster depth this doesn't matter, but the path tracer's camera-ray range
  and float precision degrade for no benefit.

### D2: Camera distance backs off deep boxes along the view direction

*(Revised during implementation: the original D2 kept the camera a fixed 4
units from the box center. That cannot hold for boxes whose half-depth along
the view direction exceeds 4 — e.g. a plain 10×10×10 box (half-depth ≈ 8.6,
far under the sprite pixel cap) would put its nearest geometry behind the
camera plane, where no positive near plane can ever reach it, violating the
spec's "any model size within the sprite pixel cap". Orthographic
projection makes the fix observably free: translating the camera along its
own view direction changes no lateral NDC coordinate, so `left/right/top/
bottom`, sprite rect and `originPx` are untouched, and stored bytes never
depended on near/far at all.)*

The camera sits at `distance = max(CAMERA_DISTANCE, halfDepth + gap)` from
the box center along the view direction, with a small positive `gap` (1
unit): boxes that fit today keep `distance = 4` exactly — identical camera
matrix — while deeper boxes back off just enough that every corner sits
strictly in front of the near plane. `reconstructWorldPos` uses only the
lateral frustum values and `matrixWorld`, and the stored depth is
world-space (`dot(worldPos, viewDir)`, ADR 0001), so no reconstruction or
manifest semantics move. The realtime preview pans/zooms the camera
position but inherits distance and planes unchanged.

### D3: Consumers need no edits — verify instead

`bake.ts`, `pt.ts`, `realtime.ts`, `export.ts` all read the camera from
`frameIsoBox`/`IsoFrame` and are covered by D1/D2. The change is validated
by a framing check in `scratch-verify.ts` (browser harness) that frames a
box large enough to violate the old slab and asserts every corner lies
strictly inside [near, far] plus unchanged lateral framing for a small box
— plus the existing `views-verify` bundle round-trips (no format change, so
no new bundle checks).

## Risks / Trade-offs

- [Numerical boundary: a corner exactly on a clip plane] → margin in D1
  keeps geometry strictly inside; the harness check asserts strict
  containment.
- [Degenerate zero-depth boxes (flat planes)] → near floored to a small
  positive epsilon, far at least epsilon + margin.
- [Hidden reliance on near/far somewhere] → grep shows the slab is only
  consumed via the camera's projection matrices (raster GL clip, path
  tracer camera rays, preview GL clip); `reconstructWorldPos` and the
  runtime never read near/far. The scratch harness hashes catch accidental
  pass changes.
- [Half-float g-buffer depth ulp at larger depths] → unchanged by this fix:
  stored depth was already unbounded world distance and large models already
  reached large depths on covered pixels; this only stops clipping them
  away.

## Migration Plan

Single-commit fix, no data migration. Old bundles stay valid (format /6
unchanged); affected large models re-bake through the existing provenance
re-bake flow. Rollback is reverting the one function.

## Open Questions

None.
