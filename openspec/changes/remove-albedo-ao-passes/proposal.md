## Why

The path-traced `ao` pass is known broken — it accumulates empty output on
tested hardware and ships labeled broken, slated for replacement with a
different approach. The unlit `albedo` pass, meanwhile, is consumed nowhere
at runtime: the sprite runtime requires the path-traced `render` pass and
shades that image over the baked g-buffer, so the albedo PNG is dead weight
that inflates every bundle and clutter that the editor previews without any
consumer. Removing both passes now deletes broken UI, shrinks the asset
format, and leaves the engine with exactly the passes it uses: the merged
g-buffer (normals + depth) and the lit render.

## What Changes

- **BREAKING**: sprite bundles no longer contain the `<id>-albedo.png`
  pass. A bake produces the merged g-buffer EXR (rgb = world-space normal,
  a = linear ray depth) plus the optional path-traced `render` PNG —
  nothing else.
- **BREAKING**: the optional `ao` pass is removed end to end: the
  path-traced AO machinery (occlusion material, BVH setup, accumulation
  blend) in the baker, the `aoSamples`/`aoRadius` settings, the
  `renderer`/`provenance` manifest fields, bundle entries, and every editor
  surface (ao pass preview, bake/re-run buttons, AO sliders).
- The raster bake becomes a single-target draw producing only the g-buffer;
  material alpha (glTF MASK cutoff) still discards fragments so coverage
  semantics survive as g-buffer emptiness (all-zero normal) and render-pass
  alpha.
- The sprite editor's pass previews show g-buffer (normal/depth modes) and
  render; the albedo figure and all AO controls disappear from the sprite
  editor and properties panel.
- The bundle parser keeps accepting `/4` and `/5` manifests and resolves
  passes through the manifest table, so existing bundles that still carry
  albedo/ao entries keep loading (those entries are ignored); the format
  string stays `isoinfinity-bake/5`.
- Material color inputs are unchanged: base-color textures/factors and full
  PBR materials continue to feed the path-traced render stage — they are
  source material data, not a stored pass.
- Docs (`docs/bake-pipeline.md`, AGENTS notes) and the `scratch-verify`
  GPU-side checks are updated to the two-pass reality.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `asset-baking`: the pass set shrinks to g-buffer + optional render; the
  "textured albedo" requirement becomes base-color material data feeding the
  render stage; coverage moves fully to g-buffer/render semantics; the
  path-traced AO pass requirement is removed; bundle, provenance, and
  re-bake requirements drop albedo/AO fields.
- `integrated-editor`: the sprite properties panel's pass actions become
  raster bake + render pass (no AO pass action).
- `runtime-sprite-rendering`: the boot-bake requirement bakes g-buffer and
  rendered passes (no albedo pass); bundle-acceptance wording matches the
  reduced pass set.

## Impact

- `src/bake/`: `bake.ts` (MRT targets 2 → 1, drop the albedo attachment and
  `BakeResult.albedo`), `pt.ts` (remove `aoPass`, AO material/BVH/blend
  code, `aoSamples`/`aoRadius` from `PtSettings`), `export.ts` (manifest
  pass table, `BakeProvenance.bake` shape), `bundle.ts` (bundle entries and
  `parseBake`), `bundleView.ts` decoding.
- `src/app/`: `document.ts` (drop `ao` document state), `store/bake.ts`
  (drop `runAoPass`, AO settings clamps, provenance fields, save extras),
  `SpriteEditor.tsx` (drop albedo/ao figures), `SpriteProperties.tsx`
  (drop AO sliders and button).
- `src/runtime/`: unchanged — `SpriteLayer` already carries only g-buffer +
  render, and `loadBundleLayer` already rejects bundles without a render
  pass.
- Dependencies: `three-gpu-pathtracer`'s `AmbientOcclusionMaterial` and
  `three-mesh-bvh` imports drop out of `pt.ts` (packages stay installed for
  the path tracer itself).
- Verification: `npm run build` (typecheck + bundle); `scratch-verify`
  GPU checks updated but browser-verified by the user, per the toolchain
  constraint.
