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

### D1: Classic multiplicative shading via the existing `shade()` (revised)

The first experiment (commit 388862a) added the key light **additively** on
top of the prerender; visual review rejected it. The baked branch now
applies the same multiplicative shading as the unlit path to the render
texel:

```glsl
vec4 r = texture(uRender, vec3(vUv, vLayer));
outColor = vec4(shade(r.rgb, g.rgb), r.a);
```

One shading definition for both modes: the dynamic factor
`(uAmbient + uKeyLight * ndl)` multiplies the linear-decoded texel. Applied
to albedo this is POE-classic relighting; applied to the already-lit
prerender it double-shades — the accepted trade of the experiment.
Alternatives: additive (shipped, rejected — reads as glow, cannot darken),
or luminance-aware/screen blends (deferred mitigation).

### D2: Ambient applies to baked sprites as the fill term (revised)

Under multiply, `uAmbient` regains its classic POE role: the fill that
keeps unlit sides from going black, and it must apply to baked sprites too
or the two modes diverge in shadow. (Under additive this term was excluded
— that decision is obsolete.)

### D3: The switch pins shading to identity — ambient `(1,1,1)`, key `0`

With multiplicative shading, the previous disabled upload (key 0, ambient
0) is a multiply-by-zero: everything black. The disabled path now uploads
`ambient = (1,1,1)`, `key = (0,0,0)`, making the factor `(1 + 0·ndl) = 1`:
baked sprites show the pure prerender, unlit sprites raw albedo, the ground
its flat vertex color. No new uniforms, no shader branches.

This also fixes a pre-existing inconsistency: the archived spec already
says unlit sprites show "albedo as-is" when disabled, but the zeroed
uniforms rendered them black — code never matched the spec until now.
Surfaced to the user as a deliberate fix, not a silent change.

### D4: Highlight stability is preserved by construction

The baked branch uses the same `shade()`, g-buffer normal sample, and
global `uLightDir` as the unlit branch, so both modes respond identically
to light changes. Edge pixels keep blending with the render pass's AA
alpha, unchanged.

## Risks / Trade-offs

- [Double-shading: the prerender already carries baked light; multiplying
  darkens and re-shades it, and shadowed sides go ambient-dark] → That is
  the experiment being run, not a defect to fix here.
- [Highlight clipping where the factor exceeds 1 over already-bright baked
  pixels] → `linearToSrgb` clamps; accepted.
- [Unlit sprites change behavior when the switch is turned off: black → raw
  albedo] → Deliberate fix aligning code with the archived spec ("albedo
  as-is"); called out in the proposal.
- [Docs/specs drift] → Doc update is a task; the delta spec is the source
  of truth meanwhile.

## Migration Plan

Single deploy of the runtime page; no asset, bundle, or persisted state
changes. Rollback = revert the commit; nothing to migrate.

## Open Questions

None deferrable — D1/D2/D3 settle the behavior the spec pins down; visual
quality is the experiment's output, not an open question.
