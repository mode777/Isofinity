# Roadmap

Point-in-time status. Fine-grained behavior contracts live in
`openspec/specs/`; per-change records in `openspec/changes/`. Update this
list when a change lands (and prune it — history belongs in the archives).

## Done

- Test primitives (sphere, donut, cube, cylinder, capsule, plane, slab
  2×0.5×1), box-frame camera math (arbitrary cuboids), raster bake (merged
  g-buffer), PNG + EXR export, single-file `.sprite` bundle, debug
  position dump, manifest, visual pass preview. `scratch-verify.html`
  (dev server) exercises the GPU-side checks and prints primitive bundle
  hashes (note: the albedo/ao pass removal changed all hashes —
  re-baseline before comparing across format versions).
- glTF sources (`.glb` and `.gltf` + `.bin` + textures) — static meshes
  only, per-material merged draw groups, alpha-mask coverage, origin
  normalization with a UI uniform-scale control, compressed-payload
  rejection, same bundle output. In-place
  `KHR_materials_pbrSpecularGlossiness` → metallic-roughness conversion
  for workspace `.glb` models (glTF-Transform, textures re-encoded per
  texel, file overwritten in `models/`).
- Path-traced `render` pass (`three-gpu-pathtracer` 0.0.24) over the same
  ortho camera — HDRI environments with rotation/intensity/exposure/
  saturation, full PBR materials, ACES export identical to the preview,
  deterministic accumulation paced by GPU fences over a tile grid with a
  live converging preview, optional pass and provenance blocks.
- Removed: the unlit `albedo` pass and the path-traced `ao` pass (see
  `docs/decisions/0002`). Bundles carrying the legacy passes still load;
  the entries are ignored.
- Workspace folders (File System Access API, `src/shared/workspace.ts`) —
  `hdri/ models/ sprites/ worlds/ presets/` convention, workspace-backed
  model/HDRI/preset listings, bundle saves to `sprites/<id>.sprite`,
  IndexedDB handle persistence with one-click reconnect, graceful
  degradation to dialogs/downloads elsewhere.
- The integrated React editor (`src/app/`) replacing the separate
  `bake.html` + runtime pages — editor tabs over in-memory documents,
  project browser, context-sensitive properties panel, provenance with
  re-bake, in-memory place-into-world; height-in-meters model scaling with
  a toggleable box overlay across all viewport views; a realtime 3D mesh
  preview (`src/app/realtime.ts`) alongside the baked pass views.
- Bake setting presets (`isoinfinity-bake-preset/1` JSON in the
  workspace's `presets/` folder) — save/apply/delete from the sprite
  properties panel, HDRI resolved from `hdri/` with atomic named-error
  handling, texture size excluded, download/import fallback without a
  workspace.
- Multi-view sprite bakes (`isoinfinity-bake/6`) — N/E/S/W view slots at
  90° yaw steps with the model rotated, not the camera (see
  `docs/decisions/0005`), per-slot viewport + switcher, Bake All and
  Remove view actions; worlds still consume the N view.
- World editor viewport navigation — scroll-pan/pinch-zoom/middle-drag
  over the fixed projected world image (sprite-editor `ViewTransform`
  conventions, per-document in-memory state, picking invariant under the
  transform), three-finger touch panning, and a depth-tested brush ghost
  previewing the next placement under the cursor.
- Human-scale reference in the sprite editor's Realtime 3D view — a
  toggleable procedural 1.8 m figure standing beside the asset, fixed in
  the bake camera frame across view slots; editor chrome only (never
  baked, never persisted).

## Planned

- World placement of non-N views (placement orientation + runtime view
  selection — the `/6` view table is editor-consumable only today).
- Supersampling (render at N× and box-downsample), multi-cube composite
  assets, geometry-level clipping (CSG) instead of shader discard,
  KTX2/UASTC packaging for delivery (the merged g-buffer is already in the
  packed delivery layout), raytraced golden-image diff as a validator,
  Draco/Meshopt/KTX2 decode for glTF inputs, skinned bind-pose extraction,
  bake "application" shell (sessions/projects, batch queue, HDRI library),
  screen-space denoiser option (field exists, wired off), OIDN-class
  denoising for low-sample bakes.
