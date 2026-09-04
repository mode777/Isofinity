## 1. Projection helper and state

- [x] 1.1 Add `projectBoxFrame(size, pxPerUnit, padPx)` to `src/bake/iso.ts`: project the box corners through the `frameIsoBox` camera, map through `originPx`, return pixel-space 12 box edges, world-origin point, and the three origin-adjacent axis segments (X/Y/Z identified). Verify: `npx tsc --noEmit` passes.
- [x] 1.2 Add scratch-verify checks in `src/bake/scratch-verify.ts`: projected edges' bounding rect matches the bake sprite rect (width/height, `PAD_PX` inset) for a known size, origin projects to `originPx`, and 12 distinct edges are returned. Verify: open `/scratch-verify.html` on the dev server (the suite is a browser page; the projection math was additionally verified in Node during apply).
- [x] 1.3 Add the in-memory overlay flag to `BakeDocument` (`src/app/document.ts`, default off) and a toggle action + `setModelHeight(docId, meters)` (deriving `scale = meters / extent[1]`, delegating to `setModelScale`) in `src/app/store/bake.ts`. Verify: `npx tsc --noEmit` passes; toggling/setting on a scratch doc updates `doc.scale` and the flag (runtime behavior covered by the browser pass, task 4.2).

## 2. Height input UI

- [x] 2.1 In `src/app/components/SpriteProperties.tsx`, add the height row for model-source docs with `doc.gltf`: meters input mirroring `doc.scale`, native-height hint in file units (`doc.gltf.extent`), and derived-height display that updates when the raw Scale row changes. Verify: `npm run dev` — entering height 2 on a 1.8-unit model shows scale ≈ 1.111 and vice versa (browser check covered by task 4.2).
- [x] 2.2 Show the resulting sprite pixel size next to the input using the projected box extent at the bake's px/unit, and warn when it exceeds `MAX_SPRITE_PX`, naming the offending `WxH px`. Verify: dev server — an oversized height shows the warning; the bake still fails with its existing cap error if run (browser check covered by task 4.2).

## 3. Viewport overlay

- [x] 3.1 Add a "Box" toggle button to the viewport view-controls row in `src/app/components/SpriteEditor.tsx`, wired to the per-document flag (state survives view/tab switches). Verify: dev server — toggle state is independent per sprite tab and persists across view switches (browser check covered by task 4.2).
- [x] 3.2 Draw the 2D overlay (box edges neutral, origin cross, X/Y/Z axis segments colored) in the Normals/Depth/Render draw pass of `SpriteEditor.tsx`, mapping image pixels through the existing zoom/pan transform with half-pixel alignment; recompute on the same effect that redraws the image. Verify: dev server — overlay lines up with the iso frame in all three 2D views and tracks zoom/pan anchored to image pixels (browser check covered by task 4.2).
- [x] 3.3 Add the scene-space overlay to `RealtimeMeshView` (`src/app/realtime.ts`): `LineSegments` box `[0,0,0] → prim.size` (cell box for legacy primitives), origin-adjacent edges colored per axis; rebuild on prim change; show/hide via the document flag passed through `RealtimeCanvas.tsx`. Verify: dev server — Realtime 3D shows the same box semantics as the 2D views and updates when scale changes (browser check covered by task 4.2).
- [x] 3.4 Confirm opened bundles (with and without provenance, view-only included) show the overlay from `result.size` / `result.originPx`. Verify: dev server — open a saved `.sprite`, toggle Box, overlay aligns with the baked passes.

## 4. Final verification

- [x] 4.1 Run `npx tsc --noEmit && npm run build` and the full `src/bake/scratch-verify.ts` suite; fix any regressions. Verify: both pass clean.
- [x] 4.2 Manual browser pass over the spec scenarios: height↔scale sync, cap warning, overlay in all four views, per-tab toggle independence, view-only bundle overlay, height not persisted after save/re-bake. Verify: each scenario in the two delta specs behaves as written; note any deviation as a follow-up.
