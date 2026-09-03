## 1. Build setup

- [x] 1.1 Add `react`, `react-dom`, `zustand` dependencies and `@vitejs/plugin-react`, `@types/react`, `@types/react-dom` dev dependencies; enable JSX in `tsconfig.json`; verify `npm install` and `npm run build` succeed
- [x] 1.2 Add the React plugin to `vite.config.ts`, collapse `rollupOptions.input` to the single `index.html` entry, and keep `base: './'` plus the `__APP_VERSION__` define; verify `npm run build` emits one entry and `npm run preview` serves it

## 2. Stores and document model

- [x] 2.1 Create the Zustand store skeleton (`src/app/store/`) with slices `ui` (tabs `{docId, kind}`, active tab, status line), `workspace` (adapter over `onWorkspaceChange`/`getWorkspaceState`), `project`, `bake`, `world`; verify `npm run build` typechecks
- [x] 2.2 Define `BakeDocument` and `WorldDocument` types (source, settings, environment, passes/layers/placements/light, `resourceRef`, `dirty`) and the documents-by-id maps with open/focus/dirty actions per design D1; verify typecheck and that open-same-resource focuses the existing tab (unit-runnable store logic)
- [x] 2.3 Implement the `project` slice: built-in primitive entries plus workspace listings for `sprites/`, `models/`, `worlds/` with extension filtering and refresh, degrading to built-ins-only when disconnected; verify listings logic against a connected workspace in `npm run dev`

## 3. Shell layout

- [x] 3.1 Build the app shell components (top bar, tab bar, project browser panel, properties panel, editor area, status bar) with plain CSS porting the current dark palette; verify all six regions render in `npm run dev` and the version from `APP_VERSION` shows in the top bar
- [x] 3.2 Wire the workspace control into the top bar (open/reconnect/disconnect states, unsupported-browser message, convention-folder connect) reusing `src/shared/workspace.ts`; verify connect/reconnect/disconnect flows and that no permission prompt happens on page load
- [x] 3.3 Implement the tab bar: open tabs with dirty dots, activation, close with confirm-on-dirty; verify switching tabs never discards document state and closing a dirty tab asks

## 4. Project browser

- [x] 4.1 Render built-in primitives (always) and connected-workspace listings (sprites/models/worlds) with per-folder filtering and a refresh action; verify a `.txt` in `models/` is hidden and an externally copied file appears after refresh
- [x] 4.2 Wire open/create actions: primitive entry → new sprite document, model entry → sprite document with that source, sprite bundle → sprite document, world entry → world document, "new world" → empty world document; verify each opens or focuses the right tab kind

## 5. Sprite (bake) editor

- [x] 5.1 Build the sprite editor component: pass canvases drawing stored document buffers (albedo, g-buffer normal/depth toggle, render, AO), redrawn from the document without re-baking on tab re-activation; verify switching away and back redraws identical pixels with no new bake
- [x] 5.2 Port raster bake + PT render/AO pass actions into the `bake` store with generation guards (lazy `PtBaker`, dispose on active-document change); verify pass buttons disable per prerequisite, progress lands in the status bar, and rapid re-clicks cannot commit stale results
- [x] 5.3 Port source selection (built-in primitive from project browser; glTF load via file dialog/drop and `models/` entries) with model scale control; verify load failures keep the previous source and unsupported content notes appear
- [x] 5.4 Port environment controls (HDRI load via file/dialog/drop and `hdri/` entries, rotate/intensity/exposure/saturation; procedural default) with re-accumulation on change; verify an invalid HDRI keeps the previous environment
- [x] 5.5 Implement save/export: bundle build to workspace `sprites/<id>.sprite` when connected, download fallback otherwise; verify both paths and the save-clears-dirty behavior

## 6. World editor

- [x] 6.1 Add `Renderer.dispose()` releasing all GL objects and the context; verify disposal on unmount (StrictMode double-mount leaves one live context and no console errors)
- [x] 6.2 Build the world editor component: mount the renderer via ref, ground grid, rAF loop driven by document state, sprite set rebuild on document switch, per-document tool/hover state; verify placement/erase interactions and pixel-accurate occlusion behave as today
- [x] 6.3 Port light + sun properties into the properties panel for world tabs (key light, sun position with manual-slider sync, ambient, dynamic-light switch) writing to the active `WorldDocument`; verify sliders, sun-derived angles, and the identity-shading switch
- [x] 6.4 Port world save/load: save placements + light + sun to `worlds/<name>.json` (`isoinfinity-world/1`), load with full validation before mutating and skipped-asset reporting; verify round-trip and that malformed files change nothing

## 7. Provenance (isoinfinity-bake/5)

- [x] 7.1 Extend the manifest writer to emit `provenance` (source, bake settings, environment) and bump the format string to `isoinfinity-bake/5`; verify a saved model sprite records `model` + `scale` and a primitive sprite records its primitive + procedural environment
- [x] 7.2 Extend the bundle parser to accept `/4` and `/5` (reject `/3` and unknown with named errors) and parse provenance when present; verify a `/4` bundle loads view-only with a status note and placement still requires the render pass
- [x] 7.3 Implement re-bake from provenance: open `/5` sprite → restore source/settings/environment into the document, re-bake re-reads `models/` + `hdri/` from the workspace and replaces passes, save updates the manifest; verify missing model/HDRI or disconnected workspace degrades to view-only with a named message

## 8. Place in world

- [x] 8.1 Implement place-in-world: convert the sprite document's passes to a `SpriteLayer` (row flip, half-float g-buffer, render bytes), add as layer + placement to the target world document (open world tab or new one), mark dirty, write no file; verify the placed sprite renders, is placeable, and the world saves/reloads it via its saved bundle
- [x] 8.2 Handle the no-world-open case by creating a world document; verify place-in-world with no world tab creates one and activates it

## 9. Legacy removal and docs

- [x] 9.1 Delete `bake.html`, `src/bake/main.ts`, `src/runtime/main.ts`, `src/shared/workspace-ui.ts` and the old page CSS; verify `npm run build` passes with no dangling imports and `npm run grep`-style search shows no references
- [x] 9.2 Update `docs/runtime.md`, `docs/bake-pipeline.md`, and `README.md` for the integrated editor, `/5` format, provenance, and retired pages; verify docs match implemented behavior

## 10. Final verification

- [ ] 10.1 Full `npm run build` and `npm run preview` smoke pass: connect workspace, open primitive + model sprites, re-bake, place in world, save/load world and sprite, reload page and reconnect; verify no step regresses vs. the specs
- [ ] 10.2 Verify degradation paths: no-workspace session (built-ins only, downloads work), unsupported browser messaging, `/4` view-only, missing provenance refs view-only
