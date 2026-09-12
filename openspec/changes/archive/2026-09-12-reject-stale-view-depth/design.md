# Design — reject-stale-view-depth

## Context

ADR 0005 fixed the multi-view bake to rotate the model, not the camera.
Bundles written by the preceding implementation keep loading: `/6` shape
is identical, and the manifest never recorded a per-slot view direction
beyond the slot identifier. The wrongness only becomes visible after the
EXR decodes: those slots' depth values are `dot(p, V_slot)` over the
*unrotated* box, which goes negative (E/W min −0.6124, S min −1.2247 for
a unit cube), while every valid bake is bounded by the manifest's
`depth.range` = `[0, Σ|VIEW_DIRᵢ·sizeᵢ|]` — the reference plane through
the origin and all-positive `VIEW_DIR` components make negative depth
impossible by construction. The end-to-end math for valid bundles was
verified numerically during exploration (exact ground contact for all
four slots), so a load-time range check cannot false-positive on current
output.

## Goals / Non-Goals

- Goal: stale slot data can never reach a placement; the user is told
  which slot and why, per the project's named-error convention.
- Goal: valid bundles (all eras) load byte-for-byte unchanged.
- Non-goal: detecting in-range-but-wrong depth; auto-recovery; changes to
  `parseBake` (container level — the EXR is opaque there).

## Decisions

### D1 — Check at `loadBundleViews`, after EXR decode

`parseBake` slices blobs without decoding them; the depth becomes
inspectable only in `decodeExrGbuffer` (assets.ts). `loadBundleViews`
is the single place every *placeable* path funnels through (world open,
brush pick), so the guard lives there, over the already-decoded
`Uint16Array` half floats.

*Rejected: check in `parseBake`* — would force every reader (including
view-only and verification paths) to decode EXRs, and container parsing
stays format-only by convention.
*Rejected: check in the world store call sites* — duplicates logic and
leaves future `loadBundleViews` callers unguarded.

### D2 — Validity = decoded depth within `manifest.depth.range` ± epsilon

Covered pixels only (non-zero g-buffer normal — depth of empty pixels is
meaningless). Epsilon = 0.002: half-precision ulp at the range's top
(~1.72 for a unit cube) is ≈0.00098, so the epsilon tolerates two ulps of
rounding while staying ~300× below the smallest stale signature
(−0.6124). Both bounds are exact invariants of valid bakes: depth ≥ 0
(reference plane at the origin, all-positive `VIEW_DIR`), depth ≤
`Σ|VIEW_DIRᵢ·sizeᵢ|` (box max corner). The north view and every extra
view run the same check.

*Rejected: negative-only check* — simpler, but the upper bound is free
and catches corruption symmetrically; the manifest already records the
range.
*Rejected: recompute the expected range from `cube.size`* — the manifest
range is authoritative and already shipped; recomputing would second-
guess bundles the format promises to tolerate.

### D3 — North fails the load; extras skip with a named note

Mirrors the existing rendered-pass rule exactly (north without render →
bundle fails; extra without render → skipped with note). `BundleViews`
gains the skip *reason*: `skipped: { slot, reason }[]` replaces the bare
`ExtraViewSlot[]`. World-open and brush-pick call sites compose the
reason into their existing status notes ("no render pass, direction(s)
unavailable" gains a stale-depth variant).

*Rejected: reject the whole bundle on any stale extra* — throws away a
placeable north for one bad slot; the skip mechanism already exists and
saved placements fall back to north with a note.
*Rejected: load the stale view and clamp its depth* — silently corrupt
data is exactly what this change exists to stop.

### D4 — `views-verify` builds a stale bundle synthetically

The verify harness already constructs `/6` bundles with hand-built pass
data. New case: an E-view g-buffer whose alpha contains a negative depth
(e.g. −0.5) → `loadBundleViews` skips `e` with a stale-depth reason and
keeps `n`; a north-view variant rejects with a named error. A control
bundle with in-range depth still loads all views.

## Risks / Trade-offs

- [False positive on a valid bundle with unusual geometry] → Depth bounds
  are exact invariants of the bake (box-anchored, all-positive view
  vector); the raster cube-clip discards out-of-box fragments, and the
  epsilon absorbs half rounding. The verify case plus the boot-primitive
  bakes exercise the guard against known-good data.
- [Older legitimate bundles carry manifests with degenerate/missing
  `depth.range`] → `parseBake`-validated manifests have carried the depth
  block since `/4`; a missing or non-finite range falls back to the
  lower-bound-only check (`[0, ∞)`), so the unambiguous negative
  signature still fires.
- [Users with stale bundles see new skip notes] → That is the intended
  behavior change; the note names the fix (re-bake). North still loads,
  so worlds degrade to north-facing placements, matching the existing
  saved-direction fallback rule.

## Migration Plan

None needed: no format change, no persisted-state change. The skip notes
are editor status text; placement persistence is untouched (in-memory
editor state, never serialized — ADR 0006). Rollback = revert the commit.

## Open Questions

None.
