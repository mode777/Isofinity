## 1. Store actions

- [x] 1.1 Add a `name` parameter to `saveSprite` in `src/app/store/bake.ts` (default derived as today when omitted); prompt/cancel handling stays in callers. Verify: `npm run build` passes.
- [x] 1.2 Add a `name` parameter to `saveWorld` in `src/app/store/world.ts` (default `suggestWorldName` / saved ref title as today); keep sanitization, `worlds/` target, dirty clearing. Verify: `npm run build` passes.
- [x] 1.3 Add `selectBrush(docId, brush: { kind: 'primitive' | 'sprite', id })` to `src/app/store/world.ts`: reuse an existing layer by id, else load the saved-sprite bundle via `readWorkspaceFile` + the bundle parser and `resultToLayer`, else bake a transient primitive bake document (default settings, raster + render pass) and convert; append the layer, mark dirty, set the tool; report progress/failure via `setStatus`; leave `tool` unchanged on failure; guard async work per document; dispose transient bakers. Verify: `npm run build` passes; trace the flow against `placeInWorld`/`openBundleDoc` handling.
- [x] 1.4 Change new-world default `tool` from `'eraser'` to `''` (pencil, no brush) in `src/app/store/world.ts` and update the `tool` comment in `src/app/document.ts` to describe brush ids + `''`. Verify: `npm run build` passes; new world tab shows pencil active with no brush.

## 2. Toolbar component and sprite toolbar

- [x] 2.1 Add an `EditorToolbar` presentational component (`src/app/components/`, flex row, children) and an `.editor-toolbar` style in `src/app/app.css` mirroring `.topbar` spacing. Verify: renders in both editors without layout regressions.
- [x] 2.2 Render the sprite toolbar at the top of `SpriteEditor.tsx`: Save button (prompts via `window.prompt`, prefilled with the document's title minus `.sprite`/result id; cancel aborts; calls `saveSprite(docId, name)`), and Place in world button calling `placeInWorld(docId)`; disable Save/Place when the document lacks baked passes per existing rules. Verify: saving a baked sprite writes to workspace `sprites/` when connected and downloads when not; cancel writes nothing and keeps the tab dirty.
- [x] 2.3 Remove the `.editor-actions` bottom row from `SpriteEditor.tsx`. Verify: `npm run build` passes; no orphaned CSS refs break the pass figures layout.

## 3. World toolbar, brush dropdown, and placement

- [x] 3.1 Render the world toolbar at the top of `WorldEditor.tsx`: Save button (prompt prefilled with saved title or `suggestWorldName`; disabled with tooltip when no workspace connected), pencil button (active unless `tool === 'eraser'`), brush dropdown grouped into Primitives (`PRIMITIVE_KINDS`) and Sprites (`useProject` sprites listing; group hidden/disabled when disconnected), and an eraser toggle. Selecting a brush calls `selectBrush`; pencil places via existing pointer handlers; eraser toggle and right-click erase keep working. Verify: `npm run build` passes.
- [x] 3.2 Show the active brush name next to the pencil; clicking the canvas with pencil but no brush places nothing and the hint line says to pick a brush. Verify: manual check in `npm run dev`.
- [x] 3.3 Remove the old `.tools` per-layer strip from `WorldEditor.tsx`. Verify: `npm run build` passes; hint text still reflects tool state.
- [x] 3.4 Wire placement of primitive/sprite brush layers: confirm `layersToSet` re-upload fires when `selectBrush` appends a layer and placements render with correct textures; fix the effect deps if needed. Verify: place a primitive brush and a saved-sprite brush in `npm run dev` and see them render.

## 4. Properties panel cleanup

- [x] 4.1 Remove the Export section (save + place-in-world buttons) from `SpriteProperties.tsx`; keep source info, bake settings, environment, and pass actions. Verify: `npm run build` passes; sprite tab panel shows no save/export buttons.
- [x] 4.2 Remove the World section (name input + save button) from `WorldProperties.tsx`; keep key light and sun-position controls. Verify: `npm run build` passes; world tab panel shows only light controls.

## 5. Verification

- [x] 5.1 Run `npm run build` (tsc + vite) clean. Verify: exit 0.
- [x] 5.2 Walk the spec scenarios manually in `npm run dev` (toolbar switching, both save prompts + cancel paths, brush reuse after place-in-world, primitive bake-on-demand, saved-sprite load, missing-bundle error, eraser/right-click, dirty indicators) and note anything that needs a follow-up. Browser checks are user-side per AGENTS.md; report results.
