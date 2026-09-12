## Context

The ground plane is the constant `GRID_N = 12` in `WorldEditor.tsx`, and it
leaks into module-level constants: the checkerboard batch is built once
(`GROUND = buildGround()`), and the fixed "world image" frame every batch,
overlay, mesh, and pick inverts (`minU/maxU`, `CANVAS_W/H`, `ORIGIN_X/Y`)
is computed at module load. World documents otherwise carry all scene state
(`src/app/document.ts`, `src/app/store/world.ts`); ground material/tile
scale already live there as persisted state serialized into
`isoinfinity-world` files (additive optional fields per version bump, now
`/6`). Editor chrome vs persisted state is split per ADR 0006. Worlds are
created two ways today: the project browser's "New world" button
(`newWorldDoc()`), and the implicit creation inside `placeInWorld()` (the
sprite→world in-memory handoff). Ground-state edits (material, tile scale)
are not undoable; placement-level edits are.

## Goals / Non-Goals

Goals:

- Ground size becomes per-document world state, flows into the ground
  batch, ground-material quad, fit view, world-image frame, and world
  files.
- Creation asks for a size; existing maps resize from the panel.
- The one implicit creation path (place-in-world) goes away.

Non-Goals (beyond the proposal's): terrain/height variation; viewport
drag-handles; resize undo; placement clamping to bounds; renderer shader
changes (`setGroundExtent` is already a parameter).

## Decisions

**D1 — Size is persisted world state in `ground`, serialized as `/7`.**
`WorldDocument.ground` gains `width`/`depth` (default 12 × 12) next to
`material`/`tileScale`. The save writes them only when they differ from the
default, under the existing `ground` object; the parser accepts
`/1`–`/7` and validates a present size as finite positive numbers
(rejecting the file otherwise, like malformed lights). Rationale: size is
scene geometry, not chrome (ADR 0006); the additive-optional-field +
marker-bump pattern is the established format evolution (see the
format-history table in `docs/bake-pipeline.md`'s world-format sibling in
`docs/runtime.md`). Alternatives: a separate top-level `size` field
(rejected — it belongs with the rest of the ground state); reusing `/6`
with an optional field (rejected — every additive change so far bumped the
marker; readers can tell what a file carries).

**D2 — Resize is origin-anchored, not center-anchored.** The (0, 0)
corner stays put; growing/shrinking extends toward +x/+z. Rationale: the
ground coordinate system is the anchor for free-form placement, picking
(`screenToGround`), depth keys, and every saved world; keeping it fixed
means saved placements of an unchanged region stay exactly where they
were, and shrink semantics ("keep everything") needs no coordinate
re-mapping. Alternative rejected: center-anchored resize would shift every
existing placement's meaning on resize and complicate nothing else.

**D3 — The world-image frame becomes a pure function of size, memoized.**
Turn the module constants into `worldFrame(width, depth)` →
`{ canvasW, canvasH, originX, originY }` and `buildGround(width, depth)`
(memoized in a `Map` keyed by `"w×d"` — sizes are few). The per-frame loop
reads the live document's size, re-applies the canvas backing store when
it changes, feeds `renderer.setGroundExtent(width, depth)` and
`setMeshFrame(originX, originY, PPU)` from the computed frame, and adds
the size to the applied-`groundKey` so the material quad re-applies on
resize. Rationale: the fixed-camera projection is already a pure CPU
computation (`src/shared/iso.ts`); only its extent was frozen. Fit-view
math consumes the frame, so zoom/pan is untouched conceptually.

**D4 — Refit the view on resize.** Committing a resize resets the
document's view transform to fit (the `null` transform). Rationale: the
world-image pixel space re-anchors with the frame, so a kept zoom/pan
would show a confusing shifted view; fit always reveals the new plane.
Alternative rejected: anchor-preserving transform math for a rare,
discrete operation.

**D5 — Size clamps to whole units in 1–128 per axis, at the input
boundary.** The dialog and panel fields clamp/round on commit (panel
follows the existing precise-input conventions); internal state always
holds valid values so serialization never writes junk. Rationale: the
checkerboard is unit cells (integers keep it seamless) and 128 × 128 is
~100 k static ground vertices plus a 2-triangle material quad — far inside
budget — while unbounded sizes would let the fit view and batch grow
silently until the canvas backing store hits browser limits.

**D6 — The size dialog is a small React modal owned by the project
browser flow.** "New world" opens it; accept calls `newWorldDoc(width,
depth)`, cancel does nothing. It follows the shell's modal conventions
(like `WorkspaceFileDialog`) but is a fixed two-field form, not a file
dialog. With place-in-world removed, this is the only `newWorldDoc`
caller.

**D7 — Place-in-world removal is a clean cut.** Delete
`placeInWorld()`/`uniqueLayerId()` (`store/world.ts`), `resultToLayer()`
(`store/bake.ts`) if it has no other callers, the `SpriteEditor` toolbar
button, and their specs. Brush loading (`loadBundleViews`,
`bakePrimitiveLayer`) is independent and stays; verify helper usage
before deleting shared-looking helpers.

## Risks / Trade-offs

- [Canvas backing store changes mid-session on resize] → the render loop
  already re-applies state via applied-keys; extend the key set with size
  and reuse the existing resize/viewport path; verify contact shadows,
  light icons, and picking after a live resize in the browser harness.
- [Stale per-size memo entries] → bounded by the distinct sizes used in a
  session (clamped 1–128 integers); no eviction needed.
- [Larger worlds slow per-frame CPU work that walks all placements] →
  cost scales with placement count, not ground area; unchanged by this
  change.
- [`/7` files are unreadable by older builds] → acceptable pre-release
  (no released API); `/1`–`/6` keep loading forever.
- [Users expect resize to be undoable] → documented trade-off: it sits
  with ground material/tile-scale edits on the not-undoable side of the
  history split; a future change can wrap it in a command pair without
  format impact.

## Migration Plan

No data migration: `/6` and older files load at the default 12 × 12, and
`/7` merely adds optional fields. Rollback is a plain revert — the only
format-visible artifact is the marker bump, and `/7` writers stop existing
with it. Docs to update on landing: `docs/runtime.md` (Worlds section —
marker, size field; remove the Place-in-world section; World editor —
per-size frame), `docs/roadmap.md`; check `docs/glossary.md` for
place-in-world references.

## Open Questions

None.
