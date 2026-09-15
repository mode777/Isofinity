# Design — Asset browser modal for the world editor pencil tool

## Context

The world editor's brush control area is a single native `<select>` built
from a `brushEntries` memo (primitives + character + workspace sprites) in
`src/app/components/WorldEditor.tsx`; picking calls `selectBrush` in
`src/app/store/world.ts`, which reuses or acquires a sprite layer and sets
the document's `tool` (the tool id *is* the brush id). The save dialog
(`src/app/components/WorkspaceFileDialog.tsx`) already renders the
established file-browser chrome: `buildDirTree`/`filesAt`/`DirTree` from
`src/app/components/fileTree.tsx` over the project store's recursive
`sprites` listing (`useProject` → `listWorkspaceTree`), with
`.modal-backdrop`/`.file-dialog*` styles in `src/app/app.css`. Sprite
bundles saved as `/7` carry a 128×128 thumbnail PNG referenced by the
manifest `thumbnail` field (`src/bake/bundle.ts`), but nothing reads it
today; `parseBakeManifest` + `readBakeEntry` can extract it. See proposal.md
for motivation and the delta specs for the pinned behavior.

## Goals / Non-Goals

**Goals:**

- Brush picking that scales: folder tree + thumbnails + cross-folder search.
- Zero bundle-format or world-file format impact.
- Reuse: file-dialog chrome, project store listing, existing
  `selectBrush` acquisition semantics.

**Non-Goals:**

- Drag-and-drop placement from the browser; model/`.glb` browsing or mesh
  placement; regenerating thumbnails for old bundles; persisting the
  previously-used list; changes to non-placement tools (see proposal).

## Decisions

### 1. New `AssetBrowserDialog` component cloned from the file-dialog pattern

A `src/app/components/AssetBrowserDialog.tsx` mounted conditionally from
`WorldEditor.tsx` (`{assetBrowserOpen ? <AssetBrowserDialog … /> : null}`),
the same ownership pattern as `saveDialog`. It reuses `buildDirTree`,
`filesAt`, `dirPaths`, and `DirTree` from `fileTree.tsx` rooted at
`sprites`, the `.modal-backdrop` click-outside/Escape convention, and adds
only new `.asset-browser-*` CSS beside the `.file-dialog*` rules in
`app.css` (importing the classes where they differ: an entry grid with
thumbnail cells, a top-right search field in the header row).

*Alternative rejected:* a pure icon-grid "asset board" without the folder
tree — the user explicitly asked for the save-dialog file-browser look, and
the tree communicates where sprites live.
*Alternative rejected:* a global modal manager/portal — every existing
dialog is conditionally mounted by its parent; consistency wins.

### 2. Listing data comes from the project store, not new workspace APIs

`sprites: useProject((s) => s.sprites)` already holds the recursive
`sprites/` listing as slash-relative paths; `buildDirTree(paths, 'sprites')`
produces the tree. The dialog refreshes nothing itself — it shows whatever
the project browser shows.

*Alternative rejected:* adding a `listWorkspaceDirs` helper to
`src/shared/workspace.ts` — redundant; the recursive file list already
implies the folder tree, and the save dialog proves the approach.

### 3. Thumbnails: lazy, per-entry, manifest-only, cached

When the file area renders a sprite entry, the dialog kicks off an async
load: `readWorkspaceFile('sprites', relPath)` → `parseBakeManifest` (zip
directory walk only — no pass decompression) → `manifest.thumbnail?.file` →
`readBakeEntry(buffer, file)` → wrap the PNG bytes in a `Blob` →
`URL.createObjectURL` → `<img>` in the entry cell. While loading or on any
failure (missing thumbnail in `/4`–`/6` bundles, unreadable file) the entry
shows the generic fallback icon; nothing blocks listing or picking. Decoded
URLs are cached in a module-level `Map<relPath, string>` (shared across
openings, session lifetime) so re-opening the browser or paging through
folders does not re-read bundles. Object URLs are revoked if the cache entry
is ever replaced; no eviction policy for now.

*Alternative rejected:* eager parallel read of every bundle on dialog open —
bundles are megabyte-scale; a large `sprites/` tree would make opening slow
for data most entries never display.
*Alternative rejected:* extracting thumbnails to a sidecar cache folder — a
workspace-convention/format change for zero spec benefit.
*Alternative rejected:* `createImageBitmap` + canvas draw — extra decode
bookkeeping for no gain over handing the PNG blob to an `<img>`.

