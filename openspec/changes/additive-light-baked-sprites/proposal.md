## Why

Baked-mode sprites currently display their path-traced render pass as a
static image the dynamic light cannot touch, so a lit sprite and the scene's
key light visibly disagree and the Dynamic light switch does nothing to
them. Applying the existing directional light additively over the prerendered
image is the cheapest way to make the dynamic light affect prerendered
sprites and to see whether that composite is convincing — an experiment that
informs a later asset-format pivot without committing to it.

## What Changes

- Baked display mode no longer shows the render pass untouched: the runtime
  adds the current key light contribution (direction from the azimuth/
  elevation sliders, color × intensity, gated by `max(dot(N, L), 0)` over
  the baked g-buffer normals) **additively** on top of the prerendered
  image, computed in linear space, before the final sRGB encode.
- The global **Dynamic light** switch now gates the additive overlay:
  disabled, baked sprites show the pure prerendered image (today's baked
  appearance); enabled, they receive the additive key light.
- The ambient slider stays meaningful only for the unlit (albedo) path;
  baked sprites receive no ambient term (an ambient add on an already-lit
  image only brightens everything flat).
- Scope is runtime-only: bake tool, bundle format (`isoinfinity-bake/4`),
  boot bakes, occlusion, hit-testing, depth writes, and painter sort are
  unchanged. Boot-baked primitives have no render pass and keep displaying
  unlit as today. Per-sprite baked/unlit display modes remain.

Assumptions recorded (deliberate, low-stakes for an experiment):
- Additive contribution is computed in linear space (decode the sRGB render
  texel, add, re-encode) — light added in sRGB space looks flatter.
- The ground keeps its current behavior: key-lit when dynamic light is on,
  flat vertex color when off.
- No luminance-aware scaling or screen-blend fallback in this change; plain
  additive first, mitigate only if it reads badly.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-sprite-rendering`: baked display mode changes from "prerendered
  image as-is" to "prerendered image + additive key light over baked
  normals", and the global dynamic-light switch changes from "no effect on
  baked sprites" to "toggles the additive overlay" (off = pure prerendered
  image).

## Impact

- `src/runtime/renderer.ts` — baked branch of `SPRITE_FRAG`: additive
  composite over the render-pass sample instead of the passthrough.
- `src/runtime/main.ts` — `updateLightUniforms()` no longer special-cases
  baked sprites as unaffected; the enabled/off path now also zeroes the
  additive overlay (light uniforms are already global, so this may be only
  a comment/semantics fix).
- `docs/runtime.md` — Display modes / Lighting sections describe baked mode
  as passthrough and the switch as not affecting baked sprites; both need
  updating.
- No asset-format, bake-tool, or bundle changes; existing `/3` and `/4`
  bundles keep loading.
