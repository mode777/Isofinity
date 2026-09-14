## Why

Sprites baked with the path-traced render pass show bright seams around
every silhouette edge in the world editor — worst over dark backdrops
(grounding shadows, drop-shadow regions, dark ground materials) and on
high-silhouette assets (foliage, lattice). Root cause: the path tracer
returns full HDRI environment radiance for miss rays and records the miss
only in alpha, so silhouette-edge texels store RGB averaged with the
environment plate while alpha holds the coverage fraction. The runtime's
straight-alpha composite then leaks that contamination as a glowing ring.
The existing "Bake renders a path-traced lit render pass" requirement
already forbids this ("camera rays that miss the asset SHALL not
contribute any background image or color into the pass") — the
implementation just never complied at partial-coverage pixels, and no
scenario pinned the edge case.

## What Changes

- The render pass tonemap removes the background-plate contribution from
  partial-coverage texels: `rgb' = rgb − (1 − a)·B` in the linear
  pre-tonemap domain, where `B` is the constant linear HDRI radiance a
  miss ray returns (constant because the bake camera is orthographic).
  Edge texels store true straight object color at coverage alpha.
- Fully-empty texels (alpha 0) store RGB 0 instead of leaked environment
  radiance, so the pass carries no background color anywhere and bilinear
  filtering at zoom bleeds black, not sky.
- `B` is measured, not modeled: averaged from the accumulated linear
  target's empty pixels (their per-sample radiance is constant, so they
  converge to exactly `B`), making the estimate deterministic per bake
  and robust to path-tracer internals.
- No runtime change: after the unmix, partial-alpha fragments composite
  correctly with the existing straight-alpha blend, and the runtime spec
  scenario "Partial render-pass alpha never drops fragments" stays
  satisfied untouched. (The runtime discard guard explored earlier is
  superseded — empty-texel zeroing plus correct low-alpha color remove
  the need.)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `asset-baking`: Sharpen the "Bake renders a path-traced lit render
  pass" requirement with the edge-pixel semantics it always implied — a
  new scenario pinning that partial-coverage texels store the asset's
  own tonemapped radiance with the background contribution removed, and
  fully-empty texels store RGB 0. This is the scenario whose absence let
  the contamination ship.

## Impact

- `src/bake/pt.ts` — tonemap shader (unmix before ACES), `B` estimation
  (linear-target readback of empty pixels), shared by the committed pass
  and the live preview.
- Consumers of the render pass keep working unchanged: the grounding
  shadow composition (`shadow.ts`, keyed on alpha 0) and the runtime
  sprite path are unaffected; existing `/7` bundles stay valid, and
  re-baking an asset in place (provenance) picks up the fix. Old bundles
  keep their halos until re-baked.
- **Format-version impact: none.** No manifest or container change —
  `rgb=tonemapped-render a=coverage` finally means what it says. Baked
  bytes change (by design), so scratch-verify primitive bundle hashes
  will diff; that is the expected regression signal.
- Docs: `docs/bake-pipeline.md` (render-pass edge semantics + a note in
  the format-history table that `/7` bytes changed without a bump),
  `docs/roadmap.md` (when landed). A short ADR is warranted: "render
  pass stores straight, unmixed alpha — never premultiplied, background
  plate removed at tonemap" — it records why bundles stay straight-alpha
  and what a future premultiplied pipeline would have to change.
- Non-goals: the premultiplied end-to-end pipeline (kills the residual
  dark filtering shimmer at zoom; follow-up if the shimmer bothers), MSAA
  on the raster g-buffer (mask-mismatch polish), denoising, any runtime
  shader or blend change, and any bundle format change.
