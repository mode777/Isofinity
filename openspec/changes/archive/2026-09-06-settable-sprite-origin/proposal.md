# Proposal: settable-sprite-origin

## Why

Every baked sprite is placed in the world editor by one fixed anchor: the
projected box min corner (`originPx`). A bounding-box corner is a poor
handle for most assets — the visual "foot" (a trunk, a pole base, a
doorway) rarely sits at the corner, so placement lands the asset where its
loose box happens to start, and changing a placement's facing pivots it
around that corner instead of around the asset itself. The anchor should be
an authored property of the asset, set once in the bake editor where the
asset is authored.

## What Changes

- The sprite editor's properties panel gains an **Origin** section: three
  numeric inputs (X/Y/Z, asset-space world units) setting a 3D origin point
  for the document, plus a convenience button that sets it to the **center
  of the ground plane** `(size.x/2, 0, size.z/2)`.
- The origin is authored **only for the north view**. The E/S/W views
  derive their origin automatically: the same physical point of the asset,
  rotated into the slot's frame by the slot's model yaw (mirroring
  `applySlotModelRotation`), so the anchor stays on the same spot of the
  asset in every view and facing changes pivot around it.
- Each view's `originPx` reflects the anchor. Editing the origin
  re-derives every baked view's `originPx` immediately via pure projection
  — the passes themselves are pixel-identical (framing does not depend on
  the origin), so no re-bake is required. Re-bakes apply the current
  origin.
- Placement respects the anchor: a placement draws the sprite so the
  layer's recorded `originPx` lands at the placement's projected position —
  the same point where the box corner lands today (the clicked cell's min
  corner, at the placement height). The ghost preview shows this WYSIWYG.
  A 3D origin means the full point lands there: an anchor above the ground
  sinks the asset by that amount when placed at ground level (hanging
  anchors work; the ground-center button uses y=0, so it changes nothing
  vertically).
- The origin persists as an **optional `origin: [x, y, z]` field in the
  provenance block** (N-view asset space, unrotated box), so bundles
  re-open editable and re-bake in place with their anchor.
- The default origin stays the box min corner `(0,0,0)`; bundles written
  with the default **omit the field**, so existing bundles and worlds keep
  rendering byte-identically.

## Capabilities

### New Capabilities

- *(none)*

### Modified Capabilities

- `asset-baking`: the view-slot requirement's "origin anchor stays
  unchanged" clause is replaced by an authored anchor — the N view's origin
  is user-settable (inputs + ground-center button), E/S/W derive it by the
  slot yaw; the provenance requirement additionally records the origin
  point; re-bake restores and re-applies it. Framing, sprite rect, camera
  angles, and pass alignment stay unchanged.
- `runtime-sprite-rendering`: the placement rule is pinned to the layer's
  recorded origin — the anchor lands at the placement's projected position
  (today's anchor spot) in every direction, so facing changes pivot around
  the authored anchor while ground-footprint picking and erase stay
  cell-based as today.

## Impact

- **Bake core**: `src/bake/iso.ts` (`frameIsoBox`/`projectBoxFrame` take
  the anchor point), `src/bake/bake.ts` (`bakePrimitive` applies the slot
  origin transform; shared quarter-turn point-rotation helper), 
  `src/bake/export.ts` (`BakeProvenance.origin`, manifest write omits the
  default), `src/bake/bundle.ts` (provenance passthrough).
- **Editor**: `src/app/document.ts` (persisted `origin` field),
  `src/app/store/bake.ts` (validate/clamp + live `originPx` re-derivation,
  scale rescaling, provenance round trip, decode restore),
  `src/app/components/SpriteProperties.tsx` (Origin section),
  `src/app/components/SpriteEditor.tsx` (box-overlay cross marks the
  anchor).
- **Runtime/world**: no code changes — `originPx` already flows per view
  through `SpriteLayer`/`SpriteSet` into the compositor; placement, ghost,
  picking, and erase are untouched.
- **Verify**: `src/bake/views-verify.ts` (origin round trip, slot
  derivation, default omission), `src/bake/scratch-verify.ts` (anchor
  projection checks; primitive bundle hashes stay stable because the
  default omits the field).
- **Docs**: `docs/bake-pipeline.md` (sprite-placement + manifest sections,
  format-history note), `docs/runtime.md` (sprite/world editing),
  `docs/glossary.md` (origin point vs `originPx`), `docs/roadmap.md`.
  **ADR**: yes — the anchor semantics (N-authored, slot-rotated, lands at
  the placement point, default min corner) are a durable invariant.
- **Format version impact**: none — `isoinfinity-bake/6` keeps its name.
  The provenance block gains an optional field (the `bake.tiles`
  precedent: optional provenance fields do not bump the format). Parser
  tolerance is unchanged: `/4`–`/6` load as today; bundles without the
  field anchor at the box min corner.

## Non-goals

- Per-slot manual origins — only N is authored; E/S/W always derive.
- Dragging the origin in the viewport; viewport gizmos beyond the existing
  box-overlay cross moving to the anchor.
- Free (non-cell) placement, placement-offset controls, or any change to
  world-file format, erase footprints, or depth keys.
- Dynamic-mesh placements (they have no bake box).
- Auto-deriving an anchor from baked geometry (e.g. ground centroid) — the
  ground-center button is explicit; geometry-derived suggestions are a
  possible follow-up.
