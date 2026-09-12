## 1. World state and format

- [x] 1.1 Add `width`/`depth` (defaults 12 × 12) to the world document's persisted ground state in `src/app/document.ts` and `defaultGroundState()` in `src/app/store/world.ts`; verify `npm run build` typechecks
- [x] 1.2 Change `newWorldDoc()` to take a size (`newWorldDoc(width, depth)`) and thread it into the document; verify the ProjectBrowser call site still compiles after updating it in task 3.1 (`npm run build`)
- [x] 1.3 Add a `setGroundSize(docId, width, depth)` store action: clamp/round to whole units 1–128 per axis, update state, mark dirty, and reset the document's `viewTransform` to null (refit); verify by reading the action against the spec's resize scenarios and `npm run build`
- [x] 1.4 Bump `WORLD_FORMAT` to `isoinfinity-world/7`, add `SUPPORTED_WORLD_FORMATS` `/7`, serialize `ground.width`/`ground.depth` inside the `ground` object only when ≠ 12 × 12, and validate a present size in the parser (finite positive pair, else reject as malformed); verify with a Node round-trip check of `serializeWorld`/parser output (old-format files load at 12 × 12, `/7` round-trips, malformed size rejects)

## 2. Remove place-in-world

- [x] 2.1 Delete `placeInWorld()` and `uniqueLayerId()` from `src/app/store/world.ts`; confirm `resultToLayer()` in `src/app/store/bake.ts` has no remaining callers and delete it (keep shared conversion helpers used by bundle loading); verify `rg -n "placeInWorld|resultToLayer" src` returns nothing and `npm run build` passes
- [x] 2.2 Remove the Place-in-world button and its handler from `src/app/components/SpriteEditor.tsx`; verify the sprite toolbar shows Save/render/Bake All/Remove view only (`npm run build`; visual check deferred to task 5.2)

## 3. New-world size dialog

- [x] 3.1 Add a small modal dialog (width/depth number fields, defaults 12 × 12, Create/Cancel) opened by the project browser's "New world" button; Create calls `newWorldDoc(width, depth)`; verify accepting creates a world tab and cancelling creates nothing (`npm run build`; visual check deferred to task 5.2)
- [x] 3.2 Clamp out-of-range/non-numeric dialog input to 1–128 whole units on accept (empty depth falls back to its default); verify by exercising the accept path with 0, 300, and blank values (unit-level or manual via task 5.2)

## 4. Per-size world rendering and resize UI

- [x] 4.1 In `src/app/components/WorldEditor.tsx`, replace `GRID_N` and the module-level frame constants with `worldFrame(width, depth)` / `buildGround(width, depth)` helpers memoized per size; drive canvas backing-store size, `renderer.setGroundExtent(width, depth)`, `setMeshFrame`, overlay projection, and the fit transform from the live document's size (size in the applied-`groundKey`); verify `npm run build` and that placement/erase/pick math uses the per-size frame
- [x] 4.2 Add width/depth fields to the Ground section of `src/app/components/WorldProperties.tsx`, bound to `setGroundSize` with the panel's precise-input conventions (commit on Enter/blur, invalid reverts, Escape cancels, out-of-range clamps); verify `npm run build`
- [x] 4.3 Confirm resize semantics end-to-end in the render loop: ground grows/shrinks from the fixed (0, 0) corner, placements outside the new bounds stay put and stay pickable/draggable, undo does not revert size, and the view refits; verify per scenario by reading the loop + `npm run verify:selection` (world/selection bookkeeping untouched)

## 5. Verification

- [x] 5.1 Run `npm run build` and `npm run verify:bundles` + `npm run verify:selection` (both must stay green; bake/mesh paths untouched)
- [ ] 5.2 Browser pass (user-run, `npm run dev`): new-world dialog defaults/clamp/cancel; create 24 × 8 world; resize 12 × 12 → 24 × 8 and back; shrink with placements outside bounds; save + reload a sized world and a `/6` file; place-in-world button gone; brush loading from `sprites/` still works

## 6. Docs and wrap-up

- [x] 6.1 Update `docs/runtime.md`: Worlds section (marker `/7`, optional ground size), remove the Place-in-world subsection, world editor section (per-size frame, resize); check `docs/glossary.md` for place-in-world references
- [x] 6.2 Update `docs/roadmap.md` (done summary); commit and push per the AGENTS.md workflow and report the build version
