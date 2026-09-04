# Tasks: editor-ui-refactor

## 1. Render action semantics (store)

- [x] 1.1 In `src/app/store/bake.ts`, make `runRenderPass` implicitly bake the
      raster g-buffer first for editable documents: drop the `!doc.result`
      guard, run the raster bake (reusing `bakeRaster`'s logic) before the
      path-tracer setup, keep the view-only early-return, keep the generation
      token and status flow (raster `WxH px @ N px/unit` line, then render
      progress). Verify: `npm run build` passes.

## 2. Project browser

- [x] 2.1 Remove the Primitives section from `src/app/components/`
      `ProjectBrowser.tsx`; delete `openPrimitiveDoc` from
      `src/app/store/bake.ts` and drop its now-unused imports (`PRIMITIVE_KINDS`
      stays for the world brush dropdown). Keep workspace listings, the glTF
      import dialog, New world, and refresh. Verify: `npm run build` passes and
      grep finds no `openPrimitiveDoc` references.

## 3. Properties panel

- [x] 3.1 In `src/app/components/SpriteProperties.tsx`, render `PresetsSection`
      above the Source section and remove the "Re-bake raster" button and the
      render-pass button (and their store imports). Verify: `npm run build`
      passes.

- [x] 3.2 Auto-apply presets on selection: have `applyWorkspacePreset`/`applyPreset`
      (`src/app/store/bake.ts`) return whether the preset was applied; in
      `PresetsSection`, call it from the `<select>` `onChange`, remove the
      Apply button, and reset the selection to the placeholder when application
      fails (status bar keeps the named error). Verify: `npm run build` passes.

## 4. Sprite editor toolbar

- [x] 4.1 In `src/app/components/SpriteEditor.tsx`, add the render pass action
      to the toolbar row between Save and Place in world: label `Rendering…`
      while busy, `Re-render pass` when `doc.render` exists, else
      `Render pass`; disabled when `doc.viewOnly || doc.busy`; wired to
      `runRenderPass(doc.docId)`. Verify: `npm run build` passes.

## 5. Store cleanup

- [x] 5.1 Make `bakeRaster` internal to `src/app/store/bake.ts` (unexport) once
      no component imports it, and tidy any unused exports/imports left by the
      refactor. Verify: `npm run build` passes and grep finds no component
      imports of `bakeRaster`.

## 6. Docs

- [x] 6.1 Update `docs/runtime.md` (project browser section: no primitives;
      sprite editing/toolbar: render action in the toolbar, implicit raster
      bake) and `docs/bake-pipeline.md` (presets apply on selection with
      revert-on-failure; replace the explicit-raster-button and
      "explicit-buttons-only" wording). Verify: statements match the delta
      specs.

## 7. Verification

- [x] 7.1 Run `npm run build` (tsc --noEmit + vite build) clean; grep confirms
      no remaining `openPrimitiveDoc`, "Re-bake raster", or preset Apply button
      references. Verify: command output clean.

- [ ] 7.2 Browser check (user): primitives absent from the left bar; picking a
      preset applies it immediately and a missing-HDRI pick reverts the
      dropdown with a named status error; changing a model's scale then
      activating Render re-bakes the g-buffer first (Normals/Depth views show
      the new scale) and both passes stay aligned; the render action lives in
      the sprite toolbar with `Rendering…` state and status-bar progress;
      view-only sprites keep the action disabled.
