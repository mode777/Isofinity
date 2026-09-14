## 1. Per-buffer blend state

- [x] 1.1 In `src/runtime/renderer.ts`, set per-draw-buffer blend state at the sprite pass's `gl.enable(gl.BLEND)`: buffer 0 `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`, buffers 1 and 2 `(ONE, ZERO)`. Verify `npx tsc --noEmit` passes.
- [x] 1.2 At the contact-shadow pass's `gl.enable(gl.BLEND)`, set buffers 1 and 2 to `(ZERO, ONE)` (keep), leaving buffer 0 at the alpha blend; update the FLAT_SHADOW_FRAG comment to describe the explicit keep-blend instead of the zero-weight trick. Verify `npx tsc --noEmit` passes.

## 2. Static gates

- [x] 2.1 Run `npm run verify:selection` and `npm run verify:shadows`; both must stay green (picking reads g-buffer coverage, unchanged; the shadow field is untouched).
- [x] 2.2 Run `npm run build` and fix any type or build errors.

## 3. Browser verification

- [ ] 3.1 In `npm run dev` → the world editor: place a sprite whose silhouette crosses dark ground (its own grounding shadow, another sprite's patch, or the realtime directional shadow) and confirm the pale outline is gone with the dynamic light on; compare with the light off. Refresh the deferred-light golden-hash notes in `src/bake/scratch-verify.ts` if its printed hashes are referenced for regression diffs (the diff is the fix).
- [ ] 3.2 Confirm contact shadows still darken only their pixels (no g-buffer/depth change behind them): hover ring and character contact shadow behave exactly as before, and `verify:selection`-style picking at a silhouette still selects the sprite.

## 4. Docs

- [x] 4.1 Update `docs/runtime.md`: the sprite pass writes surface data (g-buffer normal + linear depth) unblended; only albedo composites at coverage.
- [x] 4.2 Add ADR 0020 ("albedo blends, surface data replaces — never coverage-blend g-buffer/depth across draws") with a row in `docs/decisions/README.md`, and add the change to `docs/roadmap.md` when it lands.
