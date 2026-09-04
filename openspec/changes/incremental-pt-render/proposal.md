# Proposal: incremental-pt-render

## Why

The path-traced render pass draws each accumulated sample as one monolithic
full-frame GPU submission (`PtBaker.renderPass` runs the tracer with
`tiles.set(1, 1)`), so large legal bakes — the sprite cap allows 8192 px on
each axis, the panel allows 4096 samples at 16 bounces — block the browser
for the length of each draw and can trip the GPU watchdog (WebGL context
lost, bake dies). The renderer library's own examples avoid exactly this by
accumulating one *tile* per animation frame, which keeps the page responsive
and shows the image converge live; our loop already yields between samples
but switched the tiling off and hides the partial result until the pass
completes.

## What Changes

- Accumulate the render pass over a **tile grid** instead of monolithic
  full-frame draws: each `renderSample()` advances one tile (the library's
  generator semantics), sized as a pure deterministic function of the frame
  pixel count so byte output stays reproducible across devices.
- Pace accumulation with **requestAnimationFrame** (one tile per frame)
  instead of `setTimeout(0)` between full frames, and make the loop aware of
  shader compilation (`isCompiling`): compiling shows in the progress
  message and does not trip the stall guard.
- Show a **live converging preview** in the sprite viewport while the pass
  accumulates: the same ACES/sRGB tonemap applied to the partial float
  target, updated at sample boundaries; the committed final image is
  pixel-identical to the fully converged preview.
- **Cancel per tile**: the render generation token is checked between tile
  draws, so a stale pass stops mid-frame instead of finishing its sample
  loop in the background (the discard-don't-restart behavior is unchanged,
  just faster).
- Record the **tile grid in bundle provenance** as part of the render-pass
  settings (it affects output bytes); the parser tolerates manifests that
  lack it, per the existing legacy-field convention.

Non-goals: `setSceneAsync`/BVH-worker scene setup (deferred follow-up),
fractional-resolution accumulation (`renderScale` < 1 — the bundle pixels
are the product), worker/OffscreenCanvas offload, the denoiser.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `asset-baking`: the path-traced render pass accumulates incrementally
  over a tile grid without blocking the page, shows a live converging
  preview in the sprite viewport, and its provenance records the tile grid;
  determinism is defined per fixed sample count and tile grid.

## Impact

- `src/bake/pt.ts` — `PtBaker.renderPass`: tile grid selection, rAF-driven
  loop, `isCompiling` handling, preview tonemap hookup; settings gain the
  tile grid.
- `src/app/store/bake.ts` — `runRenderPass`/`bakePrimitiveLayer`: preview
  state flow, per-tile generation checks, status messages (compiling state).
- Sprite viewport document/view plumbing for the in-flight preview image.
- `src/bake/bundle.ts` — provenance settings block gains the tile grid
  field; parser stays tolerant of older manifests without it.
- Docs: `docs/bake-pipeline.md` render-pass notes.
- No dependency changes: `three-gpu-pathtracer@0.0.24` already provides the
  tile generator, `isCompiling`, and preview hooks used here.
