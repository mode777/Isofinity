## Why

World editing is destructive: a misplaced placement, an erase stroke, or a
deleted light cannot be taken back except by reloading the last saved file
(losing unsaved work) or manually re-placing everything. Any real editing
session needs undo/redo before the world editor is usable for serious work.

## What Changes

- Add an undo/redo history to world documents, covering the mutating world
  operations: place sprite, erase (remove-top), place mesh, place light,
  update light, delete light, and light-property edits made through the
  properties panel.
- Add undo/redo toolbar buttons (world toolbar, disabled at history ends)
  and keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z, Ctrl+Y tolerated).
- History is per world document and survives tab switches (documents live
  in memory; ADR 0006) but is not serialized into world files.
- Undone/redone edits mark the document dirty so save state stays honest.
- Viewport state (zoom/pan), brush state (level, shadow strength), and
  document chrome are NOT undoable (editor-only state, per ADR 0006).
- No world file format change: history is runtime-only, so
  `isoinfinity-world/6` is untouched and old files load unchanged.

## Capabilities

### New Capabilities

- `world-edit-history`: per-document undo/redo of world editing operations
  (sprites, meshes, point lights), with toolbar affordances and keyboard
  shortcuts; history is in-memory per document and never persisted.

### Modified Capabilities

<!-- none: existing specs do not pin undo behavior; the integrated-editor
     shell and world-persistence requirements are unchanged -->

## Impact

- `src/runtime/world.ts` — the mutation entry points gain inverse operations
  (capture/restore) or the history layer records command pairs around them.
- `src/app/store/world.ts` — document state gains a history instance; the
  placement/erase/light mutation actions record commands; a `dirty` flag is
  set on undo/redo.
- `src/app/` components — world toolbar buttons, key handling.
- `docs/runtime.md` (document model section) and `docs/roadmap.md` need
  updates; `docs/glossary.md` gains the command/undo-stack terms.
- No ADR required: this does not settle a cross-cutting rendering or format
  trade-off; it follows ADR 0006's persisted/in-memory split.
- Format-version impact: none (runtime-only state; no new fields, no
  tolerance changes).

## Non-goals

- No undo for sprite/bake documents (bakes are expensive, deterministic
  re-runs; out of scope).
- No history persistence across app reloads or in world files.
- No undo grouping/coalescing beyond per-action granularity (drag-streamed
  placement strokes coalesce into one command per stroke is acceptable but
  not required).
- No redo-history invalidation UI beyond the disabled redo button.
