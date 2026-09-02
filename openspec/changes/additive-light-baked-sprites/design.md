## Context

The runtime renderer (`src/runtime/renderer.ts`) draws each sprite through
one instanced-quad fragment shader with two branches: **unlit** shades the
albedo with `albedo_linear × (ambient + key·NdotL)`, **baked** passes the
path-traced render pass through untouched
(`outColor = texture(uRender, ...)`). Light uniforms (`uLightDir`,
`uKeyLight`, `uAmbient`) are global and shared by the sprite and flat
(ground/highlight) programs; `updateLightUniforms()` in
`src/runtime/main.ts` already zeroes key and ambient when the Dynamic light
switch is off, but the baked branch never consumes them, so the switch
cannot affect baked sprites. Occlusion, `gl_FragDepth`, and hit-testing are
g-buffer/coverage driven and must not change (existing requirement).

See proposal.md for motivation; the delta spec
(`specs/runtime-sprite-rendering/spec.md`) holds the behavior contract.

## Goals / Non-Goals

**Goals:**

- Baked mode becomes "prerendered image + additive key light" with the
  light params the runtime already has (azimuth/elevation direction, color,
  intensity).
- The Dynamic light switch cleanly toggles the effect: off = exactly
  today's baked appearance.
- No new assets, passes, uniforms beyond what exists; nothing else about
  the pipeline moves.

**Non-Goals:**

- No albedo/AO pass removal, no `isoinfinity-bake/5`, no bake-tool changes
  (the format pivot stays a separate future change).
- No luminance-aware scaling, screen-blend mode, or multiplicative tint
  term (night mode) — mitigation only if plain additive reads badly.
- No change to ambient semantics for the unlit path; no per-sprite ambient.

## Decisions

### D1: Add in linear space, output through the existing sRGB encode

Baked branch becomes:

```glsl
vec3 base = srgbToLinear(renderTexel.rgb);
float ndl = max(dot(gbufferNormal, uLightDir), 0.0);
outColor = vec4(linearToSrgb(base + uKeyLight * ndl), renderTexel.a);
```

The SHADE_CHUNK already exposes both transfer functions, so this is a
branch-local change. Alternative: add directly in sRGB space (skip both
conversions) — cheaper and softer-looking, but the added term then has a
different perceptual weight per pixel and disagrees with how the unlit path
computes the same light; keeping one linear-space definition of "the key
light" makes the two modes comparable, which is the point of the
experiment.

### D2: No ambient term for baked sprites

`uAmbient` is a scalar floor for the albedo multiply; as an additive term it
would just brighten the whole image uniformly with no shape. The ambient
slider keeps affecting unlit sprites only. Alternative: repurpose ambient as
a second additive omni term — rejected as scope creep for an experiment.

### D3: The switch works by zeroing uniforms — no new code path

`updateLightUniforms()` already uploads `key = ambient = 0` when disabled;
once the baked branch consumes `uKeyLight`, off = `base + 0` = pure
prerender, and the flat program keeps the ground in sync (flat when off,
key-lit when on) exactly as today. No new uniform, no shader recompile, no
per-instance flag. Alternative: a dedicated `uAddStrength` uniform — only
needed if baked sprites ever need light *independent* of the unlit path's
light; not now.

### D4: Highlight stability is preserved by construction

The additive term uses the same g-buffer normal sample the unlit branch
uses and the same global `uLightDir`, so baked and unlit sprites respond
identically to direction changes. Edge pixels keep blending with the render
pass's AA alpha, unchanged from today's baked path.

## Risks / Trade-offs

- [Double lighting / blown highlights where baked HDRI and key light agree]
  → Accepted for this experiment; plain additive is the baseline being
  tested. If it reads badly, luminance-aware scaling
  (`uKeyLight * ndl * (1 - luma)`) is a two-line follow-up, deliberately
  out of scope.
- [After-tonemap add is physically wrong — light added to an ACES-compressed
  image can exceed 1 and clip hard] → `linearToSrgb` clamps; accept as part
  of the "convincing, not correct" framing.
- [Interpenetrating baked sprites pop where the additive term differs across
  the occlusion boundary] → Inherent to per-pixel occlusion of shaded
  sprites; the unlit path already has this property, so behavior is
  consistent, not new.
- [Docs/specs drift: `docs/runtime.md` describes baked mode as passthrough
  and the switch as not affecting baked sprites] → Doc update is a task; the
  delta spec is the source of truth meanwhile.

## Migration Plan

Single deploy of the runtime page; no asset, bundle, or persisted state
changes. Rollback = revert the commit; nothing to migrate.

## Open Questions

None deferrable — D1/D2/D3 settle the behavior the spec pins down; visual
quality is the experiment's output, not an open question.
