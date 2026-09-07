## Why

Authoring the sprite origin anchor and baking are order-dependent today: a
sprite baked at the default origin and then re-anchored stays put, but
authoring the origin first and baking afterwards produces a sprite whose
pixels sit offset from the bounding-box overlay and from the realtime 3D
view. Both paths must agree — the anchor is authored data, not framing data
(ADR 0008: "the anchor never changes the rendered pixels"), so bake output
must be identical regardless of when the origin was set.

## What Changes

- Make baking order-independent — already true at the bake path, now
  proven and pinned: baking a slot with a non-default authored origin
  produces byte-identical passes (and the same `originPx`) as baking at
  the default origin and re-projecting the anchor afterwards
  (Node-verified for N/E slots, grounding shadow on/off).
- Root cause of the reported offset (Node-verified): the sprite editor's
  2D bounding-box overlay is projected **without** the grounding-shadow
  pad (`SpriteEditor.tsx` ~line 190) while the bake frame includes that
  pad when the grounding shadow is enabled (the default, `bake.ts:137`),
  so the overlay's box and origin cross land ~22 px off the baked pixels
  and the model reads as off-center — while the realtime 3D view, which
  frames without the pad, matches the overlay's framing. Fix the overlay
  to project with the same framing rule the bake used.
- Add a Node-runnable regression check (in `npm run verify:bundles`) that
  pins the invariance: for a fixed source, the bake frame and per-slot
  anchor projections are identical whether the anchor is authored before
  or after baking.
- No format changes: the bundle manifest and provenance stay
  `isoinfinity-bake/6` byte-stable.

## Capabilities

### Modified Capabilities

- `asset-baking` — add the order-independence requirement: baking with a
  pre-authored origin produces the same passes and recorded origins as
  baking at the default origin and re-projecting; and the viewport box
  overlay must be projected with the same framing rule the bake used
  (including the grounding-shadow pad) so the baked pixels align with the
  overlay in every document state.

## Impact

- `src/app/components/SpriteEditor.tsx` — overlay projection must match the
  bake framing (ground-shadow pad).
- `src/app/store/bake.ts`, `src/bake/bake.ts`, `src/bake/iso.ts` — fix
  site if diagnosis lands in the bake path; currently believed clean.
- `src/bake/views-verify.ts` — new invariance checks (Node-runnable).
- No bundle-format, spec-format, or world-format changes; no breaking
  changes.
