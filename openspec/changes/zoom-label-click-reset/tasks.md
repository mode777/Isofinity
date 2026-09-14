## 1. Shared zoom helper

- [x] 1.1 Add `zoomTo(t, targetZoom, cx, cy, originX?, originY?)` to `src/app/bakeView.ts`: absolute-target variant of `zoomAround` (same `pan' = k·pan + (1−k)·(c − o)` formula with `k = targetZoom / t.zoom`, result zoom = `clampZoom(targetZoom)`), JSDoc noting it guarantees the exact target zoom where `zoomBy(1/zoom)` would round. Verify: `npx tsc --noEmit` passes and a quick node REPL check shows `zoomTo({zoom:1.4,panX:10,panY:20}, 1, 50, 50).zoom === 1`.

## 2. Editor wiring

- [x] 2.1 `src/app/components/SpriteEditor.tsx`: replace the `.zoom-value` `<span>` (~line 503) with `<button type="button" className="zoom-value" title="Reset zoom to 100%" disabled={!transform}>`; on click, if `transform` is resolved call `setViewTransform(doc.docId, view, zoomTo(transform, 1, panelCenter, realtimeOrigin))` using the same panel-center/pan-origin conventions as the existing `zoomBy` (~line 338). Verify: `npx tsc --noEmit` passes.
- [x] 2.2 `src/app/components/WorldEditor.tsx`: same replacement (~line 2046) with `setWorldViewTransform(doc.docId, zoomTo(transform, 1, panel.w/2, panel.h/2))`, disabled without a transform, mirroring its `zoomBy` (~line 1819). Verify: `npx tsc --noEmit` passes.

## 3. Styling

- [x] 3.1 `src/app/app.css`: on `.zoom-value` (~line 497) reset button defaults (background, border, padding, font inherit) so the readout keeps its current look; add `cursor: pointer` plus `:hover` and `:focus-visible` affordances and a disabled state matching the sibling zoom buttons. Verify: visual check in `npm run dev` (user/browser step).

## 4. Docs

- [x] 4.1 `docs/runtime.md`: add the click-percentage-to-reset-to-100% mention to the sprite viewport zoom section (~line 80) and the world viewport navigation section (~line 216). Verify: `docs/runtime.md` renders coherently; no other docs claim the old readout behavior (`rg -n "zoom" docs/runtime.md`).
- [x] 4.2 `docs/roadmap.md`: add a done line for the clickable 100% readout. Verify: file renders coherently.

## 5. Verification

- [x] 5.1 Run `npm run build` (tsc + vite) — must pass; confirm no Node verifier (`verify:bundles`, `verify:mesh`, `verify:history`, `verify:selection`, `verify:terrain`, `verify:trace`) touches these files so none need re-running. Verify: command exits 0.
- [ ] 5.2 Browser pass (user): in `npm run dev`, zoom a 2D bake view off 100%, click the percentage → readout shows `100%` and the panel-center point stays put; repeat in Realtime 3D and in a world tab; confirm Enter activates the focused readout, Fit is unchanged, and an unsaved document shows no dirty indicator after the click.
