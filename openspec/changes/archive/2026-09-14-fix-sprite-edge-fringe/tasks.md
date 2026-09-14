## 1. Background-plate estimation

- [x] 1.1 Add a half-float readback of the path tracer's linear accumulation target in `src/bake/pt.ts` (Uint16Array, same decode pattern as the raster readback) and compute `B` as the mean RGB over pixels with alpha 0 and nonzero RGB; return 0 when no such pixel exists. Verify by logging `B` during a bake in `/scratch-verify.html` and checking it is stable across the last few accumulation batches.
- [ ] 1.2 Confirm determinism: run the same primitive bake twice with identical settings and check both runs report the same `B` (converged empty pixels are bit-stable per tile grid).

## 2. Tonemap unmix

- [x] 2.1 Extend `TONEMAP_FRAG` in `src/bake/pt.ts` with a `uBackground` uniform: zero RGB when alpha is 0; otherwise unmix `rgb' = (rgb − (1 − a)·B) / max(a, ε)` (ε ≈ 1/255) with the result clamped ≥ 0, all before the existing ACES → sRGB → saturation chain. Verify the shader compiles and a baked primitive shows no white halo along silhouette edges in `/scratch-verify.html` (bake viewport over mid-grey, then check edge pixels against a dark backdrop).
- [x] 2.2 Wire `uBackground` into both tonemap paths — committed pass and live preview (`tonemap` / `preview` / `tonemapInto`), estimating `B` per pass invocation so each view slot measures its own value. Verify the converging preview shows the corrected edges during accumulation and the committed pass matches it after convergence.

## 3. Consumer sanity

- [ ] 3.1 Re-bake a primitive with the grounding shadow on and check `composeGroundShadow` still lands: dark mid-alpha tint appears around the base and the runtime grounding-shadow branch (`r.b <= r.r`) classifies it in the world editor. Verify visually in the world editor over the default ground.
- [ ] 3.2 Place a re-baked sprite in a world over a dark ground material / next to its own grounding shadow and confirm the bright seam is gone; compare against a pre-fix bundle (old bundles keep the halo until re-baked — expected).

## 4. Verification and harness updates

- [x] 4.1 Run `npm run verify:bundles` and update the expected primitive bundle hashes in the verify/scratch harness to the new bytes, noting in the check output that the diff is the edge-unmix change. Verify `npm run verify:bundles` passes.
- [x] 4.2 Add a Node-checkable invariant for the unmix math (pure function extracted from the shader or mirrored in the verify script): for sample (c, obj, B) triples, `tonemap(unmix(mix(obj, B, 1−c), c, B)) ≈ tonemap(obj)` within tolerance, and `unmix` at alpha 0 yields RGB 0. Wire it into `src/bake/views-verify.ts` (or a sibling) and verify it runs green via `npm run verify:bundles`.
- [x] 4.3 Run `npm run build` and fix any type or build errors.

## 5. Docs

- [x] 5.1 Update `docs/bake-pipeline.md`: render-pass edge semantics (straight, unmixed alpha; empty texels RGB 0; `B` measured from empty pixels) and a format-history note that `/7` render-pass bytes changed without a format bump.
- [x] 5.2 Add a short ADR in `docs/decisions/` ("render pass stores straight, unmixed alpha — never premultiplied; background plate removed at tonemap") with a row in the ADR index, recording the premultiplied pipeline as the known follow-up for bilinear-filter shimmer at zoom. Update `docs/roadmap.md` when the change lands.
