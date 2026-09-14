## 1. Close the trace gap

- [x] 1.1 In `src/runtime/assets.ts`, emit `sprite.read` around the actual `source.read()` in the extra-view path (`resolveBundleView`/`decodeExtra` fall-back), tagged with asset and slot; verify in `npm run dev` with `?loadtrace` that an extra view resolution logs a `sprite.read` line and `sprite.view` no longer hides it

## 2. Read each bundle at most once

- [x] 2.1 Add `bytes: ArrayBuffer | null` to `CachedBundle`; have `cacheInfo` retain the bytes it reads and return them on a hit instead of `null`; verify `npm run verify:bundles` still passes
- [x] 2.2 Make `resolveBundleView`/`loadBundleNorth` decode from the retained bytes, reading only when the entry is missing or its identity changed; verify by counting `source.read` calls in `views-verify.ts` (one read serves north plus every extra view)
- [x] 2.3 Add a session byte budget with LRU byte eviction (decoded views retained), dropping bytes once every stored view of an asset resolves; verify with a `views-verify.ts` case that an evicted-then-requested view falls back to a read without breaking resolution

## 3. Workspace-scoped decoded-view cache

- [x] 3.1 Expose a session connection epoch from `src/app/store/workspace.ts` and prefix `BundleSource.key` with it in `bundleSource` (`src/app/store/world.ts`); verify `npm run build` typechecks the new field usage
- [x] 3.2 Add a `views-verify.ts` case that two sources with the same relative path but different keys/decode results do not share a cache entry; verify the case passes

## 4. Unpadded, incremental sprite uploads

- [x] 4.1 Remove CPU padding from `layersToSet` (or replace it with tight per-layer pass-through) and drop `padHalf`/`padBytes`; verify `npm run build` passes and `views-verify.ts`/`scratch-verify` consumers still compile
- [x] 4.2 In `src/runtime/renderer.ts`, allocate the sprite arrays with `maxW`/`maxH` headroom and a chunked layer capacity, upload each layer tight via `texSubImage3D` at `(0,0)` with its own dimensions, and add a `setSpriteSet`/`addSpriteLayer` delta path that does not re-upload unchanged layers; verify with `?loadtrace` that adding a layer does not re-run a full-array re-upload
- [x] 4.3 Keep `setSprites` for the constructor path only and route new layers through the delta method; verify the renderer still draws all layers in a browser run (left to the user)

## 5. Document-lifetime renderer

- [x] 5.1 Change the world viewport effect dependencies from `[doc.docId, spriteSet]` to `[doc.docId]`, route per-frame closures through a `spriteSetRef`, and add a separate effect that calls the renderer's sprite delta method when `spriteSet` changes; verify `npm run build` passes and the renderer is no longer reconstructed per layer (`renderer.build` trace count stops growing with layer count)
- [x] 5.2 Confirm picking, surface snap, and shadow-point code paths read the sprite set through the ref; verify `npm run verify:selection` and `npm run verify:shadows` still pass

## 6. Cache boot-baked primitives

- [x] 6.1 Memoize `bakePrimitiveLayer` results per primitive kind (and grounding-shadow setting) in a session map; verify a second world open containing the same primitive does not bake again (`world.asset`/`world.open` trace no longer shows the ~0.87 s bake)

## 7. Docs and ADRs

- [x] 7.1 Amend `docs/decisions/0014-lazy-sprite-view-decode.md` (retained bytes, budget, why the original decision changed); add a new ADR for the unpadded incremental upload model and its index row; verify both render and the ADR index lists them
- [x] 7.2 Update `docs/runtime.md` (read-once + upload model), `docs/glossary.md` (terms), `docs/roadmap.md` (done entry); verify the docs describe the shipped behavior
- [x] 7.3 Add the iCloud workspace gotcha to `AGENTS.md` (workspace folders must not live in iCloud Desktop & Documents; Chrome FSA reads measured 3–6 MB/s there); verify the note is present

## 8. Verification

- [x] 8.1 Run `npm run verify:bundles`, `npm run verify:trace`, `npm run verify:selection`, `npm run verify:shadows`, and `npm run build`; confirm all pass
- [x] 8.2 Hand the user the browser recipe (`npm run dev` with `?loadtrace`) to load a multi-direction world and confirm `world.open`, `sprite.view`, and the rebuild spans drop, with no trace data written into saved bundles or worlds
