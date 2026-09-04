# 0003 — Multiplicative shading of the prerendered image

Status: Accepted (2026-09-02; commit 388862a's additive experiment
rejected)

## Context

Baked sprites carry their own light (the prerender is a lit image), yet the
runtime must respond to dynamic lights (POE-style key + ambient over the
baked g-buffer normals). Two compositing models were tried.

## Decision

The prerendered texel is shaded **multiplicatively** in linear space:

```
color = linearToSrgb(srgbToLinear(render) × (ambient + key × max(dot(N, L), 0)))
```

- The dynamic factor multiplies the sRGB-decoded render texel; the result
  is re-encoded to sRGB. This double-shades (the prerender already carries
  baked light) — the accepted trade of the experiment.
- Ambient is a color and acts as the classic POE fill term (keeps unlit
  sides from going black) and applies to baked sprites.
- The **Dynamic light** switch pins the factor to identity
  (ambient = white, key = black): sprites show the pure prerendered image,
  the ground its flat vertex color. Under the earlier additive experiment
  the disabled path zeroed both terms, which under multiply would be black
  — identity is the only correct "off".

## Consequences

- One shading definition serves every drawable (sprites, ground); no
  shader branches for baked vs unlit.
- Shadowed sides go ambient-dark and already-bright pixels can clip where
  the factor exceeds 1 — accepted; `linearToSrgb` clamps.
- If a future change wants true relighting, an albedo-class input must be
  reintroduced (see ADR 0002's rejected alternatives) — the g-buffer alone
  cannot undo the prerender's baked light.

## Rejected alternatives

- **Additive key light on top of the prerender** (shipped first, visually
  rejected): reads as glow, cannot darken, and the light switch had no
  "off" that matched the spec.
- Luminance-aware scaling / screen-blend modes: mitigation deferred until
  plain multiply reads badly in practice.
