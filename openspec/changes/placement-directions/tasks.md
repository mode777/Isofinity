## 1. Runtime model: views and placements

- [x] 1.1 Add the layer-id helpers in `src/runtime/assets.ts`: `viewLayerId(asset, slot)` (plain id for `n`, `<asset>@<slot>` otherwise) and its `(layerId) → {asset, slot}` parser, with the collision note from design.md; export `VIEW_SLOTS`-ordered direction lists helper. Verify: `npm run build` typechecks.
- [x] 1.2 Add `loadBundleViews(buffer)` beside `loadBundleLayer`: decode N (render required, today's error behavior) plus each extra view with a render blob into `SpriteLayer`s tagged via `viewLayerId` (each view's own width/height/origin); return the layers and which slots were skipped for lacking a render pass. Verify: `npm run verify:bundles` still passes and a Node-side parse of a multi-view fixture returns 4 layers (add a small fixture check if the harness can host it; otherwise verify via `/scratch-verify.html` and record in 5.2).
- [x] 1.3 Add `dir: ViewSlot` to `Placement` in `src/runtime/world.ts` (default `'n'`), accepted by `World.place`; keep `depthOf` direction-independent. Verify: `npm run build`.

## 2. World document, store and persistence

- [x] 2.1 Add `brushDir: ViewSlot` (`'n'`) to `WorldDocument` in `src/app/document.ts` (in-memory editor state per ADR 0006 — never serialized to world files, never marks dirty); default it in `newWorldDoc`/`openWorldDoc`. Verify: `npm run build`.
- [x] 2.2 Store: `placeAt` resolves the brush layer as `viewLayerId(tool, brushDir)` (fall back to north when missing) and places with `dir = brushDir`; add `setBrushDir(docId, slot)` clamping to available directions; `World.place` call passes `dir`. Verify: `npm run build`.
- [x] 2.3 `selectBrush` and `openWorldDoc` switch to `loadBundleViews`: append every placeable view layer, report skipped render-less views in the status bar, keep primitive brushes north-only, and keep the tool = base asset id. Verify: `npm run build`; `npm run verify:bundles` (bundle parse paths untouched).
- [x] 2.4 Persistence: bump `WORLD_FORMAT` to `isoinfinity-world/3`; save each placement with optional `dir` (omit when `n`); parse `/1`/`/2`/`/3` with optional `dir` validated against `n/e/s/w` (anything else = malformed, named error, no document changes); place loaded placements with their parsed dir. Verify: `npm run build` plus a manual round trip in the browser (save a multi-direction world, reload, directions intact; open an old `/2` file, all placements face north).

## 3. World editor UI

- [x] 3.1 Renderer wiring in `WorldEditor.renderFrame`: resolve each placement's layer via `(primId, dir)` using the 1.1 helpers; ghost uses `viewLayerId(tool, brushDir)`. Verify: `npm run build`.
- [x] 3.2 Direction dropdown next to the brush select: lists the active brush's available directions (derived from loaded tagged layers) in N/E/S/W order, disabled for eraser/no-brush/primitives/single-view sprites; picking calls `setBrushDir`; status/hint text shows the current direction. Verify: `npm run build`; browser check in 5.2.
- [x] 3.3 `E`-key cycling: window `keydown` in the editor effect — advance `brushDir` N→E→S→W over available directions with wrap; ignore when ctrl/meta/alt held, when target is input/textarea/select/contentEditable, or when the brush is not a multi-view sprite; clean up on unmount. Verify: `npm run build`; browser check in 5.2.

## 4. Docs

- [x] 4.1 `docs/runtime.md`: world-editor input map (`E` cycles brush direction) and the placements-carry-direction note; `docs/glossary.md`: placement direction entry; `docs/bake-pipeline.md`: worlds no longer consume only the N view (format-history/world note); `docs/roadmap.md`: mark the change landed. No ADR (per proposal).
- [x] 4.2 Update the world-format mention in any spec-adjacent docs if the `/2` string appears outside `world.ts` (grep `isoinfinity-world/`). Verify: grep clean.

## 5. Verification

- [ ] 5.1 Run `npm run build` and `npm run verify:bundles`; fix findings.
- [ ] 5.2 Browser pass via `npm run dev`: pick a 4-view sprite — dropdown lists N/E/S/W, `E` cycles with wrap, ghost shows the selected view, placements render/occlude per direction, right-click erase still removes the topmost; save/reload the world (directions persist); reload an old `/2` world (all north); pick a `/5` sprite and a primitive (dropdown disabled, `E` no-op); type `E` in the height field (letter enters, direction unchanged). Update `/scratch-verify.html` only if bake behavior changed (it should not).
