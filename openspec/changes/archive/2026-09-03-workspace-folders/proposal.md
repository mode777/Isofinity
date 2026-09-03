# Proposal: Workspace folders

## Why

Every asset exchange with the bake tool and runtime editor currently goes
through per-file `<input type="file">` pickers and browser downloads: bake a
sprite, download `<id>-bake.zip` (which macOS auto-extracts), re-upload the
zip to the runtime, re-pick the same HDRI every session. There is no
persistent place where assets live. A browser-bound workspace folder with a
fixed directory convention turns the two tools into a real application:
assets are opened, saved, and reused in place, and the `.sprite` extension
keeps bundles from being auto-extracted.

## What Changes

- Both tools (bake tool, runtime editor) gain a **workspace folder
  connection**: the user opens a local folder once (File System Access API,
  `showDirectoryPicker`); the connection persists across sessions via an
  IndexedDB-stored directory handle and is restored with a single permission
  click ("Reconnect").
- **Folder convention** created/enforced on connect: `hdri/`, `models/`,
  `sprites/`, `worlds/`.
- Asset pickers become **workspace browsers**: dropdowns listing the folder
  contents (with a refresh action) — models from `models/` (multi-file
  `.gltf` externals resolve against that folder), HDRIs from `hdri/`, sprite
  bundles from `sprites/`. Existing file dialogs and drag-drop remain as
  fallback (no workspace connected, or browser without File System Access
  support).
- **Saves go to the workspace**: the bake tool writes its bundle to
  `sprites/<id>.sprite` instead of a download when connected. Bundles stay
  zip bytes (`isoinfinity-bake/4`) — only the file extension changes to
  `.sprite`, everywhere (workspace files, fallback downloads, runtime
  file-dialog accept), so macOS never auto-extracts them.
- **New: world persistence.** The runtime editor saves the placed scene
  (sprite placements + light/sun settings) to `worlds/<name>.json` and
  restores it on load.

## Capabilities

### New Capabilities

- `workspace`: the shared workspace-folder system both tools use —
  connection lifecycle (open, reconnect, persisted handle, disconnect),
  the `hdri/ models/ sprites/ worlds/` directory convention, listing and
  reading assets, writing files, the `.sprite` bundle file convention, and
  graceful degradation in browsers without File System Access support.
- `world-persistence`: saving and loading runtime world scenes
  (placements + light settings) as versioned JSON in the workspace's
  `worlds/` folder.

### Modified Capabilities

- `asset-baking`: the bake tool's model and HDRI pickers gain
  workspace-backed listings, multi-file `.gltf` externals resolve against
  the connected `models/` folder, and bundle output is saved into the
  workspace as `sprites/<id>.sprite` when connected (download stays as
  fallback, now also named `.sprite`).
- `runtime-sprite-rendering`: the runtime editor loads sprite bundles from
  the workspace's `sprites/` listing in addition to file dialogs; `.sprite`
  files are accepted wherever `.zip` bundles already are.

## Impact

- New shared module (workspace connection + conventions), used by
  `src/bake/main.ts` and `src/runtime/main.ts`; new IndexedDB persistence
  for directory handles (no new dependencies — File System Access API and
  IndexedDB are platform APIs).
- `src/bake/export.ts` / `src/bake/bundle.ts`: bundle file naming
  (`<id>.sprite`); `src/runtime/assets.ts` + runtime load UI: accept
  `.sprite`.
- `index.html` / `bake.html`: connection control, workspace picker UI,
  save buttons.
- Docs: `docs/bake-pipeline.md` and `docs/runtime.md` gain the workspace
  convention and `.sprite` naming.
- Compat: bundle format unchanged (`isoinfinity-bake/4`); existing `.zip`
  bundles keep loading. Workspace features require a Chromium-based
  browser; other browsers keep today's dialog/download workflow.
