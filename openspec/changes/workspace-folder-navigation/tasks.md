## 1. Workspace layer (src/shared/workspace.ts)

- [x] 1.1 Add recursive listing helper returning flat `{ path, kind, handle }` entries with relative slash paths, filtered by accepted extensions; verify with `npm run build` (tsc) and a manual dev-server check against a nested workspace
- [x] 1.2 Add nested write support: accept a relative path with subfolders, creating missing directories via `getDirectoryHandle(seg, { create: true })`; verify by saving into a two-level-deep new path in the browser
- [x] 1.3 Keep existing flat `listWorkspaceFiles`/read/write call sites working unchanged (HDRI picker, presets, bundle loads); verify `npm run build` passes and existing flows still work

## 2. Project browser tree view (src/app/)

- [x] 2.1 Build a tree component from the recursive listing (folders expandable/collapsible, files as leaves, folders-first sort) and use it for `sprites/`, `models/`, `worlds/` sections; verify visually with `npm run dev` on a nested workspace
- [x] 2.2 Wire activating a nested file to the existing open/start-sprite-document actions and keep the refresh action re-reading recursively; verify by opening a nested bundle and world

## 3. Workspace file dialog modal (src/app/)

- [x] 3.1 Implement `WorkspaceFileDialog` modal (folder tree left, filtered file list right, breadcrumb, cancel/accept) parameterized by mode and asset kind; verify rendering and navigation with `npm run dev`
- [x] 3.2 Add save mode: name field pre-filled, accept disabled when empty, save into selected folder with subfolder creation; verify saving `worlds/campaign1/town.json`
- [x] 3.3 Add load mode: accepted-type filtering, double-activation or select+accept opens the file; verify loading a nested sprite and world
- [x] 3.4 Remember last-used folder per kind in memory only (never serialized — ADR 0006); verify it survives within a session and not across reload

## 4. Routing save/load flows through the modal

- [x] 4.1 Route connected-workspace save affordances (sprite bundle, world) through the modal; keep no-workspace download/file-dialog fallbacks untouched; verify both paths in the browser
- [x] 4.2 Route connected-workspace load affordances through the modal where they currently use plain listings/pickers; verify fallback flows still work without a workspace

## 5. Verification and docs

- [x] 5.1 Run `npm run build` and `npm run verify:bundles`; fix any fallout; confirm no bundle/world format changes are needed
- [x] 5.2 Update `docs/runtime.md` (browser tree view + modal flows), `docs/roadmap.md` (done entry), and `docs/glossary.md` if new terms were introduced
- [x] 5.3 Update `/scratch-verify.html` only if any bake behavior changed (expected: none); leave browser verification of the modal and tree to the user
