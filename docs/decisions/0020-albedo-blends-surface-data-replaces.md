# 0020 — Albedo blends, surface data replaces

Status: Accepted (2026-09-15, change `unblend-sprite-surface-data`)

## Context

The geometry framebuffer's three attachments shared one blend function
(`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`). For sprites — the only blended writers
of surface data — that meant a silhouette fragment's g-buffer normal and
linear depth were coverage-blended with whatever surface was behind
(ground, grounding patch, another sprite). The deferred light pass shades
every non-empty pixel from that data, so edges were lit with a chimera
surface: invisible over a lit backdrop (whose factor the blend already
matched), a pale ring in front of any shadow (pre-baked patch or realtime
directional), where the ring kept a ground-like full-key factor against an
ambient-only backdrop.

## Decision

Per-draw-buffer blend state (`gl.blendFunci`), set by each blended pass at
draw time:

- **Sprites:** RT0 composites straight alpha; RT1 (world normal + depth)
  and RT2 (linear depth) use `(ONE, ZERO)` — replace. A silhouette
  fragment writes its own baked surface data; the backdrop shows through
  via the albedo blend alone. The deferred pass then shades every pixel
  with one surface's own data.
- **Contact shadows:** RT1/RT2 use `(ZERO, ONE)` — keep. This replaces the
  old zero-weight-output trick, which only preserved the data behind under
  the uniform blend.

The invariant for any future blended writer: **albedo may composite with
the backdrop; surface data may not.** Whatever a blended fragment writes to
the g-buffer or depth attachments must be one surface's own data, replaced
or preserved — never a coverage-weighted mix.

## Consequences

- The deferred pass's per-pixel factor is well-defined at silhouettes; the
  edge error drops to `(1−c)·backdropTexel·(factorObj − factorBackdrop)` —
  negligible (grounding tint is near-black; factors match over lit ground).
- Grounding-patch pixels now replace (instead of blend) their pinned
  ground-plane depth + up normal — strictly closer to what ADR 0010 and the
  spec already pinned; painter order and the LEQUAL depth test still decide
  which patch wins.
- No shader or light-pass changes; occlusion (`gl_FragDepth`), picking
  (g-buffer emptiness), and painter order are untouched.
- Deferred-light golden hashes in the browser harness diff — the expected
  regression signal.

## Rejected alternatives

- **Dual-source blending** (indexed fragment outputs) — same result with
  edits to every fragment shader's output declarations; per-buffer blend is
  state-only.
- **Second, blend-disabled sprite pass for surface data** — doubles the
  sprite draw cost; state-only blending achieves it free.
- **Fixing it in the light pass** (reconstructing per-surface factors) —
  the g-buffer would still hold ill-defined data; the defect is at the
  write, not the read.
