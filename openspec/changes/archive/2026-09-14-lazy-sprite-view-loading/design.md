## Context

See `proposal.md` — Why. The world editor's sprite entry points are
`openWorldDoc` (`src/app/store/world.ts:420`) and `selectBrush`
(`:1350`); both call `loadBundleViews` (`src/runtime/assets.ts:244`),
which today inflates *all* zip entries through `parseBake`
(`src/bake/bundle.ts:92`) and decodes north plus every extra slot. The
decoded layers live in `doc.layers`, are padded to a shared max size by
`layersToSet` (`assets.ts:158`), and are uploaded by `Renderer.setSprites`
(`src/runtime/renderer.ts:921`). Direction resolution is
`viewLayerId`/`parseViewLayerId` (`assets.ts:34-48`). The load-time
stale-depth guard is `gbufferDepthOutOfRange` (`assets.ts:208`).

Bundle bytes and the manifest are unchanged by this change; `/4`, `/5`,
and `/6` all continue to parse. `parseBake` (eager, Blob-returning) stays
because the sprite editor's `decodeBundle` (`src/app/bundleView.ts:74`)
wants every pass.

## Goals / Non-Goals

**Goals:**

- Load only the north view on world open / brush pick; decode an extra
  E/S/W view the first time that direction is used.
- Inflate a bundle's zip entry only when its view is decoded.
- Cache decoded views per workspace file for the session.
- Keep every existing placeability rule (render pass required, depth in
  range, north validated at load) and its named skip notes.

**Non-Goals:**

- Changing bundle bytes, manifest fields, or accepted format prefixes.
- Half-float g-buffer storage.
- The document-wide padding / full-renderer-rebuild behavior on layer
  add (tracked separately as upload hygiene).
- Worker/background decode and any cross-session (IndexedDB) cache.

## Decisions

### D1 — Manifest-first archive reader, `parseBake` untouched

Add to `src/bake/bundle.ts`:

- `parseBakeManifest(buffer)` → `{ manifest, provenance }`, inflating only
  `manifest.json` and running the same format validation `parseBake` does.
- `readBakeEntry(buffer, file)` → `Uint8Array`, via
  `unzipSync(buffer, { filter: (e) => e.name === file })` (verified
  supported in the vendored fflate, `fflate.module.js:2653`), throwing the
  same `bake bundle: missing pass <file>` error as `entry()`.

Keep `parseBake` as-is for eager callers. The lazy path never calls it.

*Alternatives:* teach `parseBake` to accept a filter — rejected, it
complicates the eager sprite-editor/test contract for no gain. Read the
zip central directory by hand — rejected, fflate already filters and the
directory fields are non-trivial.

### D2 — A view descriptor instead of decoded pixels

`parseBakeManifest` feeds a `BundleDescriptor` holding the manifest,
provenance, the north pass file names, and one `BundleViewSpec` per extra
slot from `manifest.views[]` (`slot`, sprite size/origin, `gbuffer` file,
optional `render` file) — all metadata, no pixel data.

### D3 — North eager, extras resolved on demand

`src/runtime/assets.ts` exposes:

- `loadBundleNorth(source)` → `{ north, descriptor, manifest, provenance }`.
  Reads the file once, parses the manifest, inflates/decodes the north
  g-buffer (`decodeExrGbuffer`) and render (`decodePng`), runs
  `gbufferDepthOutOfRange` on north and throws the existing named error on
  failure — identical to today's north handling.
- `resolveBundleView(descriptor, source, slot)` → `{ layer }` or
  `{ skipped }`. Re-reads the file, `readBakeEntry`-inflates only that
  slot's g-buffer/render, decodes, and applies the render-pass and depth
  guards, returning the named skip reason on failure.

`loadBundleViews` is re-expressed on top of these (north + resolve every
extra) so `views-verify.ts` and any eager consumer keep working, but the
world path uses the lazy primitives. `loadBundleLayer` stays north-only.

*Alternative:* decode all views but spread across `requestIdleCallback`
— rejected, still pays full inflate/decode and blocks between frames.

### D4 — Session cache keyed by file identity

A module-level `Map` in `assets.ts` keyed by `sprites/<name>` stores
`{ file, size, lastModified, descriptor, views: Map<slot, layer>,
skips: Map<slot, reason> }`. `loadBundleNorth`/`resolveBundleView` consult
and populate it. A mismatch in `size`/`lastModified` drops and reloads the
entry. The cache holds decoded layer data and the `File` handle (not the
raw zip bytes, which are released after each read) and is **in-memory
editor state only — never serialized into worlds, bundles, or any
persisted format (ADR 0006).**

### D5 — World store resolves directions on use

- `openWorldDoc`: load north for every unique asset, build `doc.layers`
  from north layers, place all sprites (their stored `dir` is already
  kept on the placement). Referenced non-north directions are then
  resolved with background `void ensureView(...)` tasks; until one
  resolves the renderer's existing layer lookup falls back to north, and
  it repaints the correct view when the layer is appended. A world that
  references no extra direction never decodes one.
- `selectBrush`: load/read north only; register the descriptor.
- `cycleBrushDir` / `cycleSelectedSpriteDir`: `await ensureView(...)`
  before switching, so a selected direction is always backed by a
  decoded layer (or falls back to north with the skip note).
- `ensureView(docId, asset, slot)`: return if the layer is present; else
  `resolveBundleView`, append the pinned-id layer to `doc.layers` on
  success, or record the skip note and leave north active on failure.
- Placement-time direction resolution stays synchronous because the brush
  direction was already ensured before it could be selected.

### D6 — Docs and ADR

`docs/decisions/0014-lazy-sprite-view-decode.md` records the durable
trade-off (decode views on demand, defer validation, cache per file,
never serialize). Update `docs/runtime.md` (world load path),
`docs/bake-pipeline.md` (reader is manifest-first; bytes unchanged),
`docs/glossary.md` (lazy view), `docs/roadmap.md`.

## Risks / Trade-offs

- **Temporary north fallback for restored extra-direction placements** →
  the placement repaints its real view as soon as the background resolve
  finishes; usually immediate from cache. Accepted in exchange for a fast
  open.
- **First selection of a direction has a one-time decode stall** → only
  that slot is inflated/decoded (measured ~1.4 s inflate + ~0.46 s EXR
  for a 2048² view, vs ~5 s + ~1.8 s for four), and the result is cached;
  a status line already reports loading.
- **Remembered `File` handles and decoded layers consume memory** → one
  decoded half-float g-buffer per used view per asset; the same data
  already lived in `doc.layers`, so the delta is bounded by views used
  across open documents, and unused views are never allocated.
- **Verifier churn** → `views-verify.ts` moves the extra-view guard
  assertions to the on-demand resolver; add a manifest-only/only-requested
  decode assertion.

## Migration Plan

No data migration. Existing `/4`/`/5`/`/6` bundles and saved worlds load
unchanged; the cache is rebuilt per session. Rollback is reverting the
commit — no persisted state depends on the new behavior.
