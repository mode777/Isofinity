# Asset browser modal for the world editor pencil tool

## Why

Picking a placement brush today means scrolling a flat native `<select>` in the
world toolbar: sprite names are text-only (no thumbnail preview), subfolders of
the workspace `sprites/` folder are invisible (the list is flat), and there is
no way to search. With growing sprite libraries this does not scale; a visual,
searchable asset browser matching the established file-dialog chrome is the
standard fix.

## What Changes

- Add an **asset browser modal** to the world editor: opening it shows the
  workspace's `sprites/` folder as a file-browser tree (same look as the save
  dialog's file browser), with sprite entries showing their baked 128×128
  thumbnail when the bundle carries one, and a fallback icon when it does not.
- The browser also offers a **Built-ins** group (the test primitives and the
  character) so the pencil keeps placing everything it can today; built-ins
  show a generic icon, not a thumbnail.
- The browser has a **search field in its top-right corner** that filters
  assets by name across the main folder and all subfolders (and across the
  built-ins), matching case-insensitively on the asset id/path.
- Picking an asset in the browser acquires it as the placement brush exactly
  as the existing brush selection does (reuse the layer or load the bundle,
  activate the pencil) and closes the modal.
- The world toolbar's brush control area changes from a single dropdown to:
  a **label naming the current brush**, a **"…" picker button** next to it that
  opens the asset browser, and the **existing dropdown repurposed to list the
  previously used brushes** of the document (most recent first) for quick
  switching. When no brush has been used yet the dropdown is empty/disabled.
- Activating a previously-used brush reuses the stored brush identity and goes
  through the same acquisition path as a fresh pick.

## Capabilities

### New Capabilities

- `world-asset-browser`: the world editor's asset browser modal — file-browser
  layout with folder tree and sprite thumbnails, built-ins group, top-right
  search across folders, and pick-to-place brush acquisition.

### Modified Capabilities

- `integrated-editor`: the World editor toolbar requirement's brush-control
  area changes — the grouped brush dropdown is replaced by a current-brush
  label + "…" picker button plus a previously-used-brushes dropdown; the
  toolbar still hosts no tool selection and the contextual-controls visibility
  rules stay as pinned.

## Impact

- `src/app/components/WorldEditor.tsx` — brush-control area in the toolbar
  (`brushEntries` memo, the `<select>` block) and the modal mount point
  (same conditional-mount pattern as `saveDialog`).
- New `src/app/components/AssetBrowserDialog.tsx` — the modal, reusing
  `src/app/components/fileTree.tsx` (`buildDirTree`, `filesAt`, `DirTree`) and
  the `.modal-backdrop`/`.file-dialog*` styles in `src/app/app.css`.
- `src/app/store/world.ts` — per-document previously-used-brushes list
  (in-memory editor chrome, never serialized; ADR 0006) and no change to
  `selectBrush` semantics.
- Thumbnail reading: new manifest-parse path that surfaces the `/7`
  `thumbnail` PNG (`parseBakeManifest` + entry read + `createImageBitmap`);
  bundles without a thumbnail (pre-`/7`, render-less) show the fallback icon.
  **Format-version impact: none** — no bundle-format change, no new fields;
  `/4`–`/6` bundles keep loading and simply render without thumbnails.
- Docs: update `docs/runtime.md` (world editor toolbar + browser), the
  glossary entry for the browser if a new term sticks, and the roadmap done
  list. No ADR — this is editor chrome over existing invariants, not a new
  cross-cutting decision. `docs/bake-pipeline.md` is untouched (the format is
  unchanged; its format-history table already covers `/7`).

## Non-goals

- No drag-and-drop from the browser onto the canvas; picking is click-to-set.
- No model (`.glb`) browsing or mesh placement — mesh placements remain a
  separate follow-on; the browser lists sprites and built-ins only.
- No re-baking, re-thumbnailing, or batch regeneration of old bundles that
  lack a thumbnail.
- No persistence of the previously-used-brushes list into world files.
- No changes to the eraser, point-light, terrain-paint, or select tools.
