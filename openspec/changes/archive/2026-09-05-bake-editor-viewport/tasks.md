## 1. View state on the document

- [x] 1.1 Add `view`/`viewTransform` fields to `BakeDocument` in `src/app/document.ts` (optional, with documented defaults) and mutators `setBakeView` / `setViewTransform` in `src/app/store/bake.ts`; verify `tsc --noEmit` passes and that `buildBundle` output is unchanged (no new manifest/entry fields)
- [x] 1.2 Implement the availability helper (which of Realtime 3D / Normals / Depth / Render a document can show, per design D4) and the default-view fallback (first available) with a unit-runnable pure function; verify with a quick Node/`tsx`-style check or static review since no test runner exists

## 2. Viewport shell, pan/zoom, and 2D views

- [x] 2.1 Restructure `SpriteEditor.tsx` into toolbar + viewport panel: remove the `.passes` figures and g-buffer caption toggle, add the panel layout (toolbar / note / `flex: 1` viewport) and the placeholder rendering for unavailable active views; verify visually with `npm run dev` that the panel fills the center region
- [x] 2.2 Render the Normals and Depth views from `doc.result.gbuffer` (existing mapping code) and the Render view from `doc.render` into the viewport's display canvas honoring `viewTransform` (`drawImage` transform, `imageSmoothingEnabled = false`); verify each view shows its pass at zoom 1 matching the old rendering
- [x] 2.3 Implement pan (pointer drag with capture) and zoom (wheel around cursor, ± buttons ×1.25, clamp [0.1, 8], fit action) through `setViewTransform`, plus the corner overlay controls `− <n>% +` with a fit button; verify wheel-zoom keeps the cursor point fixed, the readout updates, and fit restores the whole image
- [x] 2.4 Handle panel resize via `ResizeObserver` (refit only when at default view; otherwise keep transform) and re-render the active view; verify resizing the window keeps the image anchored

## 3. Realtime 3D view

- [x] 3.1 Create the realtime view module (three.js `WebGLRenderer` + fixed ambient/directional lights + orthographic camera from `isoDirection`/`frameIsoBox`-style framing of the primitive bounds), building meshes from `Primitive.geometry` or `groups[]` with albedo texture / base-color factor / alpha-mask support per design D3; verify a primitive (sphere) and a textured glTF model render correctly in the browser
- [x] 3.2 Map `viewTransform` to the 3D camera (frustum half-height = fit/zoom, pan in the view plane) and re-render on transform/doc/resize changes without a permanent rAF loop; verify the corner controls behave identically to the 2D views and the isometric direction stays fixed
- [x] 3.3 Wire lifecycle: create the renderer only while Realtime 3D is active; dispose on view switch, tab switch, and close; verify with repeated mode/tab switching that no WebGL context warnings appear and GPU memory is released

## 4. Toolbar integration and cleanup

- [x] 4.1 Extend the sprite toolbar with the view-mode switcher (Realtime 3D / Normals / Depth / Render, active marked, disabled-with-tooltip when unavailable) driving `setBakeView`, and remove the render figcaption button from the editor (properties-panel pass actions remain the bake/render entry points); verify buttons enable/disable per document state per the delta spec scenarios
- [x] 4.2 Remove the obsolete `.sprite-editor .passes`/figure CSS, add viewport + overlay styles, and scope `.center` overflow so panning is not fought by page scroll; verify `npm run build` passes and the world editor is unaffected

## 5. Verification

- [x] 5.1 Walk the delta-spec scenarios in the browser: single-view display, realtime 3D on primitive + model, view-only bundle (passes shown, Realtime 3D disabled), zoom/pan/fit, per-view availability tooltips, tab round trip restoring view, save + reopen starting at default view; verify `npm run build` (typecheck + build) passes and record results in the change notes

## 6. Fixes from browser testing

- [x] 6.1 Fix dead zoom controls: the viewport's pointerdown handler captured the pointer for clicks on the corner-control buttons (retargeting pointerup and swallowing their click); ignore pointerdowns originating inside `.view-controls`/`.zoom-controls`; verify −, +, and Fit all work in the browser
- [x] 6.2 Fix realtime↔2D framing jump: store the zoom/pan per view (`viewTransforms: Partial<Record<BakeViewMode, ViewTransform>>`, missing = fit) since the 2D views baseline zoom at image-native pixels and Realtime 3D at the framed mesh; verify each view resumes its own framing after switching away and back
- [x] 6.3 Move the view-mode switcher out of the sprite toolbar into a viewport top-right overlay styled like the zoom controls; toolbar keeps Save + Place in world; update proposal/spec/design to match; verify `npm run build` passes
- [x] 6.4 Fix realtime zoom anchoring at the bottom-right corner: `zoomAround` assumed a top-left pan origin while the realtime camera pans relative to the panel center; give it origin parameters and pass the center for Realtime 3D (wheel + ± buttons); Node-verify the anchor invariant for both origins and `npm run build`
- [x] 6.5 Switch the viewport to the Render view when a render pass completes (set `view: 'render'` in the success commit of `runRenderPass`); per-view transform keeps that view's zoom/pan; `npm run build` passes