Built-in entries (primitives, character) render a generic inline-SVG icon;
they have no bundle and never a thumbnail.

### 4. Search is a client-side filter over the in-memory listing

The dialog holds a `query` state bound to the header's top-right input.
Non-empty query (trimmed, lowercased) switches the file area from
`filesAt(tree, cur)` to a flat results list computed over all sprite paths
plus built-in labels: match if the query is a substring of the sprite id,
the slash-relative path, or the built-in's label. Each result row shows the
asset name plus its folder context (`props/crates/`) as a secondary label.
Clearing the query restores the open-folder listing. No debounce needed —
the source is an in-memory array.

*Alternative rejected:* re-walking the workspace per keystroke — duplicates
the project store's work and adds FS latency for no behavior difference.

### 5. Recent brushes live on the world document as in-memory chrome

`WorldDocument` gains `recentBrushes: { id: string; fileName?: string }[]`
(`fileName` captured for sprite brushes so re-acquisition works even if the
id alone is ambiguous; built-ins carry only the id). `selectBrush` pushes
the picked brush to the front (dedup by id, unbounded — matching the spec's
"has already used" literally; session scale makes a cap unnecessary) after a
**successful** acquisition. The list is per-document editor state per ADR
0006: **never serialized** — `worldFile.ts` and the `isoinfinity-world/8`
schema are untouched, and a reopened world starts empty. The toolbar
dropdown renders from `recentBrushes`; activating an entry rebuilds the
brush record (`{kind:'sprite', id, fileName}` for sprites; a
`PRIMITIVE_KINDS`/character lookup otherwise) and calls the same
`selectBrush` path, so a deleted/renamed sprite file fails exactly like a
fresh pick (status bar names it, state unchanged).

*Alternative rejected:* filtering stale sprite entries against the current
workspace listing — hides reality, and the uniform failure path is already
specced behavior.
*Alternative rejected:* a module-level or zustand-global list — the spec
pins per-document behavior; documents already carry sibling in-memory
chrome (`tool`, `brushDir`, snap toggle).

### 6. Picking closes the dialog; failure keeps it open

`selectBrush` returns a success indicator (small signature change; it
already awaits loads internally). The dialog's pick handler awaits it:
success → close dialog (the store already activated the pencil via
`d.tool = brush.id`); failure → dialog stays open so the user can pick a
different asset. The toolbar label is derived from `doc.tool` the same way
the current `selectedEntry` lookup works, with a no-brush placeholder when
`tool` is `''` or unknown.

### 7. The pencil tool button is unchanged

Per the agreed interaction, the pencil button keeps restoring
`lastBrush.current`; the browser opens only from the "…" picker button. The
existing "pick a brush above" hint stays accurate (it now points at the
label + picker).

## Risks / Trade-offs

- [Large sprite folders read many bundles for thumbnails] → loads are lazy
  per rendered entry, manifest-only parses, and cached by path; worst case
  is background bandwidth, never a blocked UI thread (loads are async,
  entries render immediately with the fallback icon).
- [Corrupt or non-`/7` bundles] → every thumbnail failure mode resolves to
  the fallback icon; spec pins that thumbnails are never required for
  listing, search, or placement.
- [Object-URL lifecycle] → URLs created once per path and cached; revoke on
  replacement; dialog unmount does not revoke (cache is session-scoped by
  design, so reopening stays instant).
- [`selectBrush` signature change ripples] → single call site today (the
  old dropdown's `onChange`) plus the new dialog and dropdown callers;
  mechanical update.
- [Dialog input steals world-editor shortcuts] → the search input follows
  the file dialog's `stopPropagation` pattern (`typingTarget` guard), so
  `E`-cycling and other canvas keys do not fire while typing.

## Migration Plan

Additive UI + one new in-memory document field; no data migration, no
format change (`isoinfinity-world/8` and `isoinfinity-bake/7` untouched, so
`docs/bake-pipeline.md`'s history table stands). Rollback = revert the
commit; worlds saved before/after are interchangeable. Docs to touch with
the landing: `docs/runtime.md` (world toolbar brush controls + browser),
`docs/glossary.md` (asset browser term), `docs/roadmap.md` (done row). No
ADR — editor chrome over existing invariants, nothing cross-cutting to pin.

## Open Questions

None blocking. The only deliberately deferred detail is the fallback icon's
exact glyph (generic sprite icon vs. per-kind icons) — pure CSS/SVG polish
that cannot change the specced behavior.
