# 0019 — Straight, unmixed render-pass alpha

Status: Accepted (2026-09-15, change `fix-sprite-edge-fringe`)

## Context

The path tracer returns the environment plate's full radiance for a missed
camera ray and records the miss only in alpha (`backgroundAlpha = 0`). A
silhouette-edge texel therefore accumulated
`coverage · asset + (1 − coverage) · plate` in RGB while its alpha held the
coverage fraction — RGB premultiplied against a bright plate, stored under
straight-alpha semantics. The runtime composites sprites straight-alpha
(`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`), so every outline carried a ring of the
environment: invisible over the bake viewport's mid-grey, a bright seam over
dark backdrops (grounding shadows, dark ground), worst on high-silhouette
assets like foliage.

## Decision

The render pass stores **straight alpha with the plate removed**, always:

- In the tonemap (linear, pre-ACES): a fully empty texel stores RGB 0; a
  partial-coverage texel stores
  `(rgb − (1 − a) · plate) / max(a, 1/255)`, clamped ≥ 0, then tonemapped.
  Stored edge RGB is the asset's own radiance at coverage alpha.
- The plate is **measured, not modeled**: the mean linear RGB of the
  accumulated target's alpha-0 pixels. The orthographic bake camera misses
  in a single direction, so the plate is constant across the frame and
  empty pixels converge to it exactly — the estimate is deterministic and
  robust to path-tracer internals. The committed pass re-measures on the
  converged target; live previews probe corner tiles and cache.
- Bundles keep the straight-alpha convention and the
  `rgb=tonemapped-render a=coverage` manifest semantics; no format bump
  (bytes change; see the format-history note in `docs/bake-pipeline.md`).
- The runtime is untouched: after the unmix, partial-alpha fragments
  composite correctly with the existing blend, and the runtime spec's
  "partial render-pass alpha never drops fragments" scenario stands.

## Consequences

- Edge seams are gone without any runtime or format change; re-bake an
  asset in place (provenance) to refresh it — pre-fix bundles keep their
  fringes.
- The epsilon floor trades exactness below ~1/255 coverage for stability;
  such texels are weighted by their tiny alpha at composite, so the
  residual error is second-order, and ACES compresses outliers.
- A residual *dark* shimmer remains at zoom: bilinear filtering of
  straight-alpha RGB pulls edge colors toward zero-alpha neighbors'
  RGB. Premultiplied storage would make both compositing and filtering
  exact — that is the known follow-up, and adopting it means changing the
  stored convention, the runtime blend to `(ONE, ONE_MINUS_SRC_ALPHA)`,
  and every render-pass consumer in the same change.

## Rejected alternatives

- **Premultiplied pipeline now** — exact, but a bundle-semantics change
  across bake, viewport, shadow composition, and runtime blending; deferred
  as the follow-up above.
- **Zeroing the miss contribution at trace time** — not configurable in
  the pinned path tracer (`sampleBackground` always samples the
  environment when the background map is absent); patching the vendored
  shader is invasive.
- **`scene.background = black`** — the tracer then reports
  `backgroundAlpha = 1`, destroying the coverage alpha the grounding-shadow
  composition and runtime blending rely on.
- **Runtime discard of low-alpha fragments** — trades seams for clipped AA
  edges and conflicts with the runtime spec; unnecessary after the unmix.
- **Analytic CPU plate sampling** — duplicates the tracer's equirect
  math (drift risk); measuring the target's own empty pixels cannot drift.
