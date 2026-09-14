## 1. Sprite surface data written unblended

- [x] 1.1 In `src/runtime/renderer.ts`, SPRITE_FRAG ships surface data with alpha 1 (`outGbuf = vec4(g.rgb, 1.0)` in the object branch, `vec4(0, 1, 0, 1)` in the grounding-shadow branch) so the shared `SRC_ALPHA` blend replaces RT1; RT2 already replaced via its alpha-1 output; only RT0 keeps the coverage alpha. Verify `npx tsc --noEmit` passes.
- [x] 1.2 Contact shadows keep the zero-weight trick (unchanged); FLAT_SHADOW_FRAG comment reworded to match. Verify `npx tsc --noEmit` passes.
- [x] 1.3 PIVOT (browser crash): `gl.blendFunci` is not exposed by the WebGL 2 API — the typed shim called `undefined` at the first draw and blacked the canvas. The first attempt (per-draw-buffer blend state at both passes) was fully reverted and replaced by 1.1's per-output-alpha form, which needs no extra blend state.

## 2. Static gates

- [x] 2.1 Run `npm run verify:selection` and `npm run verify:shadows`; both must stay green (picking reads g-buffer coverage, unchanged; the shadow field is untouched).
- [x] 2.2 Run `npm run build` and fix any type or build errors.

## 3. Browser verification

- [ ] 3.1 In `npm run dev` → the world editor: place a sprite whose silhouette crosses dark ground (its own grounding shadow, another sprite's patch, or the realtime directional shadow) and confirm the pale outline is gone with the dynamic light on; compare with the light off. Refresh the deferred-light golden-hash notes in `src/bake/scratch-verify.ts` if its printed hashes are referenced for regression diffs (the diff is the fix).
- [ ] 3.2 Confirm contact shadows still darken only their pixels (no g-buffer/depth change behind them): hover ring and character contact shadow behave exactly as before, and `verify:selection`-style picking at a silhouette still selects the sprite.

## 4. Docs

- [x] 4.1 Update `docs/runtime.md`: the sprite pass writes surface data (g-buffer normal + linear depth) unblended; only albedo composites at coverage.
- [x] 4.2 Add ADR 0020 ("albedo blends, surface data replaces — never coverage-blend g-buffer/depth across draws") with a row in `docs/decisions/README.md`, and add the change to `docs/roadmap.md` when it lands.
