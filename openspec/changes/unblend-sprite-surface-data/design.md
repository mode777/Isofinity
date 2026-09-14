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

### D1 — Per-draw-buffer blend with `gl.blendFunci`

WebGL2's `gl.blendFunci(buffer, src, dst)` sets the blend per draw buffer:

- **Sprite pass:** buffer 0 keeps `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`;
  buffers 1 and 2 get `(ONE, ZERO)` (replace). `outGbuf`'s alpha channel
  now lands unblended (the sprite's bake depth), and `outDepth`'s marker
  alpha stays 1.
- **Contact-shadow pass:** buffer 0 unchanged; buffers 1 and 2 get
  `(ZERO, ONE)` (keep) — an explicit form of the zero-alpha trick the
  FLAT_SHADOW_FRAG comment describes, which only worked under uniform
  blending. The shader's zero-weight outputs stay (harmless with a keep
  blend).
- **All other passes** (ground, mesh, overlay, deferred) already draw with
  BLEND disabled or set their own func — untouched.

Set the per-buffer state once per pass right where `gl.enable(gl.BLEND)`
happens today (sprite pass at `renderer.ts:2037`, contact shadows at
`renderer.ts:1997`); the global `gl.blendFunc` at init stays as the buffer-0
default. No state leakage: `blendFunci` state is persistent per buffer, and
every BLEND consumer in the file sets what it needs at draw time.

Alternatives rejected:

- *Dual-source blending* (`gl.bindFragDataLocationIndexed`, src1 alpha) —
  changes every fragment shader's output declarations for the same result;
  per-buffer blend is state-only.
- *Zero-weight outputs under the current uniform blend* — that is today's
  behavior; it does not fix the sprite case (whose g-buffer outputs carry
  real data and real alpha).
- *Separate transparent pass writing surface data with blending disabled* —
  a second full sprite draw per frame; state-only blending achieves it free.

### D2 — Contact shadows keep the keep-blend, not replace

The grounding patch pixels themselves (SPRITE_FRAG's shadow branch) write
`outGbuf = vec4(0, 1, 0, a)` and ground-plane depth — with replace
semantics they now write exactly what the spec already pins ("map to the
ground plane") instead of blending it with the data behind. Contact-shadow
ellipses (the mesh contact shadows and hover ring) keep preserving whatever
is behind: `(ZERO, ONE)` on buffers 1/2. Their albedo blend is unchanged.

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
  any blended writer of buffers 1/2 must set its own per-buffer state.
- [Patch pixels replace data behind instead of blending] → strictly closer
  to the pinned spec (they map to the ground plane); painter order and
  depth test already decide which patch wins, unchanged.

## Migration Plan

Runtime-only, no data. Land, run the gates, refresh the browser golden-hash
notes. Rollback is a revert; nothing persists.

## Open Questions

None.
