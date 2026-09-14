# Tasks — Asset browser modal for the world editor pencil tool

## 1. Store groundwork

- [x] 1.1 Make `selectBrush` in `src/app/store/world.ts` report success (return a success flag/Promise), and on success push the picked brush to the front of a new per-document `recentBrushes: { id; fileName? }[]` (dedupe by id, no cap); initialize the field in `newWorldDoc` and keep it out of every serialization path (`worldFile.ts` untouched — in-memory chrome per ADR 0006). Verify: `npm run build` passes and a grep confirms `recentBrushes` appears in no `worldFile.ts`/save path.
- [x] 1.2 Update the existing dropdown call site in `WorldEditor.tsx` for the new `selectBrush` signature. Verify: `npm run build` passes and the current brush pick still works in `npm run dev`.

## 2. Asset browser dialog

- [x] 2.1 Create `src/app/components/AssetBrowserDialog.tsx` following the `WorkspaceFileDialog` pattern: conditional mount from `WorldEditor.tsx`, `.modal-backdrop` with backdrop-click/Escape/× close, head with title + close, left `DirTree` rooted at `sprites` from `useProject((s) => s.sprites)` via `buildDirTree`, breadcrumb + file area on the right, footer cancel; activating a folder shows its sprites. Verify: `npm run build` passes and the dialog opens/closes in `npm run dev` mirroring the save dialog layout.
- [x] 2.2 Add sprite thumbnails: lazy per-entry loader (`readWorkspaceFile` → `parseBakeManifest` → `thumbnail.file` → `readBakeEntry` → blob URL `<img>`), module-level `Map` cache keyed by relative path, generic fallback icon while loading/on failure/for built-ins (primitives, character). Verify: in `npm run dev`, a freshly re-baked `/7` sprite shows its baked image, a `/4`–`/6` or render-less bundle shows the fallback icon, and both stay listed and pickable.
- [x] 2.3 Add the top-right search field in the dialog header: trimmed/lowercased substring match over sprite ids, slash-relative paths, and built-in labels across the whole `sprites/` tree; results render flat with folder-context sub-labels regardless of the open folder; clearing restores the open-folder listing. Verify: in `npm run dev`, searching a term that only exists in a subfolder (and in a primitive name) lists exactly those entries and clearing restores the tree view.
- [x] 2.4 Wire picking: awaiting a successful `selectBrush` closes the dialog (pencil becomes active, toolbar label updates, document dirty); a failed pick reports via the status bar and leaves the dialog open; built-ins are pickable with no workspace connected and the sprites section explains the missing connection when disconnected. Verify: in `npm run dev` with a connected workspace (and once disconnected), pick a sprite, a primitive, and an unreadable bundle and observe the specced outcomes.

## 3. Toolbar brush controls

- [x] 3.1 Replace the brush `<select>` block in the world toolbar with the brush controls: a label naming the current brush (no-brush placeholder when `tool` is empty), a "…" picker button that opens the dialog, and the repurposed dropdown listing `recentBrushes`; keep the contextual-controls visibility rules (hidden for Select/eraser/point-light/terrain-paint/pan, state preserved). Verify: `npm run build` passes and in `npm run dev` the controls appear only in placement mode and the picker opens the browser.
- [x] 3.2 Render the previously-used dropdown from `recentBrushes` (most recent first), rebuild the brush record per entry (sprite: `{kind:'sprite', id, fileName}`; built-ins: `PRIMITIVE_KINDS`/character lookup) and activate through `selectBrush`; empty list renders an empty/disabled dropdown. Verify: in `npm run dev`, pick brush A then B, confirm the order B→A, re-activate A from the dropdown, and confirm a second world tab starts with an empty dropdown.

## 4. Styling

- [x] 4.1 Add `.asset-browser-*` styles beside the `.file-dialog*` rules in `src/app/app.css` (entry rows with thumbnail cells, header search placement, result context labels) using the existing CSS custom properties; keep the toolbar label/picker/recent controls visually consistent with the icon-button toolbar conventions. Verify: visual pass in `npm run dev` against the save dialog for chrome consistency (no new colors/spacing systems).

## 5. Docs and gates

- [ ] 5.1 Update `docs/runtime.md` (world toolbar brush controls + the asset browser), add an "asset browser" term to `docs/glossary.md`, and add the done row to `docs/roadmap.md`. Verify: the three docs mention the feature consistently with the delta specs' vocabulary.
- [ ] 5.2 Run the gates: `npm run build` (typecheck + production build) and `npm run verify:bundles` (regression sanity — the dialog consumes `parseBakeManifest`/`readBakeEntry` from `src/bake/bundle.ts` without modifying it); then walk the delta-spec scenarios once in `npm run dev` (open/close, thumbnails, search, picks, recent list, disconnect case). Verify: both commands exit 0 and every scenario above behaves as pinned.
