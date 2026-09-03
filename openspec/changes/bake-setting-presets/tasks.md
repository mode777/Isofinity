## 1. Preset format & workspace plumbing

- [x] 1.1 Create `src/app/presets.ts`: preset type, `format: "isoinfinity-bake-preset/1"` serializer, strict parser (exact format match, finite-number checks, known environment shapes only, named errors) and a `presetFileName(raw)` helper mirroring `bundleFileName`; verify `npm run build` passes and rejected inputs return named errors via a quick Node check of the pure parser
- [x] 1.2 Add `'presets'` to `WORKSPACE_FOLDERS` in `src/shared/workspace.ts` and add a `deleteWorkspaceFile(folder, name)` helper; verify `npm run build` passes and that connecting/reconnecting creates `presets/` (browser check, user)

## 2. Store actions

- [x] 2.1 Add a `presets` listing to the project store (`src/app/store/project.ts`) refreshed by the existing refresh action, filtered to `.json`; verify the listing updates after a manual refresh (browser check, user)
- [x] 2.2 Add bake-store actions (`src/app/store/bake.ts`): `savePreset` (workspace write with overwrite, or `download()` fallback), `applyPreset` (resolve HDRI first, then commit settings + environment in one update, single render-pass re-run, named errors leaving the document unchanged, texture size untouched), and `deletePreset`; verify `npm run build` passes

## 3. Editor UI

- [x] 3.1 Add a Presets section to `SpriteProperties.tsx`: name input + Save, preset select + Apply + Delete from the project listing, hidden `.json` file input with drop target for the disconnected/unsupported fallback, controls disabled for view-only documents; verify `npm run build` passes

## 4. Docs & verification

- [x] 4.1 Update `docs/bake-pipeline.md` workspace conventions: `presets/` folder and the `isoinfinity-bake-preset/1` preset file; verify the doc matches the shipped behavior
- [ ] 4.2 Run `npm run build`; then a browser walkthrough (user): save/overwrite/apply/delete a preset, apply with missing HDRI reports a named error and changes nothing, texture size survives apply, download/import fallback works with no workspace
