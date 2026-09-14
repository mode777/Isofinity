## Why

Loading a sprite into the world editor — on world open or when picking a brush —
inflates and decodes every stored view (N/E/S/W) of the bundle synchronously on
the main thread, even though the compositor draws one direction per placement.
For a large multi-view sprite the g-buffer passes dominate: a 58 MB `.sprite`
expands to several hundred MB of raw float EXR that is unzipped all at once
(`parseBake` → `unzipSync`) and decoded per pixel, four times over. Measured on
a 2048² g-buffer: ~5 s to inflate all four views (vs ~1.4 s for one) and ~1.8 s
of EXR decode (vs ~0.46 s), all blocking, with no cache — every world open and
brush pick repeats it.

## What Changes

- **Manifest-first bundle parsing.** A new reader inflates only `manifest.json`
  and exposes each pass entry on demand (using fflate's `unzipSync` filter), so
  unused views are never inflated. `parseBake` stays for callers that genuinely
  want every entry (the sprite editor).
- **Lazy per-view decode.** Loading a bundle into a world decodes the north view
  immediately (it is required to place and render) and registers each extra
  stored slot as a lazy view. An extra view is decoded and depth-validated the
  first time that direction is used (a placement direction, brush direction, or
  `E` rotation), then added to the document.
- **Deferred stale-depth validation.** The out-of-range/stale check and the
  missing-render check for extra views run when the view is first requested
  rather than at bundle-load time. A view that fails is not placeable and the
  direction falls back to north with the existing named skip note; the north
  view is still decoded and validated at load, and a stale north still fails the
  whole load.
- **Per-file decoded-view cache.** Decoded views are cached in memory for the
  session, keyed by workspace file identity, so re-opening a world or re-picking
  a brush reuses decoded data instead of re-reading, re-inflating, and
  re-decoding.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-sprite-rendering`: the "Extra bundle views are placeable per view"
  requirement changes from "each stored view loads with the bundle" to "each
  stored view is decoded and validated on first use" — the placeability rules
  (rendered pass required, depth within the recorded range, north validated at
  load) are unchanged, only *when* an extra view is resolved changes.

## Impact

- Code: `src/bake/bundle.ts` (manifest-first reader + per-entry accessor),
  `src/runtime/assets.ts` (north-eager / extras-lazy loader + cache + deferred
  depth guard), `src/app/store/world.ts` (register lazy slots; resolve on
  direction use), `src/app/components/WorldEditor.tsx` (direction operations
  await a view), `src/bake/views-verify.ts` (deferred-validation tests).
- Docs: `docs/runtime.md` (world load path), `docs/bake-pipeline.md` (reader is
  manifest-first; bundle bytes unchanged), `docs/glossary.md` (lazy view),
  `docs/roadmap.md`. New ADR (`docs/decisions/0014-…`): extra views decode on
  demand and are cached per file, validation deferred to first use.
- Format: **none.** Manifest fields, zip entry names/bytes, and accepted format
  prefixes (`/4`, `/5`, `/6`) are unchanged. Old bundles load exactly as before.
- Non-goals (deliberately out of scope): half-float g-buffer storage, the
  document-wide padding/texture-upload rework (`layersToSet` max-size padding,
  renderer rebuild on layer add), background/worker decode, and a cross-session
  (IndexedDB) cache.
