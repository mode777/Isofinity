# Editor UI refactor

## Why

The sprite workflow accumulates redundant controls: the project browser dedicates
a section to built-in test primitives, the preset dropdown carries an explicit
Apply button even though picking a preset is always followed by applying it, a
dedicated "Re-bake raster" button exists only as a prelude to re-rendering, and
the render pass action is buried at the bottom of the properties panel's
Environment section. Consolidating these removes dead click paths and makes the
single render action the hub of sprite baking.

## What Changes

- **Project browser**: remove the built-in primitives section from the left bar.
  New sprite documents start from workspace models, imported glTF files, or
  sprite bundles; primitives remain available as world-editor brushes (the
  world toolbar brush dropdown keeps its Primitives group).
- **Presets**: selecting a preset from the dropdown applies it immediately; the
  Apply button is removed. A failed apply (missing HDRI, unknown format) keeps
  the document unchanged and reverts the dropdown selection.
- **Presets**: the preset management section (save / list / delete / import)
  moves to the top of the sprite properties panel, before the rendering
  settings (source, path tracing, environment).
- **Baking**: remove the dedicated "Re-bake raster" button. The render pass
  action implicitly (re)bakes the raster g-buffer pass (normals + depth) from
  the document's current source and settings first, so the g-buffer is always
  current and pixel-aligned with the render pass. Opening a resource keeps its
  initial auto-bake.
- **Render action**: the path-trace render pass button moves from the
  properties panel to the sprite editor toolbar (next to Save / Place in
  world), with the same busy/view-only disabling and status-bar progress.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `integrated-editor`: the project browser no longer lists built-in primitives;
  the sprite properties panel drops its pass actions and gains the top-most
  preset section; the sprite editor toolbar gains the render pass action; the
  "only explicit bake actions" requirement shrinks to the single render action
  with its implicit g-buffer bake.
- `bake-presets`: picking a preset applies it immediately without a separate
  apply action, and preset management is positioned at the top of the sprite
  properties panel.

## Impact

- `src/app/components/ProjectBrowser.tsx` — primitives section removed;
  `openPrimitiveDoc` loses its only caller and is deleted.
- `src/app/components/SpriteProperties.tsx` — `PresetsSection` rendered first;
  Apply button, "Re-bake raster" button, and render-pass button removed.
- `src/app/components/SpriteEditor.tsx` — toolbar gains the render pass action.
- `src/app/store/bake.ts` — `runRenderPass` performs the raster bake first;
  `openPrimitiveDoc` removed; `bakeRaster` becomes an internal step (still used
  by document-open paths and the world brush layer bake).
- `src/app/document.ts` — `PRIMITIVE_KINDS` stays (world-editor brush dropdown
  still uses it); the project-browser import disappears.
- Docs: `docs/runtime.md` (project browser, sprite editing sections) and
  `docs/bake-pipeline.md` (presets, explicit-buttons-only rendering) need
  updating.
- No bundle-format or preset-format changes; existing `.sprite` bundles and
  preset JSON files remain fully compatible.
