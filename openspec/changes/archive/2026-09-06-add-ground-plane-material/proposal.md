# Proposal: add-ground-plane-material

## Why

The world editor has no real ground: sprites and meshes stand against a flat
unlit color batch that participates in neither depth nor lighting. A
material-backed ground plane gives the world a lit, depth-correct surface and
a place for future terrain work, and exercises the runtime material pipeline
(PBR-style maps) that the dynamic mesh path does not have yet.

## What Changes

- Add a flat ground plane spanning the world bounds, rendered as real
  world-space geometry in the raw WebGL2 compositor (writes the shared linear
  `gl_FragDepth`, like the mesh path).
- Add a ground material system: zip files with a `.material` extension in the
  workspace's `materials/` folder, containing three maps identified by
  `<material_name>_(diff|arm|nor_gl)_*.(exr|png|jpg)` — Diffuse,
  AO/Roughness/Metal (rgb-encoded), Normal (gl convention).
- Render the ground in a lean PBR style: diffuse albedo + tangent-space
  normal map, lit by the world's HDRI (ambient) plus the world's directional
  key light on top, matching the mesh path's tone pipeline (ACES, exposure,
  saturation). ARM is decoded but only AO is applied for now; specular and
  reflections are later work.
- The world's HDRI becomes user-selectable (not only inherited from sprite
  bake provenance) and is persisted with the world.
- The ground's material and tile scale are adjustable in the world editor
  properties panel and persisted in the world JSON.
- The ground is backdrop only: not pickable, not erasable, no g-buffer
  sprite passes.

## Capabilities

### New Capabilities

- `runtime-ground-rendering`: the ground plane — geometry, material shading,
  depth integration with sprite compositing, tiling, and its backdrop role.

### Modified Capabilities

- `world-persistence`: world JSON gains ground state (material reference,
  tile scale) and a user-selected world HDRI; older world files without
  ground fields keep loading.
- `workspace`: the folder convention gains `materials/`; material zip assets
  are discoverable and loadable from it.

## Impact

- `src/runtime/renderer.ts` — new ground program (textured, normal-mapped,
  depth-writing), replacing the flat ground batch draw for the world plane.
- `src/runtime/world.ts` / `src/app/store/world.ts` — ground + world-HDRI
  state; world JSON format `isoinfinity-world/1` gains optional fields
  (additive; old files tolerated).
- `src/shared/workspace.ts` — `WORKSPACE_FOLDERS` gains `'materials'`.
- New material loading module (zip open, map identification, decode incl.
  EXR/PNG/JPG reuse of existing decoders).
- Editor: project browser shows `materials/`; world properties panel gains
  ground material picker, tile-scale control, and HDRI picker.
- Docs: `docs/runtime.md` and `docs/glossary.md` updated; roadmap row. ADR
  needed for the render-framework decision (stay on the raw WebGL2
  compositor, three.js stays CPU-side only).

## Non-goals

- Height-editable / subdivided terrain (future change).
- Specular BRDF, reflection probes, IBL specular from the HDRI.
- Arm/roughness/metal semantics beyond decoding (AO applied; R/M reserved).
- Mesh-path upgrade to ARM/normal-map materials.
- Ground picking, erasing, painting, or placement interaction.
