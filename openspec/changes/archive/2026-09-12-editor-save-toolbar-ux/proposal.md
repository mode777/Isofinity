## Why

Saving an already-saved world or sprite always re-opens the workspace file
dialog even though the target is known, which is friction on every save and
risks accidental renames. At the same time the bake editor's toolbar is the
only text-button toolbar left in the app (world, mesh debug use icon
buttons), and destructive/selective actions (deleting a selected sprite)
require switching tools to the eraser.

## What Changes

- Save-in-place: when a world or sprite document is already backed by a
  workspace file (it has a save/open ref) and a workspace is connected, the
  Save button writes to that file directly — no dialog. The dialog is
  reserved for Save As.
- New Save As icon button in the bake editor and world editor toolbars; it
  always opens the workspace save dialog (the pre-existing save affordance
  keeps its existing no-workspace fallbacks).
- Bake editor toolbar converts its text buttons (Save, Render pass, Bake
  all, Remove view, Place in world) into icon buttons with tooltips,
  matching the world editor toolbar style.
- World editor toolbar: the text "Snap" toggle becomes an icon button
  (magnet glyph), keeping the active-state highlight and tooltip.
- World editor properties: when a sprite placement is selected, a Delete
  button is added next to Deselect; it removes the placement through the
  same undoable erase path as the eraser tool and clears the selection.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `workspace-file-dialog`: saving an already-saved document no longer shows
  the modal — Save writes in place; a Save As affordance opens the modal.
- `integrated-editor`: editor toolbars use icon buttons with tooltips; the
  bake toolbar joins the world toolbar's icon style and gains a Save As
  affordance.
- `world-editor-selection`: a selected sprite can be deleted from its
  properties section, in addition to deselecting it.

## Impact

- `src/app/components/SpriteEditor.tsx` — toolbar icons, silent save,
  Save As button.
- `src/app/components/WorldEditor.tsx` — Save As button, snap icon,
  silent save.
- `src/app/components/WorldProperties.tsx` — Delete button in the sprite
  selection section.
- `src/app/store/world.ts` / `src/app/store/bake.ts` — save functions stay
  as-is (both already accept the in-place path); `eraseRef` reused for
  delete.
- `src/app/components/icons.tsx` — new glyphs (save-as, render, bake-all,
  remove-view, place-in-world, snap, delete).
- `src/app/app.css` — icon-button spacing shared with the existing
  `.icon-btn` style.
- Docs: `docs/runtime.md` (editor shell descriptions) and
  `docs/roadmap.md` get a line; no ADR — no durable architecture
  trade-off, this is editor chrome (ADR 0006 territory already covers
  in-memory editor state).
- Format version: none — bundle and world file formats are untouched; old
  files load and save unchanged.
- Non-goals: no Ctrl+S/Ctrl+Shift+S keyboard shortcuts, no autosave, no
  Save As changes to the disconnected fallback (prompt/download stay), no
  delete button for character (mesh) or light selections, no multi-select.

## Assumptions

- "Already exists" means the document has a workspace ref (`doc.ref`) from
  a prior save or from opening it via the project browser.
- Sprites save in place under their ref's file name (the ref title, not
  the internal bundle id — the two can differ for opened bundles).
- When no workspace is connected, behavior is unchanged (prompt +
  download); the silent-save path requires a connected workspace.
