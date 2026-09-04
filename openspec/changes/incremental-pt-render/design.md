# Design: incremental-pt-render

## Context

`PtBaker.renderPass` (`src/bake/pt.ts`) accumulates with `tiles.set(1, 1)`:
every `renderSample()` is one monolithic full-frame path-trace draw, so large
legal frames (sprite cap 8192 px/axis, panel allows 4096 samples x 16
bounces) hold the GPU for seconds per draw — watchdog/context-loss territory
— while the viewport shows nothing until the pass completes. The library
(`three-gpu-pathtracer@0.0.24`, verified in `node_modules`) implements
`renderSample()` as a generator that yields per tile:
`WebGLPathTracer.renderSample()` advances exactly one tile per call,
`samples` grows by `1/totalTiles` per tile (rounded at frame end), and
`update()` no-ops while `isCompiling`. The examples drive one call per
`requestAnimationFrame` with a 3x3 grid. Our loop already yields between
samples (`setTimeout(0)`); the store (`runRenderPass`, `bakePrimitiveLayer`)
guards commits with a generation token (`renderGen`).

Key invariant discovered while designing: **only the tile GRID affects
output bytes** (the stratified/RNG state advances once per tile draw, in
tile order). How tiles are grouped across animation frames — one per rAF or
many — is invisible to the result. Grid = semantics; pacing = scheduling.

## Goals / Non-Goals

**Goals:**

- No single GPU draw covering the whole frame; page stays responsive
  throughout a render pass, including worst-case legal settings.
- Live converging preview in the sprite viewport during accumulation.
- Byte-reproducible passes (same source/settings/env → same bytes) so
  provenance re-bakes stay exact.
- Finer-grained cancellation of stale passes (per tile, not per frame).

**Non-Goals:**

- `setSceneAsync` + BVH worker for model documents (deferred follow-up).
- `renderScale` < 1 or any resolution reduction of the committed pass.
- Worker/OffscreenCanvas offload; the denoiser; preset/panel UI for tiles.

## Decisions

### D1: Tile grid = pure function of frame size, recorded in provenance

`tiles = clamp(ceil(sqrt(framePx / TILE_BUDGET_PX)), 1, TILE_GRID_MAX)` with
`TILE_BUDGET_PX = 512*512` and `TILE_GRID_MAX = 8` as tunable constants.
Rationale: the examples pick tiles GPU-adaptively, but that breaks byte
determinism across devices and the re-bake-from-provenance contract; deriving
from frame size keeps `same input → same bytes` (small sprites keep grid 1 —
byte-identical to today's output) while bounding per-draw cost (worst legal
8192² frame → 8x8 → 1024² tiles). Alternative rejected: fixed 3x3 like the
examples (wasteful tiny-draw pacing for small sprites, still coarse for the
worst case). The derived grid is stored into `PtSettings` at pass start
(derived field — not user-editable, not preset material) and recorded in the
manifest's render settings as `tiles: N` (grid is NxN). Parsers already
tolerate unknown/missing fields; absence means "derive from frame size".

### D2: rAF-driven loop with a wall-time budget; multiple tiles per frame

Each `requestAnimationFrame` tick: check the generation token, then call
`tracer.renderSample()` repeatedly until a per-tick wall-time budget
(~10 ms) is spent or the target sample count is reached. Rationale: one tile
per rAF (the examples' pacing) multiplies minimum wall time by the grid —
4096 samples at 8x8 would be ~9 min of pure pacing overhead; a time budget
paces to the GPU's actual speed and never affects bytes (D1 invariant).
`setTimeout(0)` is replaced outright (4 ms nesting clamp, no compositing
alignment). The 120 s stall guard stays, with its timer reset while
`tracer.isCompiling` is true (first-pass shader compile can take tens of
seconds); while compiling, the status message says so and the loop keeps
ticking.

### D3: Preview = tonemap of the partial target into a small target

The existing tonemap shader renders `tracer.target` into a small
`WebGLRenderTarget` (long axis <= 512 px, linear downsample — one extra
draw, no new shader), read back at <= ~10 Hz, and surfaced to the sprite
viewport via the document store (e.g. a `preview` field that the viewport
prefers over the committed `render` while a pass is busy). When the pass
finishes, the existing full-res tonemap + readback commits as today; the
committed image is by construction the final state of the preview (same
shader, same target content). Alternatives rejected: full-res readback per
sample (hundreds of MB at the cap), rendering the preview to an onscreen
canvas (the shared bake renderer is offscreen; a GL->2D copy needs readback
anyway).

### D4: Cancellation invariant: token check precedes every draw

The rAF loop checks `renderGen` before each tick's draws; a superseded run
exits at the next tick boundary before touching the GPU. `runRenderPass`'s
prologue (applySettings/setEnvironment/setPrimitive/reset on the shared
baker) runs synchronously between ticks of any stale loop (single thread),
so a stale loop can never draw against reconfigured state. Commit stays
token-guarded as today; "discard — not restart" behavior is unchanged, only
faster.

### D5: bakePrimitiveLayer keeps its throwaway baker

It uses the same incremental loop and preview machinery but with no store
preview (no document viewport to update — only status-bar progress). The
existing mutual-exclusion contract ("must not run while another pass
accumulates — both drive the shared bake renderer") is unchanged.

## Risks / Trade-offs

- [Per-tile draws still too slow at the extreme corner (8192², 16 bounces)]
  → grid constants are tunables; scissored tile draws let the browser
  interleave between draws even when one tile is slow; measure on real
  hardware during apply and adjust `TILE_BUDGET_PX`/`TILE_GRID_MAX`.
- [Preview readback jank on weak GPUs] → downscale before readback (<=1 MB),
  throttle to ~10 Hz, skip preview entirely for `bakePrimitiveLayer`.
- [rAF pauses in hidden tabs → a bake stalls until refocus] → today's
  `setTimeout(0)` is throttled to >= 1/s in background tabs anyway; bakes
  need a visible tab either way; the stall guard (compile-aware) remains the
  backstop. Accepted, documented.
- [Byte drift vs today's output for frames with grid > 1] → expected and
  specified (determinism is per tile grid, recorded in provenance); grid 1
  frames are byte-identical to current output.
- [Two render-pass runs interleaving on one baker] → D4 invariant; the
  existing `anyBakeBusy` gate keeps `bakePrimitiveLayer` out of the way.

## Migration Plan

Additive: bundle format stays `isoinfinity-bake/5`; the manifest gains an
optional `tiles` field that older parsers ignore and whose absence older
bundles already cover (derive from frame size). Rollback = revert the
commit; no data migration in either direction.

## Open Questions

None blocking; the tile-budget constants are tuning knobs to be validated
against real hardware during apply (browser-side verification is
user-run per project convention).
