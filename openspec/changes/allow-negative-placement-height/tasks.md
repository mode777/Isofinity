## 1. Store: lift the clamp

- [x] 1.1 In `src/app/store/world.ts` `setHeightLevel`, replace `Math.max(0, y)` with an `Number.isFinite(y)` guard (ignore non-finite input) and store `y` verbatim; update the function's doc comment to say the height may be negative (in-memory editor state, never serialized). Verify: `npm run build` passes.

## 2. Editor UI

- [x] 2.1 In `src/app/components/WorldEditor.tsx` `HeightInput`, commit `parsed` verbatim (drop `Math.max(0, parsed)`); empty/non-numeric rejection and Escape cancel stay as-is. Verify: `npm run build` passes.
- [x] 2.2 In the same file, extend the height-gizmo condition from `ghost.y > GROUND_EPSILON` to `Math.abs(ghost.y) > GROUND_EPSILON` so sunken ghosts get the diamond + plumb line; leave `emitShadow` (already skips `y <= GROUND_EPSILON`) untouched. Verify: `npm run build` passes.

## 3. Data-model comments

- [x] 3.1 Drop the `>= 0` claims from `Placement.y` in `src/runtime/world.ts` and `WorldDocument.heightLevel` in `src/app/document.ts` (comment-only; both were already plain `number`). Verify: `npm run build` passes.

## 4. Verification

- [x] 4.1 `npm run build` (tsc + production build) passes with no new diagnostics.
- [x] 4.2 `npm run verify:bundles` still passes (no bundle/bake code touched; guards regressions).
- [ ] 4.3 Browser check (user-run, `npm run dev`): shift+move lowers the ghost below the ground with gizmo; typing `-2` commits `-2`; placing at `-1` renders sunk with no shadow ellipse, saves, reloads at `-1`; shift+move down then up recovers smoothly; `npm run preview` on an old `/1` world file still loads at ground level.
