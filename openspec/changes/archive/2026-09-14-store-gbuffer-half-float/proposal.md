## Why

The g-buffer is half-precision data (unit normals + a bounded depth) but is
stored as an **f32, uncompressed EXR** and then deflated inside the zip. That
is roughly twice the bytes the data needs, and the loader converts every
texel back to half on the way in (`EXRLoader` with `HalfFloatType`). Measured
on a 2028×1880 view: a 54 MB bundle, ~320 ms inflate + ~168 ms EXR decode,
and it dominates retained memory now that the reader keeps bundle bytes.
Storing f16 with EXR-native compression halves the bytes and removes the
conversion. Because existing bundles keep loading as-is, only a re-bake
benefits — so this change also emits a 128×128 thumbnail with every baked
asset while we are re-writing them anyway.

## What Changes

- **`isoinfinity-bake/7` stores an f16 g-buffer.** The g-buffer EXR SHALL be
  half-float (`encoding: exr-f16-linear`) and deflated in the bundle as
  before. New saves write `/7`. **Format bump.** (EXR-native compression was
  the plan, but three's `EXRExporter` ZIP output does not round-trip through
  its own `EXRLoader` — verified — so the working outer deflate stays.)
- **Compatibility loading path.** The reader SHALL accept `/4`–`/7` and both
  `exr-f32-linear` (older bundles) and `exr-f16-linear`; the runtime decodes
  either through the existing half-float path, so old bundles load unchanged
  with no re-bake.
- **Per-asset thumbnail.** Every saved bundle that carries a render pass
  SHALL include a 128×128 RGBA PNG thumbnail (`<id>-thumb.png`, aspect-fit
  with transparent letterbox) derived from the N-view render pass, plus a
  top-level manifest `thumbnail` field. Thumbnails are generated and saved
  only; displaying them is a separate follow-up.
- **Docs and ADRs**: `docs/bake-pipeline.md` (format-history table + bundle
  layout), a new ADR for the f16 encoding/thumbnail, `docs/glossary.md`,
  `docs/roadmap.md`, and an amendment note on ADR 0004's compression claim.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `asset-baking`: the bundle format is `/7` (f16 g-buffer with EXR-native
  compression) and saved bundles carry a thumbnail pass; the parser accepts
  `/4`–`/7`.
- `runtime-sprite-rendering`: the loader accepts `/4`–`/7` and decodes both
  half- and full-float g-buffer EXRs.

## Impact

- Code: `src/bake/export.ts` (`encodeExr` f16 + compression; `buildManifest`
  `/7` + `thumbnail` field), `src/bake/bundle.ts` (thumbnail entry in
  `buildBundle`; format validation), a thumbnail generator (from the N render
  `PtImage`), `src/runtime/assets.ts` (accept `/7`; decode either encoding),
  and the verifiers.
- Docs: `docs/bake-pipeline.md`, `docs/glossary.md`, `docs/roadmap.md`, a new
  ADR (and a note on ADR 0004).
- Format: **new `/7`.** `/4`–`/6` bundles load unchanged; only new bakes get
  f16 and a thumbnail. No world-format change.
- Verification: `npm run verify:bundles` (f16/thumbnail round trip + legacy
  f32 tolerance), `npm run verify:trace`, `npm run build`; the browser bake
  run is the user's.
- Non-goals (deliberately out of scope): displaying thumbnails in the
  project browser, re-encoding existing bundles in place, changing the
  runtime's half-float upload representation, KTX2/GPU-compressed delivery,
  and any change to depth/normal semantics or the render pass encoding.
