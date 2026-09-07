## Why

Placed sprites touch the ground only along their silhouette edge — there is
no ground darkening under them, so assets look pasted onto the world plane.
The engine's baked light is deliberately diffuse (HDRI environments without a
dominant sun direction), so a grounding shadow baked into the sprite is
direction-agnostic: it survives the free-moving world sun without any
pinning or fade machinery, and makes placed objects look grounded at
negligible runtime cost. This is the classic prerendered-sprite shadow
(Fallout/Diablo-era), restated in Isofinity's per-pixel-data terms.

## What Changes

- Bake side: a new optional **grounding-shadow** step derives a soft
  ground-space occlusion mask from the already-baked g-buffer (footprint
  unprojection + blur — no new renderer, no path-tracer involvement) and
  flattens it into the render pass's empty pixels as dark, mid-alpha texels.
  The bake editor gets a per-document toggle (default on) so baking the
  shadow is optional.
- The sprite rect grows to contain the shadow reach (projected-cube corners
  unioned with the projected ground extent); `originPx` recomputes from the
  same projection, so placement anchoring math is unchanged.
-   Provenance records the toggle (`groundShadow: false` when the user
  disables it; omitted at the on default, so legacy bundles stay
  byte-compatible) so re-bakes reproduce the look; no format bump
  (optional provenance field, `bake.tiles` precedent).
- Runtime: the sprite fragment shader gains a third pixel class —
  g-buffer-empty, render-alpha-positive pixels blend as the shadow (no
  shading) and write their **true ground-plane depth** (analytic ray/ground
  intersection, GLSL twin of the shared iso unprojection) instead of the
  object depth. The existing single instanced batch, LEQUAL test and alpha
  blending are unchanged; the depth buffer resolves shadow/sprite
  interleaving pixel-accurately.
- Raised placements (`height != 0`) suppress the baked shadow at runtime
  (the shader knows the per-instance height); the existing contact-shadow
  ellipses keep covering that case.
- Re-baseline: every re-baked render pass changes bytes, so
  `scratch-verify` primitive hashes shift; the bundle/mesh verify harnesses
  gain Node-runnable checks for the new mask math.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `asset-baking`: the optional render pass may carry a baked grounding
  shadow in its empty pixels, controlled by a bake-editor toggle and
  recorded in provenance; sprite rect derivation grows to contain the
  shadow reach.
- `runtime-sprite-rendering`: sprite compositing gains the shadow pixel
  class — blended without shading, writing true ground-plane depth,
  suppressed for raised placements; g-buffer-driven occlusion semantics
  unchanged.

## Impact

- `src/bake/` — shadow mask derivation (footprint splat from g-buffer world
  positions + blur) and render-pass composition step; `src/bake/iso.ts`
  rect derivation union; editor toggle in the sprite properties panel;
  provenance read/write.
- `src/runtime/renderer.ts` — sprite fragment shader classification,
  ground-plane depth path, per-instance height suppression.
- `src/shared/iso.ts` — ground-plane unprojection helper shared by the new
  shader math (CPU reference twin).
- Format: no bump; optional `provenance.groundShadow` field; old bundles
  load unchanged (no shadow pixels, runtime classification simply never
  fires).
- Docs: `docs/bake-pipeline.md` (pass conventions + format-history note),
  `docs/runtime.md` (Display/Renderer sections), `docs/glossary.md`
  (grounding shadow), `docs/roadmap.md`. An ADR is warranted: the
  ground-plane-depth-write rule (transparent pixels that must not claim
  object depth) is a durable compositing invariant future shadow work
  (real shadow mapping, decals) must respect.
- Non-goals (explicitly out of scope): directional cast shadows, shadows
  received by sprites/meshes from other objects, a separate shadow pass or
  format `/7`, world-space accumulated shadow maps, changing the
  shadow-blend behavior of the Dynamic light switch (the baked shadow stays
  visible with dynamic light off, like the prerender itself), presets
  carrying the toggle.
