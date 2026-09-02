# Proposal: path-traced-bake-render

## Why

The bake's color pass is unlit (flat color or raw base-color texture), so the
only "light" an asset can ever show is the runtime's Lambert key + ambient —
far below the prerendered quality of the PoE reference architecture, whose
baked image is a fully lit beauty render that dynamic lights merely conform
to. To reach that quality the pipeline needs a physically based render stage
(HDRI illumination, path-traced GI) producing a lit pass — without touching
the frozen g-buffer (world-space normal + linear ray depth) or the unlit
albedo pass that dynamic re-lighting depends on.

## What Changes

- Add a **path-traced render stage** to the bake tool using
  `three-gpu-pathtracer` (WebGL2, established technology), rendering the same
  scene through the same fixed isometric orthographic camera as the raster
  bake. Orthographic projection and a transparent background (proper sprite
  alpha on rendered pixels, `alpha = 0` elsewhere) are hard requirements.
- Add an **HDRI environment**: load equirectangular `.hdr` files, use them as
  the PT scene environment (image-based lighting), with rotation, intensity,
  exposure and background visibility controls; `scene.background = null` so
  camera-miss rays contribute transparent pixels only.
- Produce a new **`render` pass**: the ACES-tone-mapped, sRGB-encoded beauty
  image (RGBA; alpha = antialiased coverage), exported so the on-screen
  preview and the exported PNG are pixel-identical.
- Produce an optional **`ao` pass**: path-traced ambient occlusion
  (`AmbientOcclusionMaterial` + BVH, cosine-hemisphere rays, radius and
  sample controls), accumulated with the same camera, exported as grayscale.
- Feed **full PBR materials** to the render stage: glTF base-color,
  metallic-roughness and normal textures are consumed by the PT pass
  (today's pipeline keeps only base color). The raster g-buffer pass is
  unaffected and keeps using its own material-independent shader.
- **BREAKING**: bump the bundle manifest to `format: "isoinfinity-bake/4"`.
  The g-buffer EXR and albedo PNG keep today's exact conventions; the render
  and AO passes are optional entries in the bundle; the manifest gains
  environment/tonemap/renderer metadata and per-pass presence. Old runtimes
  reject v4 bundles; the new parser accepts v3 and v4.
- Runtime: consume v4 bundles and give each placed sprite (plus a global
  default) a **display mode** — "baked" (sample the lit `render` pass, alpha
  from that pass) or "unlit" (today's albedo + key/ambient dynamic lighting,
  default). Per-pixel occlusion stays g-buffer-depth-driven in both modes.
- New dependencies: `three-gpu-pathtracer`, `three-mesh-bvh`.

## Capabilities

### New Capabilities

- `runtime-sprite-rendering`: how the runtime displays baked sprites —
  consumption of optional render/AO passes from v4 bundles, the per-sprite
  baked/unlit display-mode switch, and the invariant that occlusion and
  hit-testing remain g-buffer-driven regardless of display mode.

### Modified Capabilities

- `asset-baking`: new requirements for the path-traced render pass
  (HDRI environment, ortho camera, transparent alpha, ACES export), the
  optional AO pass, PBR material consumption for the render stage, and the
  v4 bundle/manifest with optional passes and renderer metadata.

## Impact

- `src/bake/bake.ts` — unchanged raster MRT path (albedo + g-buffer).
- New `src/bake/pt.ts` (or similar) — path-traced render + AO stages.
- `src/bake/gltf.ts` — build a PBR-complete material/scene description for
  the PT stage (base color, metallic-roughness, normal maps, alpha modes).
- `src/bake/bundle.ts` + `src/bake/export.ts` — manifest v4, optional pass
  files, tonemapped render/AO export.
- `bake.html` + `src/bake/main.ts` — HDRI loader/controls, PT settings
  (samples, bounces, AO radius), pass gallery entries, bundle download.
- `src/runtime/` — v4 bundle parsing, per-sprite texture layers for
  render/ao, display-mode switch in the renderer/compositor.
- `docs/bake-pipeline.md`, `docs/runtime.md` — new pass table, format /4,
  runtime display modes.
- Verification: static only (`npm run build`); GPU/visual checks remain with
  the user (no browser in this environment).
