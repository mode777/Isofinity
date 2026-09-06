## Context

Material zips are matched by `matchMaterialMaps` in
`src/app/groundMaterial.ts` via a single slot regex
`(?:^|_)(diff|arm|nor_gl)_[^/]*\.(exr|png|jpe?g)$`. The matching is pure
and Node-verifiable, and the existing behavior (first match per slot
wins, later matches reported as duplicates) is pinned by
`openspec/specs/runtime-ground-rendering`. No bundle format or stored
state is involved — this is workspace-file parsing only.

## Goals / Non-Goals

**Goals:**

- Accept `diffuse` as a diffuse-slot file-name component everywhere the
  `diff` slot is currently matched, with identical downstream decoding
  (EXR → linear, png/jpg → sRGB).
- Keep `diff` precedence deterministic and reported.

**Non-Goals:**

- Other slot aliases (`albedo`, `basecolor`, `normal`, …).
- Changes to bake conventions, bundle format, or world serialization.

## Decisions

1. **Alias normalization in the regex, not a pre-pass.** Change the slot
   capture to `(diffuse|diff|arm|nor_gl)` and map `diffuse` → `diff`
   when constructing the `MaterialSlot` key. Listing `diffuse` before
   `diff` in the alternation is required: the regex alternation is
   ordered, and `diff_` and `diffuse_` are disjoint after the required
   trailing `_`, but ordering by descending length keeps the intent
   obvious. Alternative considered — matching a prefix and string-
   trimming — was rejected as more code for the same result.

2. **Precedence falls out of existing first-match logic.** `diff` and
   `diffuse` both normalize to the `diff` slot, so the existing
   "first match per slot wins; others become duplicate notes" path
   already yields the pinned precedence *for the order entries appear
   in the zip*. To make `diff` beat `diffuse` regardless of entry
   order, sort the candidate list for the `diff` slot so exact-`diff`
   names come first before picking the winner. Alternative — rejecting
   mixed-spelling zips — loses because it would fail materials that
   currently load and adds a new error class for no user benefit.

3. **Verification stays in the existing harnesses.** `matchMaterialMaps`
   is already exercised Node-side via the fixture in
   `src/bake/scratch-verify.ts`; add alias cases there (alias-only zip,
   precedence case, reject case). Browser verification remains with the
   user via `/scratch-verify.html`. The matcher is pure, so no GL is
   involved.

## Risks / Trade-offs

- [A zip that previously failed now loads] → That is the point of the
  change; behavior only widens, never narrows, so no existing valid
  material regresses.
- [Mixed-spelling precedence depends on sort stability] → Unit-style
  fixture covers both orderings; the sort key is the spelling itself,
  not locale/order-dependent.

## Migration Plan

None needed: no stored state, no format change, no serialized editor
state touched (materials are read from workspace files at apply time —
ADR 0006 state model unaffected). Rollback is a plain revert.

## Open Questions

None.
