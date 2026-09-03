# Verification notes — bake-editor-viewport

Environment: no browser can be launched here (see AGENTS.md), so
verification is static; browser scenarios are listed for the user.

## Verified statically

- `npm run build` (tsc --noEmit + vite build) passes; both build warnings
  (EXRLoader dual import, chunk size) are pre-existing.
- `npx openspec validate bake-editor-viewport` passes.
- Node check (`node --experimental-strip-types`) of `src/app/bakeView.ts`:
  - availability per doc state (source primitive / model with & without
    loaded gltf / result / render);
  - default-view fallback order realtime → render → normals → depth; a
    stored view is kept (placeholder shown) when its data is missing;
  - non-empty unavailable-view reasons for all four modes;
  - `fitTransform` letterboxing, clamping to [0.1, 8] on both ends;
  - `zoomAround` keeps the cursor point fixed and clamps;
  - `panned` offsets pan at constant zoom.
- `git diff` confirms `src/bake/bundle.ts` is untouched — no new
  manifest/entry fields, bundle output unchanged; view state lives only on
  the in-memory document.

## Implementation notes

- Realtime 3D renders the document's source `Primitive` (same geometry the
  bake uses) with a fixed key+ambient light from an `OrthographicCamera`
  built by `frameIsoBox` — identical camera frame as the bake passes.
- The realtime canvas is created per activation and disposed with
  `forceContextLoss` on teardown; it is never a React-managed node, so
  StrictMode remounts and repeated view/tab switches always get a fresh
  context (bounded: at most one sprite realtime view + the world
  compositor).
- 2D views draw the pass into a panel-sized, DPR-aware backing store per
  frame (`imageSmoothingEnabled = zoom < 1`), so zooming in sharpens
  instead of scaling a fixed bitmap.
- View/zoom/pan mutators never mark the document dirty.

## Browser scenarios left for the user

1. Single-view display when switching Realtime 3D / Normals / Depth /
   Render.
2. Realtime 3D on a primitive and on a textured glTF model.
3. View-only bundle: passes shown, Realtime 3D disabled with tooltip.
4. Zoom/pan/fit: wheel zoom centered on cursor, drag pan beyond panel
   edges, `− <n>% +` readout, Fit restores the whole image.
5. Per-view availability tooltips before the first bake / render pass.
6. Tab round trip restores view mode + zoom/pan without re-baking.
7. Save + reopen starts at the default view (fit, first available).
8. World editor unaffected (canvas editing, no page-scroll changes).
