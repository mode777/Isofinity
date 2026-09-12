## Context

Both editors already keep a workspace backing reference on the document
(`doc.ref: { key, title }`), set by `saveWorld`/`saveSprite` after a
successful save and by opening a file through the project browser. Both save
functions accept an explicit name/path and already fall back sensibly
(`saveWorld` falls back to the ref title; `saveSprite` falls back to the
internal bundle id, which can differ from the ref title). The world toolbar
already uses `.icon-btn` buttons with `title` tooltips and the shared SVG
glyph factory in `icons.tsx`; the bake toolbar still uses text buttons. The
world store already exposes `eraseRef(docId, ref)` — the eraser's undoable
remove — which clears a stale selection as a side effect.

## Goals / Non-Goals

**Goals:**

- Save-in-place and Save As share one code path per editor; the dialog is
  just the naming step of Save As.
- One icon set, one tooltip convention across both toolbars.
- Delete = the eraser's exact code path (history, dirty flag, selection
  cleanup), not a second removal implementation.

**Non-Goals:**

- Keyboard shortcuts (Ctrl+S/Ctrl+Shift+S), autosave, dirty-state changes.
- Delete buttons for character (mesh) or light selections (lights already
  have a per-row × in the list).
- Changes to the disconnected fallbacks (prompt + download stay as-is).
- File-format or serialization changes of any kind.

## Decisions

- **Save-in-place is a UI-layer decision, not a store change.**
  `SpriteEditor.onSave` / `WorldEditor.onSaveWorld` check
  `connected && doc.ref` and call the existing save function with the
  backing name; otherwise they keep today's behavior. The stores stay
  dumb about when the dialog shows. Alternative considered: teach the
  stores to skip naming — rejected, it mixes editor-chrome state (ADR
  0006) into stores.
- **Sprite silent save passes `doc.ref.title` explicitly.** The
  `saveSprite` no-name fallback is the internal bundle id
  (`doc.result.id`), which may differ from the file the user opened or
  last saved as; always passing the ref title keeps save-in-place
  idempotent. World save needs no argument (its fallback already prefers
  the ref title).
- **Save As = the current save button's behavior.** The dialog branch
  moves wholesale to the new Save As handler; its button's disabled state
  mirrors Save's (`!doc.result` for sprites, `!connected` for worlds), so
  Save As is never the only way to reach the fallback paths.
- **Icons: extend `icons.tsx`, no icon library.** New 16×16 stroke glyphs
  following the existing `icon()` factory: save-as (floppy + pencil),
  render (play triangle), bake-all (stacked layers), remove-view
  (square with ×), place-in-world (globe + arrow), snap (magnet), delete
  (trash). Text glyphs stay where they are already compact and
  conventional (zoom −/+, slot N/E/S/W letters).
- **Snap button becomes `.icon-btn`** with a magnet glyph, keeping the
  `active` class toggle and the existing long tooltip verbatim. It stays
  inside the `placementMode` conditional.
- **Delete calls `eraseRef(doc.docId, { kind: 'sprite', id:
  selectedSprite.id })`.** It records the undoable command, drops the
  selection, and marks dirty exactly like the eraser. Button styled like
  the existing Deselect row buttons.

## Risks / Trade-offs

- [Silent save overwrites a file the user moved/renamed outside the app]
  → The write targets the ref name resolved through the workspace; a
  missing target folder surfaces through the existing save-failure status
  path, same as a dialog save to a vanished folder.
- [Icon-only buttons hide meaning without hover] → Every icon keeps a
  `title` tooltip; glyphs are conventional shapes; the status bar still
  narrates tool state.
- [Ref set after a disconnected download changes later silent-save
  behavior] → Silent save additionally requires a connected workspace, so
  a stale post-download ref can never route into `writeWorkspaceFile`
  unexpectedly; disconnected saves keep prompting/downloading.

## Migration Plan

Pure editor-chrome change, no data migration; revert = single commit
rollback. No bundle/world format impact.

## Open Questions

None.
