# Roadmap

Point-in-time status. Fine-grained behavior contracts live in
`openspec/specs/`; per-change records in `openspec/changes/`. Update this
list when a change lands (and prune it — history belongs in the archives;
each line below has a full record there).

## Done

- **Bake core** — test primitives + box-frame camera math (arbitrary
  cuboids), raster g-buffer bake + PNG/EXR export, single-file `.sprite`
  zip bundle + manifest (ADR 0004), path-traced `render` pass over the
  same ortho camera (HDRI environments, full PBR, ACES, deterministic
  tile-grid accumulation with a live preview; ADR 0002 removed the
  albedo/ao passes), optional baked grounding shadow, clip volume always
  contains the framed model, provenance so bundles re-bake in place.
- **glTF sources** — `.glb` and multi-file `.gltf` (nested `models/`
  folders), static meshes, per-material draw groups, alpha-mask coverage,
  origin normalization + height-in-meters scaling, DRACO/Meshopt/KTX2
  rejection, in-place `KHR_materials_pbrSpecularGlossiness` →
  metallic-roughness conversion for workspace `.glb`s.
- **Bake editor** — multi-view bakes (`isoinfinity-bake/6`): N/E/S/W view
  slots with the model rotated, not the camera (ADR 0005), per-slot
  viewport + Bake All; stale view-slot depth rejected on load. Authored
  origin anchor (ADR 0008) with per-slot re-projection. Bake-setting
  presets (`isoinfinity-bake-preset/1`). Sprite editor viewport: realtime
  3D preview, zoom/pan, box overlay, 1.8 m human reference.
- **Editor shell** — the integrated React editor (`src/app/`) replacing
  the separate bake/runtime pages: tabs over in-memory documents (ADR
  0006), project browser, context-sensitive properties panel, status bar;
  workspace folders (File System Access API) with nested subfolder
  navigation, a native-style file dialog, and save-in-place + Save As;
  icon toolbars, slider + numeric inputs.
- **World runtime** — free-form cursor-anchored sprite placements (the
  authored anchor lands at the cursor, ADR 0008) with heights (shift-drag,
  fields + sliders, surface snap, contact shadows, plumb gizmo), N/E/S/W
  placement directions (`isoinfinity-world/3`), grounding shadows
  composited at runtime (ADR 0010), a material-backed ground plane +
  world HDRI, sun position (`src/shared/sun.ts`), unified deferred
  lighting (ADR 0011: ambient + key directional + up to 16 point lights
  over a screen-space g-buffer; world position from depth, ADR 0001), and
  skinned animated characters in the compositor (ADR 0007, `verify:mesh`).
- **Terrain material painting** — up to four ground material slots blended
  by an RGBA coverage splat, a radius/hardness paint brush with a
  normalized-replace stamp and per-stroke undo, displacement height-seam
  blending, and the splat persisted as a PNG beside the world JSON
  (`isoinfinity-world/8`, `verify:terrain`; ADR 0013).
- **World editor** — viewport navigation (scroll-pan/pinch-zoom/
  middle-drag/space-drag + dedicated pan tool, three-finger touch),
  depth-tested brush ghost, light tool +
  selectable light icons, Select tool with pixel-accurate g-buffer picking
  (ADR 0012, `verify:selection`), terrain paint tool, undo/redo
  (`verify:history`), per-world ground size (new-world dialog + panel
  resize, 1–128 units; `isoinfinity-world/7`), tool-gated panels/chrome, a
  viewport layer-visibility dropdown (top-right) hiding/showing the ground,
  sprite, and mesh layers (transient per-document state; hidden layers stop
  rendering, picking, and snapping), and the asset-browser brush picker
  (file-browser modal with sprite thumbnails and cross-folder search; the
  toolbar shows the current-brush label, a "…" picker, and a
  previously-used-brushes dropdown). **Removed:** the
  sprite editor's "Place in world" hand-off — sprites reach a world by
  saving to `sprites/` and picking as a brush; worlds are created only
  explicitly (with a size).
- **Lazy sprite view loading** — the world editor reads a bundle's manifest
  only and decodes its north view eagerly; extra E/S/W views are inflated
  and decoded on first use, with the depth/render checks deferred to that
  point, and decoded views are cached per source file for the session
  (`verify:bundles`; ADR 0014), so loading a large multi-view sprite no
  longer pays for directions the world never uses.
- **Sprite load structure** — the reader retains a bundle's compressed bytes
  (bounded by a session byte budget) so resolving an extra view never
  re-reads the file; decoded views are cached under a workspace-scoped key;
  layers upload tight at their own size and are appended without re-uploading
  or rebuilding the renderer, and the world viewport keeps one renderer for
  the document (`verify:bundles`/`verify:selection`/`verify:shadows`; ADR
  0014 amended, ADR 0016); boot-baked primitives are cached per session.
  Removed CPU layer padding entirely.
- **Texture decode** — bundle render passes stay the decoded `ImageBitmap`
  and upload straight to the sprite texture array (no canvas `getImageData`
  readback; `verify:bundles`/`verify:selection`/`verify:shadows`; ADR 0017),
  and decoded ground-material maps are session-cached under a
  workspace-scoped key (`verify:terrain`), so a re-open does not re-decode
  them. Half-float g-buffer storage remains a separate planned follow-up.
- **Half-float g-buffer + thumbnails** — new bakes are format `/7`: the
  g-buffer is stored half-float (`exr-f16-linear`, deflated by the bundle)
  and every bundle with a render pass carries a 128×128 `<id>-thumb.png` +
  manifest `thumbnail` field (`verify:bundles`; ADR 0018). `/4`–`/6`
  full-float bundles keep loading through the same half-float decode path.
- **Load tracing** — opt-in, in-memory per-phase timings for sprite decode,
  world open and material decode/upload, logged as copyable
  `[loadtrace] <tag> <ms>ms` lines and summarized via `__loadTraceSummary()`
  (`verify:trace`), so the next optimization targets a measured bottleneck
  rather than a guess; diagnostics only, never serialized (ADR 0006).
- **Directional shadows** — the key directional light casts a real shadow
  from a world-space occluder reconstructed at runtime from the placed
  sprites' baked g-buffers, ray-marched in the deferred pass; characters
  splat their live skinned vertices into the same field so sprite and mesh
  shadows compound. The key light is confined to a shadow-valid domain
  (cone around the camera view ray + elevation floor); fully automatic with
  no authoring step (`verify:shadows`; ADR 0015).

## In progress

Nothing in flight.

## Planned

- Dynamic-mesh follow-ons: mesh placement serialization, locomotion,
  dynamic-ground geometry (the same batch, unskinned), multi-character
  instancing.
- Shadow follow-ons: remove the baked grounding shadow once directional
  shadows are visually verified (contact/AO term to reconsider), a
  layered/voxel occluder for overhangs, an optional user shadow toggle, and
  a load-time per-view occluder point cache if rebuild cost shows. Optional
  x/z snapping alongside surface snap for one-click aligned stacking.
- Supersampling (render at N× and box-downsample), multi-cube composite
  assets, geometry-level clipping (CSG) instead of shader discard,
  KTX2/UASTC packaging for delivery (the merged g-buffer is already in the
  packed delivery layout), raytraced golden-image diff as a validator,
  Draco/Meshopt/KTX2 decode for glTF inputs, skinned bind-pose extraction,
  bake "application" shell (sessions/projects, batch queue, HDRI library),
  screen-space denoiser option (field exists, wired off), OIDN-class
  denoising for low-sample bakes.
