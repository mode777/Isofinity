## 1. Bake core passes (`src/bake/`)

- [x] 1.1 `bake.ts`: drop the albedo attachment — render target `count: 2 → 1`, remove `outAlbedo` and the color encode from the fragment shader while keeping the texel/factor alpha sampling and MASK cutoff discard, remove the attachment-0 readback, and drop `albedo`/`albedoHex` from `BakeResult`. Verify with `rg -n "result.albedo|outAlbedo|albedoHex" src/bake/bake.ts` returning no pass-related hits.
- [x] 1.2 `pt.ts`: delete the AO machinery — `aoPass()`, `AmbientOcclusionMaterial`/`MeshBVHUniformStruct`/`PathTracingSceneGenerator` imports, `AO_BLEND_FRAG`, `mulberry32`, `readTargetStats`, and the `[pt-audit]` logging; shrink `PtSettings` (drop `aoSamples`/`aoRadius`), `DEFAULT_PT_SETTINGS`, and `PtExtras` (drop `ao`). Verify with `rg -n "ao|Ao|AO" src/bake/pt.ts` showing no AO-pass remnants (case-accurate review).
- [x] 1.3 `export.ts`: remove `passes.albedo`/`passes.ao` from `buildManifest`, the `aoSamples`/`aoRadius` fields from the manifest `renderer` block and `BakeProvenance.bake`. Verify the manifest writer emits only gbuffer (+ render) keys for a raster-only and a render-only bake.
- [x] 1.4 `bundle.ts`: stop writing the albedo PNG (remove the local `encodePng`) and ao entry in `buildBundle`; make `parseBake` require only the g-buffer entry, keep `render` optional-if-declared, stop resolving `passes.albedo`/`passes.ao`, and drop `albedo`/`ao` from `BakeBundle`. Verify by hand-running the pure parse path against a fixture zip in a scratch script if feasible, else via task 3.1's updated checks.

## 2. Editor app (`src/app/`)

- [x] 2.1 `document.ts`: remove the `ao` field from `BakeDocument`. Verify with `rg -n "doc.ao|\.ao\b" src/app`.
- [x] 2.2 `store/bake.ts`: remove `runAoPass` and `aoGen`, the `ao` wiring in `openBundleDoc`, the `aoSamples`/`aoRadius` clamps in `setSettings`, the provenance `bake` fields, and the `ao` branch of the save extras. Verify `rg -n "runAoPass|aoGen|aoSamples|aoRadius" src/app` is clean.
- [x] 2.3 `bundleView.ts`: stop decoding albedo and ao (drop `pngBytesToFloat` and the ao decode; `render` decoding stays). Verify `DecodedBundle` carries `result` (g-buffer only), `render`, `provenance`.
- [x] 2.4 `SpriteEditor.tsx`: remove the albedo figure/effect and the ao figure/effect/button; the pass grid shows g-buffer (normal/depth) and render only. Verify by reading the component's JSX for exactly two pass figures plus their effects.
- [x] 2.5 `SpriteProperties.tsx`: remove the "AO samples"/"AO radius" sliders and the "Bake/Re-run AO pass" button. Verify `rg -n "AO|ao" src/app/components/SpriteProperties.tsx` shows no AO controls.

## 3. Verification harness

- [x] 3.1 `src/bake/scratch-verify.ts` (and `scratch-verify.html` wiring if needed): update raster assertions to g-buffer-only, replace the albedo/g-buffer identity checks, make the raster-only bundle expectation "manifest + g-buffer entries", and add a legacy-manifest case (albedo/ao entries recorded) that still parses with those entries ignored. Verify the script compiles (`npm run build`); browser run is delegated to task 5.3.

## 4. Docs

- [x] 4.1 `docs/bake-pipeline.md`: update the pass table and MRT wording (g-buffer + optional render), the bundle diagram (no albedo/ao entries), the parser paragraph (g-buffer required, legacy entries ignored), the provenance/renderer field lists, delete the path-traced AO section (note the pass was removed and a future change may reintroduce occlusion differently), and refresh the "Current state / next steps" bullets (drop the "Broken: ao" line and albedo/MRT mentions).
- [x] 4.2 `AGENTS.md` (and `docs/runtime.md` if it references the passes): update the bake-pipeline summary — sprites carry g-buffer + optional render; remove the "KNOWN BROKEN ao" note. Verify with `rg -n -i "albedo|ambient-occlusion|\bao\b" docs AGENTS.md` showing only intentional historical/tolerance mentions.

## 5. Integration verification

- [x] 5.1 `npm run build` passes (typecheck + production build) — the atomic gate proving no partial references remain.
- [x] 5.2 Repo-wide sweep: `rg -n "runAoPass|aoSamples|aoRadius|passes\.ao|passes\.albedo|\.albedo\b" src` returns only deliberate test fixtures/tolerance code; nothing renders, writes, or displays an albedo/ao pass.
- [x] 5.3 User browser check (cannot run headless here; record as handed to the user): `npm run dev` → open a primitive (g-buffer + render previews only), bake the render pass, save the bundle, place it into a world, and open a pre-change `.sprite` with albedo/ao entries to confirm it loads.
