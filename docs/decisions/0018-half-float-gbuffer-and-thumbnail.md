# 0018 — Half-float g-buffer storage and per-asset thumbnails

Status: Accepted (2026-09-15, change `store-gbuffer-half-float`)

## Context

The g-buffer is half-precision data (unit normals + a bounded linear depth)
but was stored as an uncompressed **f32** EXR and then deflated by the
bundle. That is ~2× the bytes the data needs, and the runtime converts every
texel back to half on load. Because the reader now retains bundle bytes
(ADR 0014), the excess also costs retained memory. Re-baking is required to
change the storage, so the same pass also writes a small preview image.

## Decision

New bakes are format `isoinfinity-bake/7`:

- The g-buffer entry is a **half-float** EXR (`encoding: exr-f16-linear`,
  same channels), written by `encodeExr` via `EXRExporter` at
  `HalfFloatType` with `NO_COMPRESSION` and **deflated by the bundle**
  (`level: 6`). The runtime decodes f16 and f32 through the same
  `EXRLoader`/`HalfFloatType` path, so `/4`–`/6` bundles load unchanged.
- A bundle that carries a render pass also carries a `128×128` RGBA PNG
  thumbnail (`<id>-thumb.png`) referenced by a top-level manifest
  `thumbnail` field. It is derived from the N render (aspect-fit, transparent
  letterbox), generated on the browser save path and passed as bytes into the
  DOM-free bundle builder.

The parser accepts `/4`–`/7`. `encodeExr`'s conversion does **not** change
row order; the runtime re-flips on decode exactly as before.

## Consequences

- Bundle bytes for the g-buffer roughly halve; the loader no longer converts
  f32→f16 (it copies half scanlines).
- Older full-float bundles keep loading with no re-bake; only new saves get
  f16 and a thumbnail.
- The thumbnail is opaque bytes to `src/bake/`; the Node verifier tests the
  entry/field with fake bytes, and the real generation is browser-only.
- Re-baking the same primitive now produces `/7` bytes (different from the
  pre-change output) but stays deterministic (fixed mtime).

## Rejected alternatives

- **EXR-native ZIP compression** — three's `EXRExporter` ZIP output does not
  round-trip through its own `EXRLoader` (f16 and f32 both decode to garbage;
  only `NO_COMPRESSION` round-trips, verified). The working bundle deflate
  stays.
- **Full-float + EXR ZIP** — no size win, and still hits the round-trip bug.
- **Thumbnail as a sibling file** — breaks the single-file asset model
  (ADR 0004) and the workspace listing; the bundle is the asset.
- **Quantized/octahedral normals** — a larger change to the runtime
  representation for a further size win; separate concern.
