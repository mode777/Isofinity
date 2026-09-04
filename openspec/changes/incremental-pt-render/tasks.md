## 1. PtBaker core: tiled, rAF-paced accumulation

- [x] 1.1 In `src/bake/pt.ts`: add the tile-grid derivation (pure function of frame pixel count, `TILE_BUDGET_PX = 512*512`, `TILE_GRID_MAX = 8`, design D1), store the derived grid into `PtSettings` at pass start, and set `tracer.tiles.set(N, N)` instead of `(1, 1)`; verify `npm run build` passes and a primitive render still converges (dev server, user-run)
- [x] 1.2 Rewrite the `renderPass` loop: `requestAnimationFrame` ticks that check the generation token first, then draw tiles until a ~10 ms wall-time budget or the target sample count is reached (design D2/D4); drop `yieldFrame`; verify `npm run build` passes
- [x] 1.3 Make the stall guard compile-aware: while `tracer.isCompiling`, reset the 120 s timer and report a "compiling" state through `onProgress` (design D2); verify by running the first-ever render pass after a hard reload (shader compile path) in the dev server (user-run)
- [x] 1.4 Add the preview hook: a small preview render target (long axis <= 512 px) tonemapped from the partial accumulation target with the existing tonemap shader, with a throttled (~10 Hz, per completed sample) readback callback alongside the existing `onProgress` (design D3); verify `npm run build` passes
- [x] 1.5 Fix pacing (browser test showed the whole render queued at once: status stuck at 0/N, one long block, then the finished image — WebGL submissions are async, so the ~10 ms wall-time budget measured CPU submission time and queued everything): pace on GPU completion instead — poll a `fenceSync` planted after each submitted batch with a non-blocking `clientWaitSync` per rAF, submit the next batch (one tile, doubling to at most one full sample per frame) only when the queue has drained, run preview/final readbacks only on drained queues, and cover a hung device in the stall guard; verify `npm run build` passes and progress increments sample-by-sample without blocking (dev server, user-run)

## 2. Provenance records the tile grid

- [x] 2.1 In `src/bake/bundle.ts` provenance: record `tiles: N` in the render-pass settings block on save/re-bake; keep the parser tolerant of manifests without the field (treat as "derive from frame size") and ignore unknown fields as today; verify by saving a sprite and inspecting the manifest JSON inside the `.sprite` zip, and by opening a pre-change bundle (dev server, user-run)

## 3. Store integration

- [x] 3.1 In `src/app/store/bake.ts` `runRenderPass`: wire the preview callback into a document-level preview state (cleared on commit, on discard, and on document close), keep status-bar sample progress, and surface the compiling state; verify the status bar shows compiling then sample progress during a pass (dev server, user-run)
- [x] 3.2 Update `bakePrimitiveLayer` to the same incremental loop with status-bar progress only (no preview state); verify baking a primitive brush into a world still produces a placeable layer (dev server, user-run)
- [x] 3.3 Confirm the stale-pass invariant: change a setting or the source mid-pass and verify the old loop exits before its next draw, the previously committed render pass stays stored and shown, and no partial image is committed (dev server, user-run)

## 4. Viewport live preview

- [x] 4.1 In the sprite viewport component(s): while a pass is busy, display the document's preview image in place of the committed render; when the pass commits, show the committed render (existing view switch); verify a sprite render visibly converges in the viewport and the finished image is pixel-identical to the final preview state (dev server, user-run)

## 5. Docs and verification

- [x] 5.1 Update `docs/bake-pipeline.md` render-pass notes: incremental tile-grid accumulation, the derived `tiles` provenance field, and the live preview behavior; verify the doc matches the implemented manifest shape
- [x] 5.2 Run `npm run build` (tsc + vite) and fix any type or build errors; confirm no dependency changes were needed
- [ ] 5.3 Browser acceptance pass (user-run, dev server): render a small primitive (grid 1 — expect byte-identical output to pre-change), render a large model at high samples while interacting with the UI (page stays responsive), confirm re-bake from provenance reproduces the saved pass, and confirm no WebGL context-loss warnings in the console
