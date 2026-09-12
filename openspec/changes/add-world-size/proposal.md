## Why

The world's ground plane is hard-wired to a 12×12 grid (`GRID_N` in
`WorldEditor.tsx`); every map is the same size and there is no way to make a
larger or smaller scene. Worlds should be created at a chosen size and stay
resizable as the map grows, and the one implicit creation path ("Place in
world" from a sprite tab) should go away so worlds are always created
deliberately, with their size chosen up front.

## What Changes

- **New-world size dialog**: the project browser's "New world" button opens
  a small dialog with width × depth in world units (defaults 12 × 12) before
  the world document is created; the ground plane is created at that size.
- **Ground size is world state**: the ground plane's width/depth become
  per-document world state (no longer editor-component constants), used for
  the checkerboard batch, the ground-material quad, the fit view, and the
  fixed world-image frame.
- **Resize in the properties panel**: the world panel's Ground section gains
  width/depth fields that resize the existing ground plane in place.
  Resizing keeps the ground's (0, 0) origin corner fixed (it grows/shrinks
  toward +x/+z). Shrinking never deletes anything: placements outside the
  new bounds stay in the scene and can be moved back.
- **BREAKING — remove "Place in world"**: the sprite editor toolbar button
  and the in-memory sprite→world handoff are removed. Worlds are created
  only via "New world" (with the size dialog) or by opening a world file;
  world brushes load from workspace `sprites/` bundles and built-in
  primitives exactly as before.
- **Format**: world files bump to `isoinfinity-world/7`, recording the
  ground size as an optional field (omitted at the default 12 × 12).
  Loaders accept `/1`–`/7`; older files restore at the default size.
  Sprite bundle format is untouched.

Out of scope (non-goals): terrain/heightfields or non-rectangular ground;
moving or re-centering the ground origin; drag-handle resizing in the
viewport; making resize undoable (ground-state edits — material, tile
scale — are not on the undo stack either); per-cell placement validation
against the ground bounds.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: world creation gains the size dialog; the properties
  panel gains ground resize; the place-in-world placement/toolbar
  requirements are removed.
- `world-persistence`: world files carry the ground size (optional, `/7`);
  loading restores it and tolerates all older formats.

## Impact

- `src/app/components/WorldEditor.tsx` — `GRID_N` and the module-level
  world-image frame constants (`CANVAS_W/H`, `minU/maxU`, `ORIGIN_X/Y`,
  `GROUND`) become per-document, size-derived values.
- `src/app/document.ts` — ground state gains size fields (persisted layer,
  not editor chrome — ADR 0006).
- `src/app/store/world.ts` — `newWorldDoc` takes a size; new
  `setGroundSize` action; `serializeWorld`/parser bump to `/7`;
  `placeInWorld`/`uniqueLayerId` removed.
- `src/app/store/bake.ts` — `resultToLayer` removed with the handoff.
- `src/app/components/ProjectBrowser.tsx` — "New world" opens the dialog.
- `src/app/components/SpriteEditor.tsx` — Place-in-world button removed.
- `src/app/components/WorldProperties.tsx` — Ground section gains width/
  depth fields.
- `src/runtime/renderer.ts` — no shader changes; ground extent/material
  calls are already parameterized, only their inputs become per-document.
- Docs: `docs/runtime.md` (Worlds, Place-in-world sections), `docs/
  roadmap.md`; glossary if terms shift. No new ADR — this follows the
  existing persisted-vs-chrome state split (ADR 0006) and the additive
  format-evolution pattern.
