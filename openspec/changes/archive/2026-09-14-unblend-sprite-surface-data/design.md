## Context

The geometry pass renders into one framebuffer with three color attachments
(albedo, g-buffer, linear depth) via `drawBuffers`, and state carries a
single `gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` set once at init. The
sprite pass enables BLEND; every attachment blends with the same function,
so SPRITE_FRAG's `outGbuf = vec4(g.rgb, r.a)` and `outDepth =
vec4(d, 0, 0, 1)` are coverage-blended into the data behind. LIGHT_FRAG
shades every non-empty pixel from that data (`renderer.ts:547-556`), so a
silhouette pixel over ground is lit with half the ground's normal, half its
depth — a ground-like factor that only contrasts when the backdrop is
shadowed. See the proposal for the full mechanism; this change touches only
blend state in `src/runtime/renderer.ts`.

## Goals / Non-Goals

**Goals:**

- Silhouette fragments write the object's own g-buffer normal and depth
  (replace semantics); only albedo composites with the backdrop.
- Contact shadows keep their exact current behavior: albedo blends, the
  g-buffer/depth behind them is preserved bit-for-bit.
- No shader edits; selection, occlusion (gl_FragDepth), the grounding-shadow
  pixel classifier, painter order, and depth-test semantics unchanged.

**Non-Goals:**

- Premultiplied albedo storage (ADR 0019 follow-up) and any change to the
  deferred light pass, shadow visibility, or the ground/mesh passes (they
  draw opaque with blending disabled).
- Re-deriving the light pass's per-pixel factor model (ADR 0011) — the fix
  is making the data it reads well-defined, not changing how it shades.

## Decisions

### D1 — Replace-through-alpha under the shared blend function

The blend function stays uniform (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`); the
sprite fragment achieves replace semantics per attachment through each
output's own alpha — the SRC_ALPHA factor reads the alpha of that output:

- `outGbuf` (RT1) alpha 1.0 → RT1 replaces (was the coverage `r.a`, which
  coverage-blended the normal — the defect).
- `outDepth` (RT2) already carried alpha 1 → already replaced; unchanged.
- `outAlbedo` (RT0) keeps the coverage alpha → albedo still composites.

No per-draw-buffer state is needed. Rejected first approach: WebGL2's
`gl.blendFunci` per-buffer blend — **not exposed by the WebGL 2 API**
(the ES 3.0 indexed blend entry points are omitted; the TS DOM lib omits
them too), so calling it threw at the first draw and blacked the canvas.
The alpha-based form is also cheaper: no extra state, same result.

The grounding-shadow branch's RT1 write gets the same treatment
(`vec4(0, 1, 0, 1)`): patch pixels replace their pinned up normal instead
of blending it with the surface behind.

### D2 — Contact shadows keep the zero-weight trick

Their RT1/RT2 outputs are `vec4(0)` with alpha 0 — under the shared blend
`result = dst·1 + src·0`, the data behind is preserved exactly. This was
correct all along; the only blended surface-data writer was the sprite
path. Their albedo blend is unchanged.

### D3 — Static verification where GL cannot run

`verify:selection` and `verify:shadows` cover the CPU consumers of the
g-buffer and shadow field; neither exercises GL blend state (Node has no
context), so the blend change is verified by `npm run build`, the two Node
verifiers staying green, and the browser harness: the deferred-light spike's
golden hashes will diff — that diff IS the edge-shading fix. A visual check
(silhouette over dark ground, light on/off) lands with the user.

## Risks / Trade-offs

- [Deferred golden hashes diff] → expected signal; update the harness notes
  like the bake change did.
- [Selection reads blended edge normals today] → after the fix, edge
  normals are purer (full object normal); silhouette coverage for picking
  still comes from g-buffer emptiness, which is unchanged — `verify:selection`
  must stay green to confirm.
- [A future pass assumes uniform blending] → the ADR records the invariant:
  a blended writer of buffers 1/2 must ship surface data with alpha 1
  (replace) or alpha 0 (preserve) — per-output alpha is the mechanism.
- [Patch pixels replace data behind instead of blending] → strictly closer
  to the pinned spec (they map to the ground plane); painter order and
  depth test already decide which patch wins, unchanged.

## Migration Plan

Runtime-only, no data. Land, run the gates, refresh the browser golden-hash
notes. Rollback is a revert; nothing persists.

## Open Questions

None.
