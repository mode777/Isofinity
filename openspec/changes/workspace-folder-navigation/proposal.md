## Why

The workspace convention folders (`models/`, `sprites/`, `worlds/`, …) are
currently flat lists in the project browser, and saving/loading works on a
single root-level name. As asset counts grow this becomes unusable — users
cannot organize sprites by set or worlds by campaign, and the editor gives
them no way to see that structure.

## What Changes

- Allow subfolders inside each convention folder (`models/`, `sprites/`,
  `worlds/`, `hdri/`, `materials/`, `presets/`); nested folders are created
  on demand when saving into a new path.
- Project browser renders each convention folder as a collapsible tree view
  (folders expand/collapse, files are leaves), preserving the existing type
  filtering and open/import behavior.
- Save and load flows get a custom modal dialog modeled on native file
  dialogs: folder tree on the left, file list on the right, current-path
  breadcrumb, name field on save, accept/cancel actions.
- Loading via the modal filters files by the same accepted types per folder
  as today's listings.
- Old flat layouts keep working: files at any depth (root included) are
  listed; no migration is performed.

## Capabilities

### New Capabilities

- `workspace-file-dialog`: The custom modal save/load dialog (folder view
  left, file view right, native-dialog-like navigation and naming).

### Modified Capabilities

- `workspace`: Listings must include nested subfolders recursively and
  saves must accept paths with subfolders, creating them on demand; the
  tree view and modal are editor surfaces but the recursive listing and
  nested-write rules are workspace-level behavior.
- `integrated-editor`: The project browser requirement changes from a flat
  listing to a tree view of each convention folder; save/load affordances
  route through the new modal when a workspace is connected.

## Impact

- `src/shared/workspace.ts` — recursive listing helpers, nested
  directory creation, path resolution for save/load targets.
- `src/app/` — project browser components (tree view), new save/load modal
  component, save flows in bundle/world document editors.
- No bundle-format or world-format impact: `isoinfinity-bake/6` and
  `isoinfinity-world/1` are untouched; folder depth is filesystem-only.
  No ADR needed — this is UI/workspace ergonomics, not a cross-cutting
  rendering invariant.
- Docs to update: `docs/runtime.md` (project browser + save/load flows),
  `docs/glossary.md` (new terms if any), `docs/roadmap.md` (done entry).

## Non-goals

- No renaming/moving/deleting of files or folders in the UI.
- No arbitrary filesystem browsing — navigation stays inside the
  convention folders.
- No change to fallback (no-workspace) file dialogs or downloads.
- No search/filter UI inside the modal.
