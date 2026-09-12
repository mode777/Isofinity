## Why

The world ground is currently a single tiled material: one `.material` zip
covers the whole plane, so an outdoor scene cannot show grass giving way to
dirt paths, sand, or rock. Artists need to author that variation directly in
the world editor with a brush, the way a terrain splatmap works in a paint
tool — and the seams must look natural rather than like a linear fade.

## What Changes

- Ground supports up to **four material slots** at once. Each slot is bound
  to a `.material` zip from the workspace; a single global tile scale applies
  to all slots.
- A new **terrain paint tool** in the world editor paints material coverage
  onto the ground with a cursor-anchored brush: adjustable **radius** (world
  units) and **hardness** (soft-to-hard edge), Photoshop-like stroke
  behavior (drag to paint continuously). The brush gizmo mirrors the
  point-light radius ring, adding an inner hardness ring.
- Coverage lives in a single **RGBA splat texture** in world space: RGB hold
  material slots 0/1/2, the alpha channel holds slot 3. Painting performs a
  **normalized replace** (component-wise lerp toward the painted slot), so
  painting one material over another replaces it instead of tinting both.
- Material blending uses each material's **displacement map** as a per-pixel
  surface height: where coverages meet, the higher material wins (height
  seam blend), producing natural edges. Displacement is used for blending
  only — no geometry movement.
- The material parser gains an optional **`disp` slot**
  (`disp` / `displace` / `displacement` in the map file name), alongside the
  existing `diff` / `arm` / `nor_gl` slots.
- The splat texture is persisted as a **PNG beside the world JSON** in the
  workspace's `worlds/` folder; the world file references it. This is the
  first asset a world owns rather than references.
- World format advances to `isoinfinity-world/8` (`ground.materials`,
  `ground.paint`); `/7` and earlier remain loadable (their single
  `groundMaterial` maps to slot 0, no paint).
- **BREAKING (format):** a `/8` ground carries a material array and an
  optional paint sidecar; older readers will not understand them. The
  editor still reads `/7` and earlier.

### Non-goals

- No geometric displacement, parallax occlusion, tessellation, or terrain
  shadow casting — displacement affects blend weights only.
- No more than four simultaneously bound materials (a fifth is reached by
  rebinding a slot, which keeps that slot's painted coverage).
- No procedural/automatic terrain, erosion, or sculpting; paint is the only
  authoring mechanism.
- No changes to the bake pipeline, sprite bundles, or bake-side materials.
- No workspace-free persistence of the splat (session-only without a
  workspace, consistent with ground-material fallback).

## Capabilities

### New Capabilities

- `terrain-material-painting`: the paint tool, brush model (radius,
  hardness, stroke), the four-material splat representation and its
  normalized-replace semantics, displacement height-seam blending, material
  slot binding, and the world-owned splat PNG lifecycle (save/load/resize/
  undo).

### Modified Capabilities

- `runtime-ground-rendering`: the ground renders up to four blended
  materials with displacement height seams instead of a single material; the
  material zip parser accepts an optional displacement map.
- `integrated-editor`: the world editor gains the terrain paint tool in the
  toolbar and a contextual brush/paint panel (radius, hardness, active
  material slot), with the paint gizmo in the viewport.
- `world-persistence`: `isoinfinity-world/8` serializes a ground material
  array and a paint descriptor, and saves/loads the splat PNG sidecar;
  earlier formats remain tolerated.

## Impact

- **Renderer** (`src/runtime/renderer.ts`): ground program samples four
  texture arrays (diffuse/normal/arm/disp, 4 layers each) plus the splat;
  new paint FBO; new `setGroundMaterials` / splat upload API. New shader
  stage for the height-seam blend.
- **Materials** (`src/app/groundMaterial.ts`): new `disp` slot and
  material-array descriptor; diffuse maps normalized to RGBA8 for the array.
- **World document/state** (`src/app/document.ts`,
  `src/app/store/world.ts`): `GroundState.materials[4]`, paint descriptor,
  decoded maps array, splat CPU/GPU state, new paint actions.
- **World file** (`src/app/worldFile.ts`): `/8` build/parse, sidecar PNG
  name derivation.
- **Editor** (`src/app/components/WorldEditor.tsx`,
  `WorldProperties.tsx`): paint tool id, pointer painting, gizmo, panel.
- **Workspace** (`src/shared/workspace.ts`): reuse `writeWorkspaceFile` for
  binary PNG (no new API expected).
- **Docs**: `docs/runtime.md` (ground rendering + paint tool), `docs/
  glossary.md` (splat, material slot, displacement map, height-seam blend),
  `docs/roadmap.md` (move terrain painting from planned to done), and a new
  ADR in `docs/decisions/` for the world-owned paint asset, the
  normalized-replace splat model, and the texture-array strategy.
  `docs/bake-pipeline.md` is unaffected (bake bundles unchanged).
- **Verification**: `npm run build`; Node-runnable checks for the `/8`
  world-file round trip and material `disp` matching (extend the existing
  verifier pattern); browser paint/blend checks left to the user.
