## Why

Sprite silhouettes show a pale outline in front of dark backdrops — the
original bright-seam complaint's second half. Root cause (root cause 2 of
the investigation in `fix-sprite-edge-fringe`): the sprite pass draws with
one blend function shared by all three MRT attachments, so at partial
coverage the fragment's g-buffer normal and linear depth are coverage-blended
with whatever surface data sits behind (ground, grounding-shadow patch,
another sprite). The deferred light pass then shades that chimera with a
ground-like factor; over a lit backdrop the ring's factor equals the
backdrop's factor and is invisible, but in front of a shadow (pre-baked
patch or realtime directional shadow) the ring is lit at nearly full key
light against an ambient-only backdrop — a pale outline. A re-bake cannot
fix this: the blending happens fresh every frame in the compositor.

## What Changes

- Per-draw-buffer blend state in the geometry pass (WebGL2 `gl.blendFunci`):
  sprite fragments keep alpha-blending albedo (draw buffer 0) but REPLACE
  the g-buffer and linear-depth attachments (draw buffers 1/2), so
  silhouette pixels carry the object's own baked normal and depth — never
  a blend with the surface behind.
- The contact-shadow pass's zero-weight trick (zero-alpha outputs that only
  preserved the data behind under uniform blending) becomes an explicit
  keep-blend `(ZERO, ONE)` on buffers 1/2; albedo keeps its alpha blend.
- The deferred light pass and both fragment shaders are unchanged: they
  already assume the g-buffer holds one surface's data per pixel.
- Residual edge error drops to `(1-c)·backdropTexel·(factorObj −
  factorBackdrop)` — negligible: grounding tint is near-black and factors
  match over lit ground.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-deferred-lighting`: Sharpen "The screen-space g-buffer covers
  all geometry" — surface data (normal, depth) is written unblended at
  partial coverage; only albedo composites with the backdrop. Adds the
  silhouette scenario whose absence let the chimera shading ship.

## Impact

- `src/runtime/renderer.ts` only: per-buffer blend setup in the sprite and
  contact-shadow passes (and any state reset around them). No shader
  changes; selection/picking, occlusion (gl_FragDepth), and the
  grounding-shadow pixel classifier are untouched.
- Deferred-light golden hashes in the browser scratch harness will diff
  (edge shading changes) — the expected regression signal.
- **Format-version impact: none.** Runtime-only; bundles, worlds, and
  manifest semantics unchanged.
- Docs: `docs/runtime.md` (what the sprite pass writes per attachment),
  `docs/roadmap.md` (when landed). A short ADR is warranted (0020:
  "surface data is never coverage-blended — albedo blends, g-buffer/depth
  replace") since it is a compositing invariant future passes must respect.
- Non-goals: premultiplied albedo storage (ADR 0019 follow-up), changes to
  the deferred light pass or shadow visibility, painter-sort or depth-test
  behavior, and any mesh/ground pass changes (they draw opaque).
