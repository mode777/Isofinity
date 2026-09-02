# Tasks: Workspace folders

## 1. Shared workspace module

- [x] 1.1 Create `src/shared/workspace.ts` with feature detection
      (`'showDirectoryPicker' in window`), connection lifecycle (open via
      `showDirectoryPicker({ mode: 'readwrite' })`, disconnect), and
      `ensureConventionFolders()` creating `hdri/`, `models/`, `sprites/`,
      `worlds/` idempotently on connect. Verify: `npm run build` passes and
      the module has no UI-page imports.
- [x] 1.2 Add the IndexedDB persistence (db `isoinfinity-workspace`, store
      `handles`, key `workspace`): save handle on connect, clear on
      disconnect, load on page boot to expose a "reconnectable" state (never
      a silently-connected state); reconnect calls
      `requestPermission({ mode: 'readwrite' })` inside the click gesture.
      Verify: `npm run build`; reload/reconnect behavior is on the user's
      browser checklist (task 5.2).
- [x] 1.3 Add `BUNDLE_EXT = '.sprite'`, `listFiles(folder, exts)` (flat,
      extension-filtered, name-sorted), `readFile(folder, name)` returning a
      `File`, and `writeFile(folder, name, bytes)` (overwrite semantics,
      named errors). Verify: `npm run build`.
- [x] 1.4 Wire a shared workspace header control component (Open workspace… /
      Reconnect workspace… / connected: folder name + Disconnect; disabled
      with reason when the API is missing) and mount it in `bake.html` and
      `index.html`. Verify: `npm run build`; both pages render the control
      (user checklist 5.2).

## 2. .sprite bundle naming

- [x] 2.1 Rename the bake bundle download to `<id>.sprite` via `BUNDLE_EXT`
      (was `<id>-bake.zip`); bundle bytes and manifest untouched. Verify:
      `npm run build`; fallback download named `<id>.sprite` (user checklist
      5.2).
- [x] 2.2 Accept `.sprite` alongside `.zip` in the runtime load dialog's
      `accept` filter and any drag-drop extension checks; confirm
      `parseBake` stays extension-agnostic so legacy `<id>-bake.zip` keeps
      loading. Verify: `npm run build`.

## 3. Bake tool workspace integration

- [x] 3.1 Connect the bake tool's page to the shared module: open/reconnect/
      disconnect flows, convention folders ensured on connect, status-area
      messages for connect/save/error. Verify: `npm run build`.
- [x] 3.2 Add the model picker (select + refresh) listing `models/` glTF
      files; loading an entry calls the existing `loadGltfFiles` path with
      the folder's files as the candidate set so multi-file `.gltf` externals
      resolve by basename against `models/`; dialogs and drag-drop keep
      working. Verify: `npm run build` (browser check 5.2).
- [x] 3.3 Add the HDRI picker (select + refresh) listing `hdri/` `.hdr`/`.exr`
      entries, loading through the existing `loadHdriFile` path. Verify:
      `npm run build` (browser check 5.2).
- [x] 3.4 Make the bundle save write `sprites/<id>.sprite` into the workspace
      when connected (status-area confirmation; named error on failure) and
      keep the download button as fallback; debug PNG keeps downloading.
      Verify: `npm run build` (browser check 5.2).

## 4. Runtime workspace integration

- [x] 4.1 Connect the runtime editor's page to the shared module (same
      open/reconnect/disconnect flows and status messages as the bake tool).
      Verify: `npm run build`.
- [x] 4.2 Add the sprite picker (select + refresh) listing `sprites/`
      `.sprite`/`.zip` bundles, loading through the existing `loadBundle`
      path (same parser, render-pass rule, and unique-id handling).
      Verify: `npm run build` (browser check 5.2).
- [x] 4.3 Implement world save: name input defaulting to the first free
      `world-<n>`, serialize `isoinfinity-world/1` (every placement's asset
      id + ground position, full light state incl. sun inputs) to
      `worlds/<name>.json` via `writeFile`; overwrite on same name; control
      disabled when no workspace. Verify: `npm run build`; saved JSON
      inspected in the browser (user checklist 5.2).
- [x] 4.4 Implement world load: picker lists `worlds/` JSON files; loading
      clears the scene, restores placements and light/sun state through the
      existing control-sync helpers, skips placements whose asset id is not
      loaded (status names the skipped ids), and parse failures leave the
      current scene unchanged with a named error. Verify: `npm run build`
      (round trip on user checklist 5.2).

## 5. Docs and validation

- [x] 5.1 Update `docs/bake-pipeline.md` and `docs/runtime.md` (workspace
      folder convention, `.sprite` naming, browser support/degradation) and
      refresh the AGENTS.md current-state blurb. Verify: docs consistent
      with the specs; `npm run build` green.
- [x] 5.2 Run `npx openspec validate workspace-folders` and `npm run build`;
      hand the user a browser checklist: connect (folders created) → pick
      model/HDRI from listings → bake + save `.sprite` → load it in the
      runtime → save/load a world → reload page and reconnect → sanity-check
      dialogs/drag-drop and a Firefox/Safari fallback run.
