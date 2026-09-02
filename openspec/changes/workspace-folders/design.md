# Design: Workspace folders

## Context

Both tools are stateless single-page apps with per-action file exchange:
`src/bake/main.ts` loads glTF/HDRI via `<input type="file">` + drag-drop and
exports via `download()` (`src/bake/export.ts:8`); `src/runtime/main.ts:316`
loads bundle zips the same way. The bundle format (`isoinfinity-bake/4`,
zip bytes, parser in `src/bake/bundle.ts`) is extension-agnostic — the
`.zip` name exists only in the download filename and dialog `accept`
attributes. No File System Access, no IndexedDB anywhere yet. Motivation:
see proposal.md.

## Goals / Non-Goals

- One shared workspace module both pages use; identical convention and
  behavior in bake tool and runtime editor.
- Feel like a real application: connect once, everything persists,
  pickers browse the workspace, saves land in it.
- Non-goals: watching folders for external changes (no stable observer API
  — explicit refresh instead); browsing arbitrary subdirectories (flat
  convention folders only); any backend or sync; changing the bundle
  format's bytes.

## Decisions

### D1: File System Access API + IndexedDB-persisted directory handle

`showDirectoryPicker({ mode: 'readwrite' })` on an explicit button click;
the `FileSystemDirectoryHandle` is stored in a tiny hand-rolled IndexedDB
wrapper (~40 lines, db `isoinfinity-workspace`, store `handles`, key
`workspace`) in the new `src/shared/workspace.ts`. On page load the module
queries the stored handle, and the UI shows "Reconnect workspace…"; the
click calls `requestPermission({ mode: 'readwrite' })` (user gesture) and
restores the connection. No new npm dependency (idb-keyval rejected — one
key does not justify it). OPFS rejected: files are not user-visible on
disk, which defeats the whole point of a workspace folder.

Both pages persist their own handle under the same key; handles cannot be
shared across tabs, so each page reconnects independently — acceptable for
a two-page app and specced as a per-page affordance.

### D2: One module, typed per-folder helpers

`src/shared/workspace.ts` owns everything shared:

- `WorkspaceStatus`/connection state exposed to both UIs (disconnected →
  connected, with folder name; reconnectable when a stored handle exists).
- `ensureConventionFolders()` — `getDirectoryHandle(name, { create: true })`
  for `hdri`, `models`, `sprites`, `worlds` on every connect (idempotent).
- `listFiles(folder, exts)` — flat `entries()` iteration, extension
  filter, sorted by name.
- `readFile(folder, name): Promise<File>` via `getFile()`; handle-derived
  `File`s feed the existing loaders unchanged (`loadGltf(files: File[])`
  resolves externals by basename already, so a workspace `.gltf` load
  passes the whole `models/` listing as the candidate set — no new
  resolution logic).
- `writeFile(folder, name, bytes)` — `createWritable()` + close; the
  save controls call this.

Feature detection is a single `'showDirectoryPicker' in window` check the
UIs use to disable/hide workspace controls.

### D3: `.sprite` is a naming change only, driven by one shared constant

`BUNDLE_EXT = '.sprite'` lives in `src/shared/workspace.ts`. `buildBundle`
bytes are untouched; the three touch points are the download filename in
`src/bake/main.ts`, the runtime dialog `accept` (`.sprite,.zip`), and the
workspace save path. The runtime parser (`parseBake`) never looks at
extensions, so legacy `<id>-bake.zip` keeps loading for free. Rejected
alternatives: loose per-sprite folders (new directory parser, format
decision, and no cross-tool single-file drag-drop) and keeping `.zip`
(the macOS auto-extract problem this change exists to fix).

### D4: Pickers are additive `<select>` lists next to the existing buttons

When connected, each asset control (model, HDRI in the bake tool; sprite
loader and world loader in the runtime) gains a `<select>` populated from
the folder listing plus a small refresh button; change → load through the
exact code path the dialog uses. Existing `<input type="file">` buttons,
drag-drop, and the load flow stay as-is for no-workspace/unsupported cases.
A single workspace header control per page ("Open workspace…" → name +
disconnect; or "Reconnect workspace…") carries connection state; status
area reports saves/errors as everywhere else.

Rejected: replacing dialogs once connected — drag-drop and ad-hoc files
outside the convention remain useful, and the dialogs are the only path in
Firefox/Safari.

### D5: World files are self-describing JSON, `isoinfinity-world/1`

`{ format: 'isoinfinity-world/1', name, savedAt, sprites: [{asset, x, z}],
light: {azimuthDeg, elevationDeg, intensity, colorHex, ambientHex,
enabled}, sun: {hour, day, lat} }` written via `writeFile('worlds',
`${name}.json`, …)`. Loading clears the scene, restores light state through
the existing control-sync helpers, and skips placements whose asset id is
not in the current layer set, reporting the skipped ids — the same uniqueId
map the toolbar already maintains. Default name `world-<n>` (first free).
Format marker over bare JSON: world layout will evolve with the runtime;
same pattern that served the bake manifest well.

## Risks / Trade-offs

- [Chromium-only API; Firefox/Safari have no directory picker] → specced
  graceful degradation; dialogs/downloads remain the full workflow.
  Feature-detect, never UA-sniff.
- [Permission grants expire across restarts] → expected flow, not a bug:
  reconnect affordance + one `requestPermission` inside the click gesture.
- [Handle derived `File`s lack `webkitRelativePath`] → glTF externals
  resolve by basename, which already matches the drag-drop path.
- [.sprite files have no OS association — double-click does nothing] →
  intentional (no auto-extract); the tools are the consumers.
- [Two tabs reconnect independently] → acceptable for two pages; no
  BroadcastChannel coordination in this change.
- [IndexedDB eviction (rare)] → worst case is re-picking the folder once.

## Migration Plan

Purely additive, no persistent format changes: legacy zips keep loading,
downloads just change extension. Rollback = revert; workspace folders on
disk are ordinary files. Docs updates (`docs/bake-pipeline.md`,
`docs/runtime.md`) land with the change.

## Open Questions

None.
