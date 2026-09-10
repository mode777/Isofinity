## 1. Selection identity and move primitives (runtime)

- [x] 1.1 Add a stable runtime-only `id` to sprite `Placement` in `src/runtime/world.ts`, allocated from the shared placement counter (rename `nextMeshId` to a shared `nextId`), and expose a `placementAt(id)`/`placementsById` lookup; confirm `npm run build` typechecks and no serialization path writes the id (world save still strips it).
- [x] 1.2 Add `World.updatePlacement(id, patch)` (x/z, re-keying the sort depth like `updateLight`) and verify it with a Node assertion in `src/runtime/selection-verify.ts` that the placement moves and the list re-sorts.
- [x] 1.3 Implement the CPU picker (`pickSpriteAt`/`pickPlacementAt`) in `src/runtime/` per design D2: sprite silhouette test sampling the in-memory g-buffers with the same padded-stride indexing and per-fragment depth as `surfaceSnap.ts`, plus screen-space proximity for meshes and lights; verify with cases in `src/runtime/selection-verify.ts` (transparent margin miss, overlap picks nearest, raised sprite hit above its footprint).
- [x] 1.4 Add a `verify:selection` npm script (`esbuild` bundle of `src/runtime/selection-verify.ts` + `node`, matching `verify:history`) and run it; verify it passes and `npm run build` succeeds.

## 2. Document state and store actions

- [x] 2.1 Replace `WorldDocument.selectedLightId` with a unified `selection: { kind: 'sprite' | 'mesh' | 'light'; id: number } | null` in `src/app/document.ts`, documenting it as in-memory editor state (ADR 0006) and initializing it in `newWorldDoc`/`openWorldDoc`; confirm `npm run build` typechecks.
- [x] 2.2 Update `src/app/store/world.ts`: `selectPlacement`, `clearSelection`, and placement-patch actions (position, height, shadow) that apply immediately and record undoable commands; route the point-light tool's click-to-select and `selectLight` through the unified selection.
- [x] 2.3 Add drag-move support in the store: a `movePlacement` that updates x/z live and a release path that pushes exactly one `move` history command (undo = start x/z, redo = final x/z) and marks the document dirty only when the position changed.
- [x] 2.4 Generalize stale-selection clearing: erase and `worldHistoryStep` (undo/redo) clear the selection when its target no longer exists; switching tools keeps the selection; verify with a Node/store-level check or manual reasoning recorded in the change.
- [x] 2.5 Ensure a newly created `selection` never reaches `WorldFile`/`saveWorld` output and that `isoinfinity-world/6` output is byte-identical in schema to before; verify `npm run verify:bundles` and inspect a saved world fixture.

## 3. World editor viewport and toolbar

- [x] 3.1 Add the Select tool button to `src/app/components/WorldEditor.tsx` toolbar and implement left-press pick/select, empty-click and Escape deselect, and left-drag move per design D3; verify by manual browser interaction.
- [x] 3.2 Draw the selection highlight in the overlay batch (footprint diamond/vertical connect for sprite/character; reuse the radius ring for a selected light) per design D5; verify visually in the browser and confirm it adds no serialized state.
- [x] 3.3 Remove the height field, shadow field, and direction dropdown from the toolbar (keeping Save, undo/redo, pencil, brush dropdown, eraser, light, select, and Snap) and confirm `npm run build` typechecks.
- [x] 3.4 Keep the shift+mouse-move height adjustment and the `E`-key direction cycle working against the document state now edited by the panel; verify in the browser.

## 4. Properties panel

- [x] 4.1 Add a **Brush** section to `src/app/components/WorldProperties.tsx` with placement height (precise numeric input), grounding-shadow strength, and the multi-view direction control (enabled only for multi-view sprites), wired to the existing document fields, per design D4.
- [x] 4.2 Add a selected-placement section: for a sprite/character show ground position (x/z), height, and (sprite only) shadow strength; for a light reuse the existing point-light editor; ensure edits are undoable and re-render immediately.
- [x] 4.3 Add any control needed for shadow strength (0–1) to `src/app/components/controls.tsx` if the existing rows do not fit, and confirm `npm run build` typechecks.

## 5. Documentation

- [x] 5.1 Add a short ADR in `docs/decisions/` (next number) recording CPU g-buffer silhouette picking for selection over a GPU id pass, with the reason (resident buffers, Node-verifiable, no readback), and add its row to `docs/decisions/README.md`.
- [x] 5.2 Update `docs/runtime.md`: the Select tool, selection/move behavior, the overlay highlight, and the Brush/selected-placement panel sections (height, shadow, direction moved out of the toolbar).
- [x] 5.3 Update `docs/glossary.md` (select tool, selection, pick) and `docs/roadmap.md` (feature landed), and add the `verify:selection` command to the `AGENTS.md` Commands list.
- [x] 5.4 Review `docs/recipes.md` for a touchpoint pattern this change exercises and update it if a checklist row is missing.

## 6. Verification

- [x] 6.1 Run `npm run verify:selection`, `npm run verify:bundles`, `npm run verify:mesh`, and `npm run verify:history` and confirm all pass.
- [x] 6.2 Run `npm run build` and confirm the production build succeeds (typecheck + Vite).
- [ ] 6.3 Leave the browser-only checks to the user: with `npm run dev`, confirm selecting sprites pixel-accurately (transparent margins miss), selecting/moving sprites, characters, and lights, one-undo-per-drag, and the Brush/selected-placement panel sections. No bake behavior changed, so `scratch-verify.html` hashes are expected to be unchanged.
