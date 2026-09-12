## 1. Manifest-first bundle reader

- [x] 1.1 Add `parseBakeManifest(buffer)` and `readBakeEntry(buffer, file)` to `src/bake/bundle.ts` (manifest-only inflate + filtered per-entry inflate, same format validation and missing-pass error text as `parseBake`); verify with `npm run build` and a Node check that parsing a multi-entry zip does not produce the extra entries' bytes.
- [x] 1.2 Add a `BundleDescriptor`/`BundleViewSpec` shape (north pass file names + per-extra-slot `slot`/size/origin/gbuffer/render file names) derived from the parsed manifest; verify `npm run build` and that a `/6` manifest with 3 extra slots yields 3 specs.

## 2. Lazy loader and session cache

- [x] 2.1 Add `loadBundleNorth(source)` to `src/runtime/assets.ts` (manifest parse, north EXR/PNG decode, north depth guard) returning the north layer plus descriptor/manifest/provenance; verify `npm run verify:bundles` still passes its north scenarios.
- [x] 2.2 Add `resolveBundleView(descriptor, source, slot)` (re-read file, filtered entry inflate, decode, render-pass + depth guards) returning the layer or the named skip reason; verify `npm run verify:bundles` guard scenarios against the resolver.
- [x] 2.3 Re-express `loadBundleViews` on top of `loadBundleNorth` + `resolveBundleView` so eager consumers and `loadBundleLayer` keep working; verify `npm run verify:bundles`.
- [x] 2.4 Add the module-level per-file cache (key `sprites/<name>`, entries `{ file, size, lastModified, descriptor, views, skips }`) used by both loaders, invalidated when `size`/`lastModified` changes; verify a Node check that a second resolve of the same file does not re-read/decode and that a changed identity reloads.

## 3. World editor integration

- [x] 3.1 Rework `selectBrush` in `src/app/store/world.ts` to load only the north view through the cache and register the descriptor without resolving extras; verify `npm run build` and that picking a 4-view sprite no longer decodes E/S/W (status/log).
- [x] 3.2 Add `ensureView(docId, asset, slot)` (resolve on demand via the cache, append the pinned-id layer to `doc.layers`, record the skip note on failure) and make `cycleBrushDir`/`cycleSelectedSpriteDir` await it before switching; verify `npm run build` and `npm run verify:selection`.
- [x] 3.3 Rework `openWorldDoc` to decode north for every unique asset eagerly, place sprites with their stored directions, then resolve referenced non-north directions with background `void ensureView(...)`; verify `npm run build` and that a world with north-only placements decodes no extra views.

## 4. Docs and decision record

- [x] 4.1 Add `docs/decisions/0014-lazy-sprite-view-decode.md` and its index row (on-demand decode, deferred validation, per-file cache, never serialized — ADR 0006); verify the file and `docs/decisions/README.md` row exist.
- [x] 4.2 Update `docs/runtime.md` (world load path), `docs/bake-pipeline.md` (manifest-first reader, bytes unchanged), `docs/glossary.md` (lazy view), and `docs/roadmap.md`; verify the mentions are present.

## 5. Verification

- [x] 5.1 Update `src/bake/views-verify.ts` for the deferred extra-view validation and add an only-requested-decode assertion; verify `npm run verify:bundles` passes.
- [x] 5.2 Run `npm run verify:selection` and `npm run build`; verify both pass.
- [x] 5.3 Record that browser validation of direction switching and world loading (via `npm run dev` → world editor) is left to the user, per the environment's no-headless-browser rule.
