# Tasks — reject-stale-view-depth

## 1. Guard implementation

- [x] 1.1 `src/runtime/assets.ts`: add the depth-validity check to
  `loadBundleViews` — covered pixels only (non-zero g-buffer normal),
  decoded half-float depth within `manifest.depth.range` ± 0.002 (missing
  or non-finite range → lower-bound-only); change `BundleViews.skipped`
  to `{ slot, reason }[]`, skip stale extras with a named stale-depth
  reason, throw a named error when the north view fails. Verify:
  `npm run build` typechecks.
- [x] 1.2 `src/app/store/world.ts`: update both `loadBundleViews` call
  sites (world open, brush pick) to the new `skipped` shape and compose
  the reason into the existing status notes. Verify: `npm run build`.

## 2. Verification

- [x] 2.1 `src/bake/views-verify.ts`: new case — a `/6` bundle whose
  E-view g-buffer alpha carries a negative depth loads with `e` skipped
  for stale depth and `n` placeable; a north-view stale depth rejects
  with a named error; an in-range control bundle loads all views.
  Verify: `npm run verify:bundles`.
- [x] 2.2 Full gates. Verify: `npm run verify:bundles`, `npm run build`,
  and (browser) `npm run dev` → `/scratch-verify.html` hashes unchanged
  for primitive bundles.

## 3. Docs

- [x] 3.1 `docs/bake-pipeline.md`: format-history tolerance note — `/6`
  views whose decoded depth lies outside the manifest range are not
  placeable (stale camera-frame slots load as skipped). Verify: read-back
  of the section matches the implemented behavior.
- [x] 3.2 `docs/roadmap.md`: add the done entry. Verify: entry present.
