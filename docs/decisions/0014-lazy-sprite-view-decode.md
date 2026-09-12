# 0014 — Sprite views decode lazily and cache per source file

Status: Accepted (2026-09-12, change `lazy-sprite-view-loading`)

## Context

A world loads sprite bundles through `loadBundleViews`
(`src/runtime/assets.ts`), which inflated the whole `.sprite` zip at once
and decoded the north view plus **every** stored E/S/W view before the
document appeared. The g-buffer passes dominate: they are `NO_COMPRESSION`
float EXR (ADR 0005), so a 58 MB bundle expands to hundreds of MB that are
inflated and per-pixel-decoded synchronously on the main thread, four
times over, even though the compositor draws one direction per placement.
There was no cache, so every world open and brush pick repeated the work.
The load-time stale-depth guard (rejecting pre-ADR-0005 camera-frame slots)
was the reason every extra view had to be decoded up front.

## Decision

The bundle reader splits into a manifest-first path and an eager path
(`src/bake/bundle.ts`):

- `parseBakeManifest()` inflates only `manifest.json` and returns the
  north view's and each extra slot's pass **file names** and rect.
- `readBakeEntry()` inflates exactly one named entry via fflate's
  `unzipSync(..., { filter })`.
- `parseBake()` stays for the sprite editor, which wants every pass.

The world runtime loads the north view eagerly and registers each extra
slot as a **lazy view** on the document (`WorldDocument.lazyViews`,
in-memory only, ADR 0006). A direction is decoded and depth-validated
(`resolveBundleView`) the first time a placement, brush, or `E` rotation
selects it; a view that lacks its render pass or carries out-of-range depth
is dropped with the named skip note and the direction falls back to north.
Decoded views are cached per source file for the session and invalidated
when the file's size or last-modified time changes. Placements whose view
has not decoded yet draw north rather than disappearing
(`placementLayerIndex`).

Bundle bytes, manifest fields, and the accepted format prefixes are
unchanged; old bundles load as before.

## Consequences

- Unused views are never inflated or decoded: for a four-view sprite the
  work drops from ~4 inflates + 4 EXR decodes to one of each, with extras
  paid only when used. The extra views' bytes are re-read from the file on
  first request (the raw zip is not held in memory), then cached.
- The stale-depth guard runs when a view is first used instead of at load,
  so `openspec/specs/runtime-sprite-rendering` now pins "resolve on first
  use" and a browser-visible skip note can appear later than before.
- The document carries a new in-memory `lazyViews` map; any future world
  serialization must ignore it (ADR 0006).
- The cache and the remembered `File` handles are session state; a page
  reload rebuilds them.

## Rejected alternatives

- **Decode all views but spread across idle callbacks** — still pays full
  inflate and decode, and blocks between frames.
- **Worker/background decode** — keeps the UI responsive but not faster,
  is unverifiable in this environment (no headless browser), and is a
  larger change; left as a follow-on.
- **Store the g-buffer as half-float EXR** — halves file and decode cost
  but needs a format change and a re-bake to benefit; separate concern.
- **Hold the raw zip bytes in the document to avoid re-reads** — trades
  disk reads for tens of MB of resident memory per asset; the per-view
  decode already happens once and is cached.
