# World editor zoom/pan + brush ghost preview

## Why

The world editor viewport is a fixed 1:1 picture of the 12×12 grid: it
cannot be zoomed or panned, so placing into a dense scene — or inspecting
the per-pixel occlusion boundaries that are the renderer's whole point —
is impractical on anything but a huge window. And once a brush is picked,
placement is blind: the only cursor feedback is a flat unit-cell square,
not the object that will land there.

## What Changes

- **Viewport zoom/pan** — the world editor canvas fills its panel and can
  be zoomed and panned, following the sprite editor's established
  conventions (`ViewTransform`, shared zoom bounds/step, corner `− / % / +`
  controls plus a fit action): mouse wheel zooms around the cursor,
  middle-mouse drag pans (left stays "paint", right stays "erase"),
  and the default view fits the whole grid to the panel.
- The canvas backing store becomes panel-sized (device-pixel-aware) and
  every batch (ground, sprites, overlays) draws through a 2D view
  transform of the fixed projected image. The fixed isometric camera and
  all CPU projection constants are untouched — this is viewport
  navigation, not a camera change.
- Pointer→ground picking inverts the same view transform, so placement
  and erase stay accurate at any zoom level.
- **Brush ghost preview** — with a brush (pencil) active and its layer
  loaded, the actual sprite renders at the exact position the next click
  would place it, occluded exactly like a real placement (depth stays
  on; transparency is optional styling), tracking the cursor live; the
  click/drag placement behavior is unchanged. The ghost replaces the
  unit-cell highlight while a brush is active; the eraser keeps the cell
  highlight.
- Zoom/pan and ghost are **in-memory per-document editor state** (per
  ADR 0006): they survive tab switches, are never serialized into world
  JSON, and are recreated at fit/defaults on reload.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the world editor viewport becomes a zoomable,
  pannable panel with corner zoom controls, and brush selection gains a
  live ghost preview under the cursor; world-document in-memory view
  state is specified.

## Impact

- `src/app/components/WorldEditor.tsx` — panel-sized canvas, view
  transform state, wheel/middle-drag input, ghost/highlight batch data,
  pointer mapping through the inverse transform.
- `src/runtime/renderer.ts` — a view-transform uniform applied by all
  three draw batches and canvas resize handling (world data stays in
  world-projected pixel space; only the transform moves).
- `src/app/document.ts` — optional in-memory `viewTransform` field on
  `WorldDocument`.
- `src/app/store/world.ts` — view-transform action (mirrors the bake
  store's `setViewTransform`); no placement/save changes.
- `src/app/app.css` — viewport layout and zoom-control overlay styles
  (reusing the sprite viewport's classes where possible).
- Docs: `docs/runtime.md` (world editor / input sections) and
  `docs/roadmap.md` need updating; `docs/glossary.md` only if new terms
  appear. No new ADR — the view transform follows the sprite editor's
  established convention and ADR 0006's state model.
- **Format impact: none.** `isoinfinity-world/1` JSON is unchanged;
  zoom/pan and ghost are editor chrome and are never persisted.
- **Non-goals:** no camera rotation or elevation change, no
  grid-snapping change (placement stays free-form cursor-centered), no
  placement selection/move/delete tools, no touch/pinch gestures, no
  changes to the bake pipeline, bundle format, or lighting.
