# 0008 — The placement anchor is an authored per-asset origin

Status: Accepted

## Context

Every sprite needs one anchor point that placement uses as the asset's
handle. So far that anchor was implicitly the bake box's min corner: it
fell out of projecting `(0,0,0)` in `frameIsoBox`, and it served — a 1×1
asset fills its cell exactly. But a bounding-box corner is a poor handle
for assets whose visual foot (trunk, pole base, doorway) is not at the
corner, and facing changes pivot a placement around the corner instead of
around the asset. Sprites are authored in the bake editor's N view, so the
anchor belongs there — as an authored property, not a projection constant.
(Change record: `openspec/changes/settable-sprite-origin/`.)

## Decision

The placement anchor is a per-asset authored value:

- Authored **only in the N view**, as a 3D coordinate in the N view's
  asset space measured from the box min corner (`BakeDocument.origin`,
  default `(0,0,0)`); the panel clamps it into the source box.
- Every other slot **derives** its anchor by the same quarter-turn the
  model itself follows — `slotAnchorPoint(origin, size, yawDeg)` in
  `src/shared/iso.ts` mirrors `applySlotModelRotation` exactly — so all
  views anchor the same physical point of the asset and none is authored
  directly.
- Each view's `originPx` records the anchor's projection; the anchor never
  affects framing or pass pixels, so edits re-project `originPx` in place
  (`setBakeOrigin`) without a re-bake.
- The anchor travels in the provenance block as optional `origin`
  (`isoinfinity-bake/6` unchanged — the `bake.tiles` precedent), omitted at
  the default so default-anchored bundles stay byte-identical.
- Placement draws the sprite so its `originPx` lands at the placement's
  projected position — the same point where the box corner lands today
  (the placement's cell min corner at the placement height). The full 3D
  point lands there: an anchor above the ground sinks the asset at ground
  level. Picking and erase stay cell-based.

## Consequences

- `frameIsoBox`/`projectBoxFrame` take an origin parameter; the hardcoded
  `(0,0,0)` projection is gone from `src/bake/iso.ts`.
- Facing changes pivot a placement around the authored anchor (a
  ground-center anchor rotates the asset in place), at the accepted cost
  that non-corner anchors shift the drawn sprite relative to the nominal
  cell — erase/picking still resolve by cell, not by drawn pixels.
- The anchor is baked-output state but not preset state: it rides
  provenance, never `presets/` (presets are bake looks, like the
  texture-size exclusion).
- Old bundles need no migration (missing field = min-corner anchor) and
  new bundles load in any build that reads `/6`.

## Rejected alternatives

> **Amendment (anchor-lands-at-cursor):** the placement-point convention
> below is cursor-exact — the anchor's world position is
> `(mouse ground x, brush height, mouse ground z)`, with no half-cell
> offset. The height rule is unchanged: the anchor lands at the brush
> height, so a raised anchor still sinks the asset at ground level
> (base height = brush height − anchor y). Everything else in this
> decision — anchor authoring, per-slot derivation, `originPx` — stands.

- **Anchor lands at the clicked cell's center** (with the default anchor
  becoming the ground-plane center): grid-aligned by default, but it
  changes the default for every existing sprite, shifts multi-cell assets
  in old worlds, and needs on-load anchor migration. The user chose
  today's anchor spot.
- **Project only the anchor's ground-plane point** (ignore Y at
  placement): makes the Y input dead — `originPx` would not depend on it.
  The full 3D point landing is what makes Y meaningful (hanging anchors).
- **Per-slot manual anchors**: facing changes would jump the anchor
  between different physical points of the asset; also needless authoring
  work.
- **Fractions of the box extent** (scale-independent storage): the user
  asked for a coordinate in units; proportional rescaling on scale change
  achieves the same with clearer inputs.
- **Format bump to `/7`** for the provenance field: breaks forward-loading
  in older `/6`-capable builds for a purely additive optional field.
