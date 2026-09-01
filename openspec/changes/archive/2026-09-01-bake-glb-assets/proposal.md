# Proposal: Bake glTF assets (GLB / glTF)

## Why

The bake tool only bakes seven hard-coded test primitives with a single flat
albedo color, so the pipeline cannot consume real art. Every DCC tool exports
glTF/GLB; loading them turns the bake app from a geometry test bench into
the actual asset-authoring entry point and validates the bake format against
arbitrary, non-analytic geometry for the first time.

## What Changes

- Add glTF loading to the bake tool: pick or drop a `.glb` file (or a plain
  `.gltf` together with its external `.bin` and texture files), parse it with
  three's `GLTFLoader` (no new dependency), and bake it through the existing
  MRT pipeline into the same bundle format (`isoinfinity-bake/3`).
- Resolve external `.gltf` resources against the picked file set
  (multi-select / drag-drop), with a clear error naming any missing file.
- Bake **textured albedo**: per-pixel color comes from each material's
  base-color texture (times its base-color factor), replacing the flat
  `uAlbedo` uniform for glTF sources.
- Accept static meshes only: all visible mesh nodes are merged into one
  geometry; skins, animation channels, and unsupported extensions are skipped
  with a clear status message.
- Normalize placement: translate the model so its bounding-box minimum corner
  sits at the world origin `(0,0,0)`; keep native glTF dimensions, with a UI
  scale control to uniformly rescale before baking (`size` in the manifest
  reflects the scaled box).
- UI: add a "Load glTF" source next to the primitive buttons, a scale input,
  and the same inspect/bake/download flow as primitives.

## Capabilities

### New Capabilities

- `asset-baking`: the bake tool's observable behavior — sourcing geometry
  (built-in primitives and glTF files), baking the per-pixel passes (textured
  albedo, world-normal + linear-depth g-buffer), and emitting the manifest +
  zip bundle consumed by the runtime.

### Modified Capabilities

- (none — no specs exist yet; this change establishes `asset-baking`)

## Impact

- `src/bake/`: new glTF load/merge module (both containers, `.gltf`
  external-resource resolution); `bake.ts` material/shader must
  source albedo per-pixel (texture sampling) instead of one uniform;
  `main.ts` + `bake.html` gain the glTF source button and scale input.
- `BakeResult`/manifest: `albedoHex` is primitive-only; glTF bakes carry
  textured albedo with no single source color (manifest impact assessed in
  design).
- Bundle format and `parseBake()` (`src/bake/bundle.ts`) stay compatible —
  the runtime consumes produced bundles unchanged.
- Dependency: none added (`GLTFLoader` ships with `three` 0.185).
