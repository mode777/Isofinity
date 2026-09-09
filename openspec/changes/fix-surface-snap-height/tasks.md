## 1. Height reconstruction fix

- [x] 1.1 Diagnose the current `effectiveHeight` formula in `src/app/components/WorldEditor.tsx` against the compositor's anchor convention (docs/runtime.md) and the absolute-depth definition (docs/bake-pipeline.md); confirm the double-count/mis-reference of placement height before changing code — hypothesis refuted: the formula is an exact identity; the real defect is the padded-stride mismatch (layersToSet pads to maxW, the pick indexed with the layer's own width)
- [x] 1.2 Rewrite the depth→surface-height reconstruction per design D1 so the placement contribution is applied exactly once and consistent with the draw path's anchor handling; verify `npm run build` passes — extracted into `src/runtime/surfaceSnap.ts` with the `maxW` padded-stride fix; `npm run build` green
- [x] 1.3 Verify the analytic cases: unit cube at height 0 with cursor on its top face reads 1, and the same cube placed at height 1 reads 2 (browser check via `npm run dev`, or a scratch-verify-style numeric check where runnable in Node) — Node synthetic check passes (top 1, stacked 2, empty 0, slab 0.5, padded-stride regression discriminates); permanent `scratch-verify` spike added against the real bake chain (browser run left to the user)

## 2. Eyedropper display

- [x] 2.1 Add a transient per-document in-memory snapped-height field to the world editor store (`snappedHeight: number | null`, never serialized — ADR 0006) and publish the snap read from the hover path when the value changes; verify tab switches and world save/load carry no snapped state — store field + `setSnappedHeight` published from pointer handlers (change-guarded), reset when snap goes off / cursor leaves; world save serializes explicit fields only
- [x] 2.2 Show the snapped read in the toolbar height field while surface snap is on (0 over empty ground), keeping the stored `heightLevel` untouched; verify toggling snap off restores the stored height (spec scenario "Stored height survives a snap session") — read-only field while snap is on, stored height untouched by construction (snap never writes `heightLevel`); browser walkthrough in 3.1

## 3. Verification and docs

- [ ] 3.1 Walk the spec scenarios in the browser (`npm run dev`): snap onto unit cube top lands at 1, height field shows the read, snap over empty ground stays grounded, snap overrides an adjusted height; report anything needing the user's eyes
- [x] 3.2 Run `npm run build` (typecheck + production build) as the final gate
- [x] 3.3 Update `docs/runtime.md` surface-snap description if it states the height semantics, add a `docs/roadmap.md` done entry, and confirm no ADR is needed (repair, not a new trade-off)

## 4. Anchor-under-cursor placement (follow-up from browser verification)

- [x] 4.1 Make the brush anchor always project exactly onto the cursor: intersect the cursor's view ray with the horizontal plane at the effective placement height (`groundAtHeight`/`anchorAt` in WorldEditor) and use it for the ghost and every placement path (mouse click/drag, touch tap/drag); eraser keeps ground-plane footprint picking — verified by `npm run build` and the user's browser check of the ghost tracking the cursor at raised heights
- [x] 4.2 Update the change's spec delta: MODIFIED "Brush ghost preview" pins the anchor-under-cursor ray-plane rule with a raised-height scenario; note the follow-up in design.md
