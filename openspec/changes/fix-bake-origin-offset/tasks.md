## 1. Pin the verified root cause

- [x] 1.1 Add Node-runnable checks to `src/bake/views-verify.ts`: (a) `frameIsoBox`/`projectBoxFrame` return identical rect and camera for default and non-default anchors of a fixed box; (b) a non-default anchor moves `originPx` while the projected edges stay fixed; (c) per-slot anchor projections match `setBakeOrigin`'s re-projection math with the grounding-shadow pad on and off; (d) the overlay projection with the pad included reproduces the bake frame's box-corner pixel exactly. Run `npm run verify:bundles` and confirm the new checks pass.
- [ ] 1.2 Confirm the repro shape in the browser harness (`src/bake/scratch-verify.ts` + `/scratch-verify.html`): with grounding shadow on (the default) and `boxOverlay` on, the overlay's box and origin cross are offset from the baked pixels before the fix and aligned after; both origin-authoring orders show identical sprite pixels. If any order-dependent pixel difference survives the overlay fix, record it and reopen the diagnosis before proceeding.

## 2. Fix

- [x] 2.1 Fix the 2D bounding-box overlay projection in `src/app/components/SpriteEditor.tsx` to pass the same ground-shadow pad the bake used (`doc.groundShadow ? groundShadowPadPx(passes.result.pxPerUnit) : 0`) into `projectBoxFrame`; verify in the browser that overlay edges and the origin cross land on the baked box pixels with grounding shadow on and off, N and E slots.

## 3. Verification and docs

- [x] 3.1 Run `npm run build` (typecheck + production build) and `npm run verify:bundles`; both clean.
- [ ] 3.2 Re-verify in the browser (`npm run dev` → `/scratch-verify.html`): bake→set-origin and set-origin→bake produce identical sprites and aligned overlays for a primitive and a glTF model, N and E slots, grounding shadow on and off; bundle hashes for default-origin documents unchanged.
- [x] 3.3 Update `docs/roadmap.md` if the change lands as a user-visible fix; confirm `docs/bake-pipeline.md` origin/anchor wording still matches behavior (touch only if needed).
