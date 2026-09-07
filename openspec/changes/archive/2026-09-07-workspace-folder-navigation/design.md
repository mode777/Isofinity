## Context

`src/shared/workspace.ts` owns the File System Access layer: `WORKSPACE_FOLDERS`
is a flat `const` list, and `listWorkspaceFiles` / `writeWorkspaceFile` /
`readWorkspaceFile` operate on a single convention folder's direct children.
The project browser (`src/app/`) renders those listings flat, and save/load
flows use plain name inputs / native pickers. Motivation: see proposal.md.

Browser constraints that shape this design:

- `FileSystemDirectoryHandle` supports `getDirectoryHandle(name, { create })`
  and iteration over entries; there is no recursive listing or mkdir -p, so
  both must be built in `src/shared/workspace.ts`.
- Handles cannot be serialized into saved documents; the modal's navigation
  state is pure editor chrome (ADR 0006 — never serialized).

## Goals / Non-Goals

**Goals:**

- Recursive listing with relative paths, nested writes with on-demand folder
  creation — all inside the shared workspace layer so every consumer benefits.
- A tree-view project browser and a native-dialog-style save/load modal,
  built as React components over the shared layer.
- Zero change to file formats or fallback (no-workspace) flows.

**Non-Goals:**

- File/folder rename, move, delete in the UI (delete exists at file level but
  stays out of the modal).
- Browsing outside the convention folders.
- Caching or watching listings (keep the explicit refresh model).

## Decisions

### D1: Recursive listing as a new shared helper, not a rewrite of `listWorkspaceFiles`

Add `listWorkspaceTree(folder, opts)` (or a `recursive` option) that
depth-first walks `FileSystemDirectoryHandle` entries and returns flat
entries `{ path: 'props/crates/crate1.sprite', kind, handle }`, filtered by
accepted extensions. Keep the existing `listWorkspaceFiles` as the
depth-1 variant (or delegate to the recursive one with `depth: 1`) so
existing callers (HDRI picker, presets) keep working unchanged.

*Alternative considered*: eager per-folder lazy loading via
`resolve(nested)` handles on demand. Rejected: full recursive walks on
refresh are simpler, the volumes here are small, and the tree view needs the
complete shape anyway to render empty intermediate folders correctly.

### D2: Paths are slash-separated relative strings everywhere above the FS layer

All APIs above `workspace.ts` speak `"sprites/props/crates/crate1.sprite"`;
splitting into segments happens only at the write/read boundary (`mkdir -p`
via `getDirectoryHandle(seg, { create: true })` per segment). This keeps
components free of handle logic and makes the modal trivially testable.

*Alternative considered*: passing directory handles around. Rejected:
handles leak FS-API concerns into React state and cannot be compared or
persisted.

### D3: Modal is one reusable component parameterized by a "kind"

One `WorkspaceFileDialog` component with `mode: 'save' | 'load'` and an
asset kind (bundle, world, …) that determines: which convention folder is
rooted, accepted extensions, and the default name. Left pane = folder tree
(single convention folder as root, subfolders as nodes), right pane = files
in the current folder, breadcrumb for the current path, name field in save
mode. Mirrors native dialogs without emulating their chrome exactly.

*Alternative considered*: reusing the OS save-picker via
`showSaveFilePicker`. Rejected: it cannot browse the existing workspace
directory structure, which is the whole point.

### D4: Tree state (expansion, selection) is component-local, never serialized

Expansion/selection state lives in React state of the browser/modal only.
Per ADR 0006, editor chrome is never persisted into documents or bundles —
and can't be, since directory handles are unserializable.

### D5: Save flows route through the modal only when connected

When a workspace is connected, existing save buttons open the modal
pre-filled with the current suggested name and previous folder (kept in
memory per session, per kind). When not connected, existing download /
file-dialog behavior is untouched. This is also the spec's fallback
requirement.

## Risks / Trade-offs

- [Full recursive walk is slow on huge workspaces] → Accept for now; refresh
  is explicit. If needed later, cache the tree in memory per kind and
  invalidate on refresh only.
- [`getFileHandle` on stale handles after external rename] → Errors surface
  through the existing write/read failure reporting path (status area).
- [Modal duplication of browser-file-dialog behavior] → Single shared
  component (D3) instead of per-editor copies.
- [Directory iteration order] → Sort nodes (folders first, then files) at
  render time; do not rely on handle iteration order.

## Migration Plan

Additive only: new helpers, new components, modal routing in save/load
affordances. Old flat workspaces work with zero migration. Rollback =
revert commit; no data format touched.

## Open Questions

None.
