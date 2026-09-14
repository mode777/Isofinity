## Why

Browser load traces on a machine whose disk reads at ~1.5 GB/s showed world
open at 24.2 s, and after the workspace was moved out of iCloud Desktop &
Documents (the read bottleneck) it was still 8.3 s. The remaining time is
structural, not I/O: `sprite.read` is now milliseconds, yet each extra view
re-reads the entire bundle, every sprite layer is CPU-padded to the largest
sprite's dimensions and all layers are re-uploaded, and the viewport's
renderer is torn down and rebuilt on every layer change. The measured costs
were ~3.2 s of padding/rebuild and ~3.5 s of redundant re-read+resolve for a
12-layer world. A separate correctness gap: decoded views are cached by
relative path only, so switching workspaces in one session can serve stale
data.

## What Changes

- **Read a bundle's bytes at most once per load.** Resolving an extra view
  reuses the bytes already read for the north view (the session cache
  retains them) instead of calling `source.read()` again. **BREAKING** to the
  ADR 0014 decision that the raw bytes are not held; that ADR is amended.
- **Incremental, tight sprite upload.** Drop the CPU pass that pads every
  layer to `maxW × maxH`; upload each layer at its own size and add a layer
  without re-uploading the others. A small sprite no longer costs as much
  texture memory/bandwidth as the largest one in the world.
- **Document-lifetime renderer.** The world viewport keeps one renderer for
  the document's lifetime; adding/removing a sprite layer updates the sprite
  textures in place instead of disposing and reconstructing the renderer.
- **Workspace-scoped decoded-view cache.** The per-file decode cache key
  includes the workspace identity, so reconnecting to a different workspace
  never serves previously decoded bytes.
- **Cache boot-baked primitives** for the session instead of re-baking a
  primitive each time it is acquired.
- **Close the trace gap**: extra-view reads emit the `sprite.read` span so
  read cost is never hidden inside `sprite.view`.
- **Docs**: `docs/runtime.md` (read-once + upload model), `docs/glossary.md`
  (terms), `docs/roadmap.md` (done entry), `AGENTS.md` (workspace folders
  must not live in iCloud Desktop & Documents — the measured 3–6 MB/s read
  path), amend ADR `0014`, and add an ADR for the incremental unpadded upload
  model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-sprite-rendering`: extra bundle views resolve from bytes read at
  most once per load; sprite layers upload at their own size without padding
  every layer to the largest; the decoded-view cache is workspace-scoped.

## Impact

- Code: `src/runtime/assets.ts` (retain bundle bytes; `layersToSet`/padding
  removal), `src/runtime/renderer.ts` (`setSprites` → incremental layer
  add/update), `src/app/components/WorldEditor.tsx` (renderer lifetime),
  `src/app/store/world.ts` + `src/app/store/bake.ts` (primitive cache,
  workspace-scoped source key), `src/perf/trace.ts` usage in
  `assets.ts`/`store/world.ts`.
- Docs: `docs/runtime.md`, `docs/glossary.md`, `docs/roadmap.md`,
  `AGENTS.md`, `docs/decisions/0014-…` (amendment) and a new ADR.
  No new ADR for the iCloud note (workflow guidance, not architecture).
- Format: **none.** Bundle bytes, manifest fields, and accepted format
  prefixes (`/4`, `/5`, `/6`) are unchanged; old bundles load as before.
- Verification: `npm run verify:bundles`, `npm run verify:shadows`,
  `npm run verify:selection`, `npm run verify:trace`, and `npm run build`;
  the browser run (load a world with multi-direction sprites) is the user's,
  since this environment cannot launch a browser.
- Non-goals (deliberately out of scope): half-float/EXR re-encoding, bundle
  format changes, worker/off-thread decode, cross-session (IndexedDB) cache,
  parallel asset reads, material-loading rework, and any change to
  occlusion, shading, or placement direction behavior.
