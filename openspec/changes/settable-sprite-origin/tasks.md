## 1. Bake-core math (pure, Node-verifiable)

- [x] 1.1 Add `slotAnchorPoint(origin, size, yawDeg)` to `src/shared/iso.ts` implementing the exact quarter-turn mapping from design D2 (q=0..3 formulas), and extend `frameIsoBox`/`projectBoxFrame` (`src/bake/iso.ts`) with an optional `origin` parameter that replaces the hardcoded `(0,0,0)` projection (default preserves today's values). Verify: `npm run build` typechecks; a quick Node REPL check that corners map per the D2 table and that the default parameter reproduces the current `originPx` for a unit cube.
- [x] 1.2 Pin the helper's equivalence with `applySlotModelRotation`: in `src/bake/views-verify.ts` add a check that for a non-cube box and all four slots, `slotAnchorPoint` applied to the 8 box corners matches the corners transformed through `applySlotModelRotation`'s mapping (assert against the D2 formulas for corners where the mapping is exact). Verify: `npm run verify:bundles` passes with the new checks.

## 2. Bake pipeline + manifest

- [x] 2.1 Extend `bakePrimitive` (`src/bake/bake.ts`) with an optional `origin` parameter (asset-space point of the unrotated box): apply `slotAnchorPoint` for the slot's yaw and pass the result to `frameIsoBox`, so `BakeResult.originPx` reflects the anchor. Verify: `npm run build`; existing behavior unchanged when the parameter is omitted (unit-cube default check from 1.1 still holds).
- [x] 2.2 Add `origin?: [number, number, number]` to `BakeProvenance` (`src/bake/export.ts`) and write it in `buildManifest` only when it differs from `(0,0,0)` (rounded to 1e-4); confirm `parseBake` (`src/bake/bundle.ts`) passes it through untouched (no parser change expected). Verify: `npm run verify:bundles` after 3.x fixtures exist; `npm run build`.

## 3. Editor state & store

- [x] 3.1 Add `origin: Vec3` (default `[0,0,0]`) to `BakeDocument` (`src/app/document.ts`), initialize it in document creation, and restore it from `decodeBundle`'s provenance in the open path (default when absent). Verify: `npm run build`; open/save round trip in the browser harness is covered by 5.2.
- [x] 3.2 Add `setBakeOrigin(docId, origin)` to `src/app/store/bake.ts` per design D5: reject non-finite, clamp into the current scaled source box extent, live-re-derive `originPx` for N and every baked extra view (pure projection over each slot's stored size), mark dirty. Verify: `npm run build`; manual check in dev that editing the origin on a baked doc updates the overlay cross and a subsequent save without re-bake carries the new origins.
- [x] 3.3 Wire the anchor into bakes and persistence: `bakeRaster`, `renderSlot`'s implicit re-bake, and `bakeAll` pass `doc.origin` (clamped defensively) into `bakePrimitive`; `provenanceOf` includes `origin` (omitting the default); the uniform-scale action rescales an existing origin proportionally before clamping. Verify: `npm run build`; re-bake after an origin edit keeps the anchor (browser check deferred to 5.2).
- [x] 3.4 Place-in-world handoff: confirm `resultToLayer`/`placeInWorld` need no change (they consume `doc.result.originPx`) and note it in the PR description. Verify: `npm run build` + code inspection.

## 4. Editor UI

- [x] 4.1 Add the Origin section to `src/app/components/SpriteProperties.tsx` (below Source): three numeric inputs (X/Y/Z, asset units) bound to `setBakeOrigin`, a "Set to ground center" button filling `(sx/2, 0, sz/2)` of the current scaled box, editable only while the N slot is active (read-only values + north-view hint on E/S/W), hidden for view-only documents. Panel rules: inputs never start a bake/render. Verify: `npm run build`; manual dev-server check of all four slots + view-only doc.
- [x] 4.2 Move the origin marker to the anchor: pass the current origin into `projectBoxFrame` in `SpriteEditor.tsx`'s box overlay (cross follows the anchor) and into the Realtime 3D overlay (`buildBoxOverlay`, `src/app/realtime.ts`). Verify: `npm run build`; overlay cross sits at the authored point in all four view modes.

## 5. Verification harness

- [x] 5.1 Extend `src/bake/views-verify.ts`: `/6` round trip preserving a custom provenance origin; E/S/W entries carrying derived `originPx` consistent with `slotAnchorPoint` + projection; provenance without `origin` restoring the default; unknown-format rejection unchanged. Verify: `npm run verify:bundles`.
- [x] 5.2 Extend `src/bake/scratch-verify.ts`: project a non-zero origin through `projectBoxFrame` and assert it equals the frame's `originPx` (generalizing the existing origin check); confirm primitive bundle hashes are unchanged (default omits the field). Verify: `npm run build`; run `npm run dev` → `/scratch-verify.html` in a browser and report the harness output to the user (browser runs stay with the user).

## 6. Docs & records

- [x] 6.1 Update `docs/bake-pipeline.md`: "Asset bounds"/"Sprite placement" (authored anchor semantics + landing rule), the provenance description (optional `origin`), and a format-history note that `/6` provenance gained the optional field without a bump. Update `docs/glossary.md` (origin point vs `originPx`) and `docs/runtime.md` (sprite editing Origin section; world placement anchor note). Verify: docs read coherently; no spec/doc contradiction.
- [x] 6.2 Write `docs/decisions/0008` (placement anchor is an authored per-asset origin: N-authored, slot-rotated, lands at the placement point, default min corner) following `docs/decisions/TEMPLATE.md` and add it to the decisions index; add a Done row to `docs/roadmap.md`. Verify: index links resolve.
- [x] 6.3 Run the full gates: `npm run build` and `npm run verify:bundles`; report the browser-harness checks (5.2) for the user to run. Verify: both commands exit clean.
