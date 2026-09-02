## Why

Baked-mode sprites currently display their path-traced render pass as a
static image the dynamic light cannot touch, so a lit sprite and the scene's
key light visibly disagree and the Dynamic light switch does nothing to
them. Applying the existing directional light to prerendered sprites is the
cheapest way to make the dynamic light affect them — an experiment that
informs a later asset-format pivot without committing to it.

Pivot note: the first experiment shipped an **additive** composite
(commit 388862a) and was rejected on visual review; this revision switches
the composite to **classic multiplicative lighting** — the same shading
math the unlit path already uses, applied to the prerendered texel.

## What Changes

- Baked display mode no longer shows the render pass untouched: the runtime
  shades it with the dynamic key + ambient lights using classic
  multiplicative lighting — `linear-decode(render) × (ambient + key·NdotL)`
  over the baked g-buffer normal, re-encoded to sRGB — the same `shade()`
  math as the unlit path, keeping the render pass's alpha for blending.
- The ambient slider now applies to baked sprites too, as the classic fill
  term (with additive it had no meaning; with multiply it keeps unlit sides
  from going black).
- The global **Dynamic light** switch pins shading to identity: disabled,
  baked sprites show the pure prerendered image and unlit sprites show raw
  albedo. This is implemented by uploading an identity ambient with a zero
  key light (zeroing both would render everything black under multiplicative
  shading). As a side effect this fixes a pre-existing bug: with the switch
  off, unlit sprites previously rendered black, contradicting the archived
  spec's "albedo as-is".
- Scope is runtime-only: bake tool, bundle format (`isoinfinity-bake/4`),
  boot bakes, occlusion, hit-testing, depth writes, and painter sort are
  unchanged. Boot-baked primitives have no render pass and keep displaying
  unlit as today. Per-sprite baked/unlit display modes remain.

Assumptions recorded (deliberate, low-stakes for an experiment):
- The multiplicative factor is applied to the tonemapped prerender texel
  decoded to linear space, same convention as the unlit path.
- Double-shading is accepted: the prerender already carries baked light, so
  multiplying by the dynamic factor darkens/re-shades it. That trade is the
  experiment.
- No luminance-aware scaling or blend-mode fallback in this change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-sprite-rendering`: baked display mode changes from "prerendered
  image as-is" to "prerendered image shaded by the dynamic key + ambient
  lights (multiplicative) over baked normals", and the global dynamic-light
  switch changes from "no effect on baked sprites" to "pins shading to
  identity" (off = pure prerendered image; unlit off = raw albedo, now
  actually true in code).

## Impact

- `src/runtime/renderer.ts` — baked branch of `SPRITE_FRAG`: reuse `shade()`
  on the render-pass sample instead of the passthrough/additive composite.
- `src/runtime/main.ts` — disabled path of `updateLightUniforms()` uploads
  `ambient = (1,1,1)`, `key = 0` instead of zeroing both; comment updated.
- `docs/runtime.md` — Display modes / Lighting sections describe baked mode
  as multiplicative shading and the switch as identity-pinning.
- No asset-format, bake-tool, or bundle changes; existing `/3` and `/4`
  bundles keep loading.
