## 1. Half-float g-buffer encoding

- [x] 1.1 Convert `encodeExr` (`src/bake/export.ts`) to half-float without changing row order (per-component `DataUtils.toHalfFloat`), export via `EXRExporter` at `type: HalfFloatType` with `NO_COMPRESSION`, and keep the manifest `encoding` as `exr-f16-linear`; verify `npm run build` and that `views-verify` still round-trips the g-buffer
- [x] 1.2 In `buildBundle` (`src/bake/bundle.ts`) store the g-buffer zip entry at `level: 6` (deflate it in the bundle) and keep the fixed mtime; verify `npm run verify:bundles` passes and reports the g-buffer entry name/encoding as `exr-f16-linear`

## 2. Format /7 and the compatibility read path

- [x] 2.1 Set `buildManifest`'s format to `isoinfinity-bake/7` and widen `validateBakeManifest` to accept `/4`–`/7`; verify `npm run build` and that `parseBake`/`parseBakeManifest` reject an unknown prefix by name
- [x] 2.2 Add a `views-verify` case that a hand-built `/6` bundle with an `exr-f32-linear` g-buffer decodes to the same half-float data as an equivalent `/7` f16 bundle, and that a `/7` bundle loads; verify the case passes
- [x] 2.3 Update any verifier assertions pinned to `/6` or to the old EXR bytes to the `/7`/f16 conventions (keeping an explicit legacy-tolerance case); verify `npm run verify:bundles` passes

## 3. Per-asset thumbnail

- [x] 3.1 Add an optional `thumbnail?: Uint8Array` to `buildBundle`: when present, add a stored `<id>-thumb.png` entry and a manifest `thumbnail: { file, width: 128, height: 128 }`; when absent, write neither. Keep `src/bake/` DOM-free; verify with a `views-verify` case using fake bytes (entry present, manifest field set, and omitted when not passed)
- [x] 3.2 Add `renderThumbnail(render, size = 128)` in the app/bake-store layer that draws the N render (top-down) aspect-fit and centered on a transparent 128×128 canvas and encodes PNG; verify it compiles and is only called on the browser save path
- [x] 3.3 Generate the thumbnail from the document's committed N render and pass it to `buildBundle` in the bundle save path (`src/app/store/bake.ts`), for both workspace save and download fallback; verify `npm run build` and that a browser save produces a bundle with a thumbnail (left to the user)

## 4. Docs and ADRs

- [x] 4.1 Add an ADR recording the f16 g-buffer + thumbnail decision and index it in `docs/decisions/README.md`; add a note to ADR 0004 that the g-buffer is no longer double-deflated; verify both render and the index lists the new row
- [x] 4.2 Update `docs/bake-pipeline.md` (format-history row for `/7`, bundle layout with the f16 EXR and thumbnail entry), `docs/glossary.md`, and `docs/roadmap.md`; verify the docs describe the shipped format and that `/4`–`/6` are documented as still loading

## 5. Verification

- [x] 5.1 Run `npm run verify:bundles`, `npm run verify:trace`, `npm run verify:selection`, `npm run verify:shadows`, and `npm run build`; confirm all pass
- [x] 5.2 Hand the user the browser recipe (`npm run dev`: bake a primitive, save, and inspect the `.sprite` for the half-float g-buffer and `<id>-thumb.png`; re-open an existing `/6` bundle to confirm it still loads)
