# Tasks: World editor layer-visibility dropdown

## 1. State and store

- [x] 1.1 Add `layerVisibility: { ground: boolean; sprites: boolean; meshes: boolean }` to `WorldDocument` in `src/app/document.ts` with the established JSDoc contract ("in-memory editor state only — never written into world files"), and default it to all-visible in both `newWorldDoc` and `openWorldDoc` in `src/app/store/world.ts`; verify `npm run build` passes
- [x] 1.2 Add a `setLayerVisibility(docId, layer, visible)` store action in `src/app/store/world.ts` that only calls `update()` — no `markDirty`, no history push (same precedent as `setTool`/`setSurfaceSnap`); verify `npm run build` passes and confirm `buildWorldFile`/`WorldFileInput` are untouched so nothing serializes

## 2. Rendering gating

- [x] 2.1 In `src/runtime/renderer.ts`, extend `render()` with an optional trailing options argument `{ groundVisible?: boolean }` (default `true`) that gates only the ground stage (stage 1: both the material-tiles branch and the flat-batch branch), leaving the `groundKey` apply-cache in `WorldEditor` untouched; verify `npm run build` passes
- [x] 2.2 In `WorldEditor.renderFrame`, read `live.layerVisibility` and: skip `emit()` for sprite placements when the sprite layer is hidden; build no `meshDraws` and skip `emitShadow` for placed characters when the mesh layer is hidden (players keep advancing); skip per-layer contact shadows and the whole contact-shadow stage when the ground is hidden; pass `groundVisible` to `renderer.render()`; keep ghost previews and light icons/rings unaffected; verify `npm run build` passes
- [ ] 2.3 Browser check (user-run, `npm run dev`): toggling each of the three layers hides/shows it immediately — sprites/meshes take their baked grounding shadows with them, hiding the ground removes the contact shadows too, and re-showing restores everything unchanged; with all layers hidden the background stays clean

## 3. Picking and surface snap

- [x] 3.1 In `WorldEditor.pickAt`, filter `live.world.list()` and `live.world.listMeshes()` by `layerVisibility` before `pickPlacementAt` (lights never filtered) so Select and eraser skip hidden layers; verify `npm run build` passes
- [x] 3.2 In `WorldEditor.effectiveHeight`, apply the same filter so hidden placements supply no surface-snap heights; verify `npm run build` passes
- [x] 3.3 Suppress the selection-highlight outline in the overlay batch while the selected ref's layer is hidden, keeping the selection itself; verify `npm run build` passes
- [ ] 3.4 Browser check (user-run): with the sprite layer hidden, Select clicks pass through sprites and right-click erases nothing; with the mesh layer hidden the character is not selectable; surface snap over a hidden sprite falls back to the visible surface; a selection made before hiding survives with no highlight and regains it on show

## 4. Viewport UI

- [x] 4.1 Add `IconLayers` (stacked-layers glyph, `icon()` helper convention) to `src/app/components/icons.tsx`; verify it renders via `npm run dev`
- [x] 4.2 Add the `.layer-controls` panel to `WorldEditor.tsx` — an `icon-btn` with `IconLayers` + tooltip docked top-right inside `.world-viewport`, toggling a dropdown of three check rows (Ground, Sprites, Meshes) bound to `layerVisibility` and dispatching `setLayerVisibility`; close on outside click (document listener attached on open, removed on close/unmount), on re-clicking the button, and on Escape; verify canvas interaction outside the panel is unchanged
- [x] 4.3 Style `.layer-controls` and its dropdown in `src/app/app.css` after the shared corner-panel look (`.slot-switcher`/`.view-controls`/`.zoom-controls`: `top: 0.6rem; right: 0.6rem; z-index: 2`); verify visually that the world top-right corner matches the other corners and the sprite editor's top-right controls are unaffected
- [ ] 4.4 Browser check (user-run): dropdown opens/closes via button, outside click, and Escape; row toggles update the check states and the viewport in the same frame; the tab does not turn dirty; switching tabs and back preserves visibility; undo/redo never toggles it; a saved+reopened world starts all-visible

## 5. Docs and gates

- [x] 5.1 Update `docs/runtime.md` (world viewport chrome: the top-right layer control) and add a one-line "layer visibility" entry to `docs/glossary.md` if vocabulary warrants it; add the done-entry to `docs/roadmap.md`; no ADR (chrome reusing ADR 0006's state split)
- [x] 5.2 Run the gates: `npm run build` (typecheck + production build); note `npm run verify:bundles`/`verify:mesh`/`verify:history`/`verify:selection` are unaffected by these files but run `verify:selection` as a belt-and-braces check that picking behavior is untouched when all layers are visible
