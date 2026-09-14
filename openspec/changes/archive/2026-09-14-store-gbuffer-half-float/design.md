## Context

See `proposal.md` — Why. The g-buffer is produced as a `Float32Array`
(GL-order) and exported by `encodeExr` (`src/bake/export.ts:77`) with
`EXRExporter` at `type: FloatType`, `compression: NO_COMPRESSION`; the outer
`zipSync` then deflates it (`buildBundle`, `src/bake/bundle.ts:32`). The
runtime already uploads half floats, so the f32 storage is excess precision
that is discarded on load. `EXRLoader` supports ZIP/ZIPS compression
(verified in the vendored three), so an f16 + ZIP EXR round-trips through the
same decoder the verifier uses. `buildBundle` is exercised by the
Node-runnable `views-verify`, which stubs `createImageBitmap`/`document`;
the thumbnail generator must therefore stay out of the DOM-free bundle core.

## Goals / Non-Goals

**Goals:**

- Store the g-buffer as half-float EXR with EXR-native compression; no double
  deflate.
- Keep every existing bundle (`/4`–`/6`, full-float) loadable unchanged.
- Emit a 128×128 thumbnail inside every new bundle that has a render pass.
- Keep `src/bake/` (bundle build) DOM-free and Node-verifiable.

**Non-Goals:**

- Displaying thumbnails in the project browser.
- Re-encoding existing bundles in place.
- Changing the render pass (`png-r8-srgb`) or the runtime's half-float upload.
- KTX2/GPU-compressed delivery or depth/normal semantics changes.

## Decisions

### D1 — `encodeExr` writes f16, deflated by the bundle

`encodeExr` converts its `Float32Array` input to half **without changing row
order** (`DataUtils.toHalfFloat` per component; no flip — the runtime re-flips
on decode exactly as today), builds a `DataTexture(data, w, h, RGBAFormat,
HalfFloatType)`, and calls `EXRExporter.parse(texture, { type: HalfFloatType,
compression: NO_COMPRESSION })`. `buildBundle` keeps deflating the g-buffer
entry (`level: 6`) and the manifest `encoding` becomes `exr-f16-linear`.
Existing `exr-f32-linear` bundles keep loading.

*Alternatives:* EXR-native ZIP (`ZIP_COMPRESSION`/`ZIPS_COMPRESSION`) was the
plan, but three's `EXRExporter` ZIP output does not round-trip through its own
`EXRLoader` — f16 and f32 both decode to garbage, while `NO_COMPRESSION`
round-trips exactly. So the working outer deflate stays; f16 still halves the
raw bytes (the test image: 67 → ~34 MB for a 2048² view before deflate).
f32 + EXR ZIP would be no size win anyway.

### D2 — Format `/7`, validation, and a manifest thumbnail field

`buildManifest` sets `format: 'isoinfinity-bake/7'` and, when a thumbnail is
provided, `thumbnail: { file: '<id>-thumb.png', width: 128, height: 128 }`.
`validateBakeManifest` accepts `/4`, `/5`, `/6`, `/7`. `parseBake` /
`parseBakeManifest` are otherwise unchanged, so `/4`–`/6` bundles parse as
before (their `exr-f32-linear` g-buffers decode through the same path).

### D3 — Thumbnail bytes are generated outside the bundle core

Add `renderThumbnail(render: PtImage, size = 128): Promise<Uint8Array>` to the
app/bake-store layer (DOM canvas): draw the N render (flipped to top-down)
aspect-fit and centered onto a transparent `128×128` canvas and encode PNG.
`buildBundle` gains an optional `thumbnail?: Uint8Array`; when present it adds
`<id>-thumb.png` (stored) and the manifest field; when absent, nothing. This
keeps `src/bake/` DOM-free: `views-verify` passes fake bytes to test the
manifest/entry, and the real generation is covered by the browser harness.

*Alternative:* generate inside `buildBundle` — rejected, it would make the
Node verifier require a canvas stub and couple the format core to the DOM.

### D4 — The compatibility read path

The runtime already decodes with `EXRLoader` at `type: HalfFloatType`, which
copies half-float scanlines and converts full-float ones; no decode change is
needed. The only required change is accepting `/7` in the parser's format
validation. A `loadBundleViews` case covers a `/6` f32 bundle and a `/7` f16
bundle producing the same half-float texture data.

### D5 — Docs and ADRs

`docs/bake-pipeline.md` (format-history table gains `/7`; bundle layout: f16
EXR stored, thumbnail entry), a new ADR recording the f16 encoding +
thumbnail, a note on ADR 0004 (the g-buffer is no longer double-deflated),
`docs/glossary.md`, `docs/roadmap.md`.

## Risks / Trade-offs

- **Half-float depth precision** → the runtime already stores depth as half,
  so this is bit-identical to today's post-load data; the load-time range
  check's epsilon already accommodates half precision.
- **EXR ZIP is pure JS** → decode cost is comparable to the outer inflate it
  replaces, on half the bytes; `verify:bundles` round-trips it in Node.
- **Re-bakes change bundle bytes** (`/7`, f16, thumbnail) → expected; the
  fixed mtime keeps re-bakes deterministic. Existing bundles are untouched.
- **Thumbnail is DOM-only** → kept out of `src/bake/`; a bundle saved where a
  canvas is unavailable (node) simply omits it, and the browser path always
  has one.
- **Some verifiers assert `/6`/byte conventions** → they are updated to `/7`
  and to the f16 decode; the `exr-f32` tolerance case is added.
