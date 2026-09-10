## 1. Recursive model loading

- [x] 1.1 In `src/app/store/bake.ts` `loadModelFromWorkspace`, replace the flat `readAllWorkspaceFiles` call with `listWorkspaceTree('models', MODEL_EXTS)` + `readWorkspaceFile` for the selected relative path, keeping the "no longer in the models/ folder" error for paths absent from the tree; verify `npm run build` passes
- [x] 1.2 Read the supporting-file set (non-model-extension files under `models/`, recursively) via `listWorkspaceTree` with the complementary extensions and pass `[selected, ...others]` to `loadGltf` unchanged; verify `npm run build` passes

## 2. Verification

- [x] 2.1 Run `npm run verify:bundles` and `npm run build`; both clean
- [ ] 2.2 Browser check (user, `npm run dev`): put a `.glb` in `models/tripo/`, open it from the project browser — it loads as a bake source; a bogus path still shows the named missing-file error; a `/6` sprite whose provenance names a nested model re-bakes instead of going view-only
