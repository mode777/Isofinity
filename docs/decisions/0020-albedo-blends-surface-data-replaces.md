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

The blend function stays uniform; replace/preserve semantics ride on each
fragment output's **own alpha** (the `SRC_ALPHA` factor reads the alpha of
the same output):

- **Sprites:** `outAlbedo` keeps the coverage alpha — RT0 composites with
  the backdrop. `outGbuf` and `outDepth` ship alpha 1 — RT1 (world normal +
  depth) and RT2 (linear depth) **replace**: a silhouette fragment carries
  its own baked surface data, and the deferred pass shades every pixel with
  one surface's own data.
- **Contact shadows:** zero-weight, zero-alpha RT1/RT2 outputs — `dst·1 +
  src·0` preserves the surface behind, exactly as before.

The invariant for any future blended writer: **albedo may composite with
the backdrop; surface data may not.** A blended fragment must ship surface
data with alpha 1 (replace) or alpha 0 (preserve) — never coverage-weighted.

> WebGL2 note: per-draw-buffer blend entry points (`blendFunci` etc. from
> ES 3.0) are **not exposed** by the WebGL 2 API — per-output alpha is the
> portable mechanism. (A first attempt used `blendFunci` through a typed
> shim and crashed at runtime.)

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
  edits to every fragment shader's output declarations.
- **Per-draw-buffer blend (`blendFunci`)** — not exposed by the WebGL 2
  API; a typed shim compiled but threw `undefined is not a function` at the
  first draw.
- **Second, blend-disabled sprite pass for surface data** — doubles the
  sprite draw cost; the alpha mechanism achieves it free.
- **Fixing it in the light pass** (reconstructing per-surface factors) —
  the g-buffer would still hold ill-defined data; the defect is at the
  write, not the read.
