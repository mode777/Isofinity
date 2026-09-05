## 1. Document model & store

- [x] 1.1 Add `viewTransform: ViewTransform | null` (null = fit) to `WorldDocument` in `src/app/document.ts` and initialize it (`newWorldDoc`, `openWorldDoc` default to null) — verify `npm run build` typechecks
- [x] 1.2 Add `setWorldViewTransform(docId, transform)` to `src/app/store/world.ts` mirroring `setViewTransform` in `store/bake.ts` (in-memory update, no dirty mark, no world-JSON change) — verify `npm run build` and confirm saved world JSON is byte-identical for an unchanged scene

## 2. Renderer: view transform + ghost support

- [x] 2.1 Add a `uView` (scale xy + offset xy) uniform to both programs in `src/runtime/renderer.ts`, applied in the vertex shaders before the clip mapping, and accept the view transform in `render()` (`uRes` = backing-store size) — verify `npm run build` and that the untouched 1:1 transform (scale 1, offset 0) renders the scene unchanged at the old canvas size
- [x] 2.2 Size the canvas to its CSS panel box × devicePixelRatio, expose a resize setter, and keep world-image data untouched — verify with the dev server that the scene fills the panel crisply at DPR 1 and 2
- [x] 2.3 Add ghost rendering: the ghost draws as a sprite instance with depth test and g-buffer-driven `gl_FragDepth` enabled — same per-pixel occlusion as real placements (append to the painter-sorted batch); optional alpha styling knob, default opaque — verify `npm run build` and that no-ghost frames render exactly as before

## 3. WorldEditor viewport wiring

- [x] 3.1 In `src/app/components/WorldEditor.tsx`: track the panel with a ResizeObserver, compute fit via `fitTransform(CANVAS_W, CANVAS_H, …)` when `viewTransform` is null, and route every draw (ground, sprites, highlight, ghost) through the renderer's view transform — verify the default view shows the whole grid letterboxed in the panel
- [x] 3.2 Invert the transform in pointer→ground mapping (panel px → pan/zoom → world-image px → `screenToGround`) and confirm placement/erase land at the same ground coordinates before and after zooming — verify by placing at a marked spot at fit zoom, zooming, and placing again at the same screen point
- [x] 3.3 Wire input: non-passive `wheel` zoom around the cursor (`zoomAround`, top-left origin), middle-button drag pan with `setPointerCapture` + `preventDefault` (no place/erase during pan), left/right buttons unchanged — verify the pointer-anchored zoom and pan scenarios from the spec by hand in the browser
- [x] 3.4 Add corner zoom controls (`−`, percentage readout, `+`, fit) styled like the sprite viewport's, wired to `setWorldViewTransform` with center anchoring — verify the controls mirror the sprite editor's behavior and the state survives a tab switch but is not written into saved world JSON

## 4. Brush ghost preview

- [x] 4.1 In the render loop, when the active tool is a brush with a loaded layer and the cursor is over the canvas, append the ghost instance at `hoverRef`'s ground position (same origin/size/ppu math and depth sort key as placements, so it occludes pixel-accurately) and suppress the unit-cell highlight; keep the cell highlight for the eraser — verify the ghost tracks the cursor, centers exactly where the next click places, and hides behind nearer sprites exactly as the placed result does
- [x] 4.2 Keep the ghost preview-only: it never calls `placeAt`/`markDirty`, hides for eraser/no-brush/unloaded-layer/cursor-outside — verify the document stays clean while moving the mouse and that placement on click is unchanged (dirty mark)

## 5. Docs & verification

- [x] 5.1 Update `docs/runtime.md` (World editor / Input sections: zoom/pan bindings, ghost behavior, in-memory view state) and `docs/roadmap.md`; no ADR per design — verify the docs match the shipped behavior
- [x] 5.2 Run the gates: `npm run build`, `npm run verify:bundles`, and update `/scratch-verify.html` if the harness touches world rendering — then hand the browser checks (zoom anchor, pan, ghost scenarios) to the user via `npm run dev`
