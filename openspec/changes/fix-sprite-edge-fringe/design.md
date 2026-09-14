## Context

The path tracer records misses only in alpha: with `scene.background = null`
the library sets `backgroundAlpha = 0`, but `sampleBackground` still returns
`environmentIntensity · env` for every miss ray (`PhysicalPathTracingMaterial`,
`sampleBackground`). Accumulated over jittered samples, a silhouette-edge
texel therefore holds `rgb = ACES(c·obj + (1−c)·B)`, `a = c`, where `B` is the
environment's linear radiance along the (constant) miss direction and `c` the
coverage fraction. The runtime composites straight-alpha
(`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`), so the contamination surfaces as a bright
ring over any backdrop darker than the plate. Fully-empty texels likewise
store the plate RGB (ignored at runtime, but it bleeds under bilinear
filtering at zoom and leaks background color into the stored bytes).

Constraint from the spec: the tonemap happens once, after tiled incremental
accumulation, on the whole linear HDR target — and the committed pass must
stay byte-deterministic for a fixed sample count and tile grid.

## Goals / Non-Goals

**Goals:**

- Stored render passes obey the edge semantics the asset-baking spec pins:
  edge texels carry the asset's own tonemapped radiance at coverage alpha;
  empty texels carry RGB 0.
- Exact for the common case (opaque assets, ortho camera), not an
  approximation that shifts edge color.
- Byte-deterministic output preserved.
- Bake-only: runtime shaders, blending, and bundle format untouched.

**Non-Goals:**

- Premultiplied-alpha storage and `blendFunc(ONE, …)` compositing (the
  durable fix for the residual *dark* bilinear-filter shimmer at zoom —
  a possible follow-up, rejected for now because it is a bundle-semantics
  change).
- Mask-mismatch polish (MSAA on the raster g-buffer) and denoising.
- Fixing already-baked bundles: they keep their halos until re-baked in
  place via provenance.

## Decisions

### D1 — Unmix in the tonemap, linear pre-ACES domain

In `TONEMAP_FRAG`, before tonemapping:
`rgb' = (rgb − (1 − a)·B) / max(a, ε)`, then ACES → sRGB → saturation as
today. Division by `a` reconstructs the asset's own linear radiance so the
tonemap applies to the true color, not a blend. `ε` (≈ 1/255) bounds the
noise amplification at near-zero coverage — such texels are multiplied by
their tiny alpha at composite anyway, so residual error is second-order.
Negative results clamp to 0.

Why here: the unmix is only valid in the linear pre-tonemap domain, and the
tonemap quad is the single place every consumer (committed pass, live
preview, export) flows through. Alternatives rejected:

- *Premultiplied pipeline* (`rgb − (1−a)·B` kept undivided, stored
  premultiplied, runtime `(ONE, ONE_MINUS_SRC_ALPHA)`): exact compositing
  *and* exact filtering, but changes stored bundle semantics
  (`rgb=tonemapped-render` becomes premultiplied), the bake viewport, the
  grounding-shadow composition, and every existing consumer — a format-
  semantics change out of scope here. Recorded as the follow-up direction.
- *Zero the miss contribution at trace time*: not configurable —
  `sampleBackground` always samples the environment when the background
  map is absent; patching the vendored shader was rejected as invasive.
- *Runtime discard guard for low-alpha fragments*: rejected — it would
  trade bright seams for clipped AA edges and conflicts with the runtime
  spec scenario "Partial render-pass alpha never drops fragments". After
  the unmix, low-alpha texels composite correctly (faint correct color),
  so the guard is unnecessary.
- *Black Color background* (`scene.background = new Color(0)`): the library
  then sets `backgroundAlpha = 1`, destroying the coverage alpha the
  grounding-shadow composition and runtime blending rely on. Rejected.

### D2 — Measure `B` from the accumulated target's empty pixels

After accumulation completes, read the linear target (half-float readback
into `Uint16Array`, same pattern as the raster readback) and average RGB
over pixels with `a == 0` and nonzero RGB. Because the ortho miss direction
is constant, every miss sample returns the identical radiance, so empty
pixels converge to exactly `B` — the estimate is measurement-based (robust
to library internals like background blur or rotation) and, on a converged
target, deterministic given the tile grid. If no empty pixel exists, no miss
ray occurred and `B` is unused; pass 0.

Alternatives rejected: analytic CPU sampling of the equirect (duplicates the
shader's equirect/repacking math — drift risk); a second empty-scene PT pass
(doubles bake cost).

### D3 — Zero fully-empty texels in the same tonemap

`if (a == 0) { out = vec4(0) }` before (or instead of) the unmix. Enforces
"no background color anywhere" for the stored bytes and makes bilinear
filtering at zoom bleed black instead of sky. Consumers are unaffected:
the grounding-shadow composition keys on `alpha === 0` and overwrites RGB;
the runtime discards empty pixels via the g-buffer test; the bake viewport
composites over mid-grey through the alpha channel.

### D4 — Preview and multi-view slots share the path

`TONEMAP_FRAG` serves both the committed pass and the live converging
preview, and runs per view slot. Apply the unmix in both: during
accumulation `B` is estimated from whatever pixels have samples (unsampled
tiles are RGB 0 and excluded by the nonzero-RGB filter), so the preview
shows the fixed semantics immediately; the final tonemap re-estimates on
the converged target, which is what byte-determinism pins. Per-slot passes
each measure their own `B` (same environment, same value — computed
independently, no cross-slot coupling).

### D5 — No editor-state surface

This change touches only bake output bytes. No document, world, or editor
state is added or altered; nothing new is serialized anywhere (ADR 0006 —
in-memory editor state remains never serialized).

## Risks / Trade-offs

- [Old bundles keep contaminated edges] → expected; provenance re-bake
  refreshes an asset in place. Called out in docs, not migrated.
- [`npm run verify:bundles` primitive hashes diff] → that is the harness's
  purpose (regression signal); update expected hashes as part of the change
  and note the byte change in `docs/bake-pipeline.md`'s format-history
  table without a format bump (`/7` bytes change, `/7` stays `/7`).
- [Noise speckle at very low coverage] → `ε` floor plus alpha-weighting at
  composite keeps it sub-visible; the ACES shoulder compresses outliers.
  If it ever shows on foliage, the premultiplied follow-up removes the
  division entirely.
- [Residual dark shimmer at zoom from straight-alpha bilinear filtering] →
  inherent to straight-alpha storage; strictly better than today's white
  bleed, and the recorded follow-up (premultiplied) eliminates it.
- [`B` misestimate if the environment is pure black at the miss direction]
  → degenerate (unmix becomes a no-op: `B = 0`); no behavioral risk.

## Migration Plan

No data migration: bundles are content, not schema. Land the tonemap
change, update the verify harness's expected hashes, re-bake assets as
desired (provenance tracks the re-bake). Rollback is a plain revert;
newly baked bundles made with the fix remain valid `/7` either way —
only their edge pixels differ.

## Open Questions

None — the `ε` floor and clamps are tuning details answerable during
implementation against the scratch harness.
