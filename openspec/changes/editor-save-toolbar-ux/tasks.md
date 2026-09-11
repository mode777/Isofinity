## 1. Icons

- [x] 1.1 Add the new glyphs to `src/app/components/icons.tsx` using the existing `icon()` factory — save-as, render, bake-all, remove-view, place-in-world, snap (magnet), delete (trash) — and verify they render in place of the current text buttons after the later tasks (visual check via `npm run dev`).

## 2. Save in place + Save As

- [x] 2.1 `SpriteEditor.tsx`: split `onSave` into plain save (`connected && doc.ref` → `saveSprite(doc.docId, doc.ref.title)`, no dialog; otherwise existing prompt/download fallback) and Save As (opens `WorkspaceFileDialog` exactly as Save does today); both buttons disabled without `doc.result`. Verify: re-saving an opened sprite overwrites it with no dialog; Save As opens the dialog; disconnected save still prompts/downloads (`npm run build` + manual dev check).
- [x] 2.2 `WorldEditor.tsx`: same split for `onSaveWorld` (plain save → `saveWorld(doc.docId)` when `connected && doc.ref`; Save As opens the dialog; disconnected keeps the prompt). Verify: saved world re-saves in place silently; Save As opens the dialog (`npm run build` + manual dev check).

## 3. Toolbar icon conversion

- [x] 3.1 `SpriteEditor.tsx`: convert the five toolbar buttons (save, save as from 2.1, render pass, bake all, remove view, place in world) to `.icon-btn` icon buttons with `title` tooltips, keeping all existing disabled conditions and actions. Verify: toolbar shows icons with tooltips; disabled states unchanged (e.g. no result → save/save-as disabled; view-only/busy → render/bake/remove disabled) via `npm run dev`.
- [x] 3.2 `WorldEditor.tsx`: add the Save As icon button next to Save (same disabled state as Save), and convert the Snap toggle to an `.icon-btn` with the magnet glyph, keeping the `active` class and existing tooltip. Verify: both editors' toolbars are icon-consistent; snap highlight toggles correctly via `npm run dev`.

## 4. Sprite delete button

- [x] 4.1 `WorldProperties.tsx`: in the selected-sprite section, add a Delete button next to Deselect that calls `eraseRef(doc.docId, { kind: 'sprite', id: selectedSprite.id })`; import `eraseRef` from `../store/world.js`. Verify: deleting removes the placement and clears the selection; Ctrl+Z restores it; Deselect still keeps the placement (`npm run dev`).

## 5. Verification + docs

- [x] 5.1 Run `npm run build` (typecheck + production build) and `npm run verify:bundles` / `npm run verify:selection` — all must pass.
- [x] 5.2 Update `docs/runtime.md` (toolbar descriptions: icon buttons, Save As, sprite delete) and `docs/roadmap.md` (done item); confirm no format/ADR impact per the proposal.
