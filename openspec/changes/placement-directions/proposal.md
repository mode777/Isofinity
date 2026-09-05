## Why

Worlds today render every placement from the sprite bundle's north view
only, even though `isoinfinity-bake/6` bundles can carry all four view
slots (N/E/S/W — ADR 0005). An asset baked from several directions
always faces the same way in the world, so the multi-view bake work
stops short of the world editor: the user cannot choose which way the
current brush faces.

## What Changes

- Sprite brush acquisition loads every placeable view of a bundle: the
  north view as today plus each extra view (E/S/W) that carries a render
  pass — both for brush selection and on world open. Views without a
  render pass are not placeable and are skipped with a status note (same
  rule as a render-less bundle today). Place-in-world stays as-is: it
  hands off the sprite editor's active slot as one north-facing layer.
- Placements gain a direction (`n`/`e`/`s`/`w`, default `n`); the world
  renders each placement from its direction's view (per-pixel occlusion
  and dynamic lighting unchanged — each view layer already carries its
  own g-buffer with baked world normals/depth).
- The world editor toolbar gains a direction dropdown next to the brush
  select. It lists the current brush's available directions, is enabled
  only for multi-view sprite brushes, and picking a direction switches
  the brush (and the ghost preview) to that view.
- Pressing `E` in the world editor cycles the brush through its
  available directions (N → E → S → W → N, wrapping, skipping
  unavailable views). It is ignored while a text field or other form
  control has focus and when the brush has no extra views.
- World files: format `isoinfinity-world/3`, each sprite entry carries
  an optional `dir` (defaults to `n`); the parser continues to accept
  `/1` and `/2` files (directions default to `n`).

### Assumptions

- Direction is a brush-level choice: it applies to placements made from
  now on. Existing placements keep their direction; there is no
  rotate-placed-sprite tool (future work if wanted).
- Placing over an occupied cell keeps today's stacking behavior — the
  editor does not auto-replace; erase (right-click) still removes the
  topmost placement regardless of direction.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `world-persistence`: placements carry a direction; format bumps to
  `isoinfinity-world/3` with optional per-sprite `dir`; legacy `/1`+`/2`
  files still load (directions default `n`); round trips preserve
  directions.
- `integrated-editor`: the world editor toolbar offers a brush-direction
  dropdown (enabled only for multi-view sprite brushes) and the `E` key
  cycles the brush through its available directions.
- `runtime-sprite-rendering`: bundles load every placeable view as
  brushable layers; placements render, occlude and light from the view
  matching their direction.

## Impact

- `src/runtime/assets.ts` — a loader that returns all placeable views of
  a bundle as sprite layers (each view has its own size/origin), plus a
  direction-tagged layer-id convention for the editor.
- `src/runtime/world.ts` — `Placement` gains `dir`; `World.place`
  accepts it.
- `src/app/document.ts`, `src/app/store/world.ts` — world document
  brush/direction state, multi-view load in `openWorldDoc` and
  `selectBrush`, save/load with `dir` (`isoinfinity-world/3`), place
  path carries the direction.
- `src/app/components/WorldEditor.tsx` — direction dropdown, `E`-key
  handler (canvas-level, form-control safe), ghost preview uses the
  selected direction.
- `src/runtime/renderer.ts` — no changes expected (instances reference
  layer indices; per-view layers fit the existing sprite set).
- Docs: `docs/runtime.md` (world editor input map), `docs/bake-pipeline.md`
  (worlds no longer N-only), `docs/glossary.md` (placement direction),
  `docs/roadmap.md`. No ADR — this applies ADR 0005's views at the
  editor level without settling a new cross-cutting trade-off.
- Format impact: world format `/3` (new optional `dir` per sprite);
  old world files load unchanged. Sprite bundles unchanged (`/6`
  already stores the views); bundles missing a view's render pass
  simply expose fewer placeable directions.
