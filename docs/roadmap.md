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
  Remove view actions.
- Placement directions (`isoinfinity-world/3`, `/2`+`/1` still load) —
  multi-view bundles load every placeable view as a direction-tagged
  sprite layer; a brush-direction dropdown next to the brush select and
  the `E` key (cycle with wrap) pick the facing for new placements; the
  ghost previews the chosen view; each placement renders, occludes and
  lights from its direction's baked g-buffer and persists its direction
  (omitted when north); erase and picking stay direction-independent.
  No renderer, shading or bake-format changes.
- World editor viewport navigation — scroll-pan/pinch-zoom/middle-drag
  over the fixed projected world image (sprite-editor `ViewTransform`
  conventions, per-document in-memory state, picking invariant under the
  transform), three-finger touch panning, and a depth-tested brush ghost
  previewing the next placement under the cursor.
- Placement height (`isoinfinity-world/2`, `/1` still loads) — shift +
  vertical mouse move brush height (free-form, negative heights sink
  below the ground)
  with a manual toolbar height field and a surface-snap toggle taking
  the height from the visible surface under the cursor (CPU-side
  g-buffer unprojection), the height riding the existing
  per-instance depth offset so stacking/interpenetration stay
  pixel-exact with zero renderer-shader and zero bake changes, a
  plumb-line gizmo for raised ghosts, contact-shadow ellipses under
  raised placements, and topmost-first erase in a stack.
- Human-scale reference in the sprite editor's Realtime 3D view — the
  bundled base mesh normalized to 1.8 m, toggleable, draggable along the
  ground plane with a per-document in-memory spot, fixed in the bake
  camera frame across view slots; editor chrome only (never baked, never
  persisted).
- Bake projection clip volume always contains the framed model — near/far
  derived from the projected box corners (camera backing off deep boxes
  along the view direction) instead of fixed planes, so large models bake
  without near/far-clipped geometry; no format change, old sprites
  re-bake via provenance.
- Authored placement anchor (ADR 0008) — the sprite properties panel's
  Origin section (north view only) sets a 3D anchor in asset space with a
  ground-center convenience button; every view slot derives its anchor by
  the slot's quarter-turn, per-view `originPx` re-projects on edit without
  a re-bake, the anchor rides provenance (omitted at the default, no
  format bump), and placement lands it at the placement point while
  picking/erase stay cell-based.
- Cursor-exact anchor placement — sprite placement is free-form with no
  half-cell offset: the anchor point lands exactly at the mouse position
  as a 3D hover point (mouse ground track at the brush height; height 1 =
  cursor hovering 1 unit above the ground; anchor on ground ⟺ brush
  height 0, base on ground ⟺ brush height = anchor y), and the ghost
  matches the landed placement exactly. Character placement keeps its own
  convention; picking/erase unchanged.
- Ground plane + materials (`isoinfinity-world/4`, `/1`–`/3` still load) —
  a flat material-backed ground plane rendered as real world-space
  geometry writing the shared depth map (backdrop only, never
  pickable), lean PBR shading (diffuse + gl normal map + arm.r AO over
  the SH ambient + key light, ACES; roughness/metal decoded but unused —
  specular/reflections are follow-ons), `.material` zips in the new
  `materials/` folder convention, per-world material + tile-scale
  persistence, and a user-selectable world HDRI (overrides the
  provenance environment for the dynamic ambient only). Framework
  decision recorded as ADR 0009 (the compositor stays raw WebGL2).
- Baked grounding shadow — an optional per-document bake feature
  (default on): a soft, direction-agnostic ground darkening derived from
  the g-buffer footprint (unproject + splat + blur — no new renderer, no
  format bump) composited into the render pass's empty pixels as a
  blue-tinted mid-alpha patch; provenance records the toggle only when
  disabled; the sprite rect grows to the shadow reach. At runtime a third
  sprite pixel class blends it unshaded and writes its true ground-plane
  depth, so the existing LEQUAL batch resolves every shadow/sprite
  interleaving; raised placements suppress it (contact ellipses remain).
  The transparent-pixel depth rule is ADR 0010. Per-placement shadow
  strength (`isoinfinity-world/5`, `/1`–`/4` still load): a toolbar shadow
  field like the height field — set before placing, carried by each
  placement (0 = off), persisted per placement (omitted at full strength).
- Overlay framing fix — the sprite editor's 2D bounding-box overlay now
  projects with the same ground-shadow pad the bake framed with, so with
  the grounding shadow on (the default) the box, origin cross and baked
  pixels line up instead of the overlay drawing inset/shifted; origin
  authoring order is pinned as bake-invariant by `verify:bundles` checks.
- Workspace folder navigation — nested subfolders inside every convention
  folder (recursive listings, on-demand folder creation on save), a
  collapsible tree-view project browser, and a native-dialog-style
  save/load modal (folder tree left, file list right, breadcrumb, name
  field). Flat workspaces keep working unchanged; no format impact.
- Surface-snap height fix — the CPU-side snap read now indexes the sprite
  set's padded g-buffer stride (`maxW`) instead of the layer's own width,
  which drifted across rows and misread the surface height whenever any
  loaded sprite layer was wider than the picked asset's layer; the read
  is extracted into `src/runtime/surfaceSnap.ts` (verified by a
  `scratch-verify` spike against real bake data) and, while snap is on,
  the toolbar height field shows the height snap read under the cursor.
  No format impact.

- Unified deferred lighting + point lights (`isoinfinity-world/6`,
  `/1`–`/5` still load) — the compositor restructured into two phases
  (ADR 0011): a geometry pass drawing ground, meshes and sprites into a
  screen-space g-buffer (world normal + linear depth) plus an unlit
  albedo·AO surface, then one fullscreen deferred light pass applying the
  ADR 0003 multiplicative factor once for every surface kind (ambient
  picker, key directional, and up to 16 point lights from a std140 UBO,
  world position reconstructed from g-buffer depth per ADR 0001; sprite
  and mesh shading stay pixel-equivalent to the forward formulas, the
  mesh's post-tonemap factor application unified away). Point lights are
  a placement kind — light tool, radius/energy/color/position in the
  properties panel, quadratic window falloff to zero at the radius,
  persisted with the world; grounding shadows map to the ground plane in
  the screen g-buffer so lights pool on the floor. Sprite bundles and the
  bake pipeline are untouched.

- World-editor undo/redo — every mutating world operation (place/erase
  sprites, meshes, point lights, light edits/deletions) records an inverse
  command pair on a per-document history stack (`src/runtime/history.ts`,
  `npm run verify:history`); toolbar buttons + Ctrl/Cmd+Z /
  Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y, dirty marking on undo/redo, ids stable
  across undo. In-memory only per ADR 0006 — no format impact.

- World-editor Select tool — select a sprite, character, or point light
  (click; Escape/empty-click deselects) and drag it on the ground plane as
  one undoable move. Sprite picking is pixel-accurate against the baked
  g-buffer silhouette and per-fragment depth on the CPU (ADR 0012,
  `src/runtime/selection.ts`, `npm run verify:selection`); meshes/lights
  pick by screen-space proximity. The eraser (and right-click) uses the
  same pick and previews its target, so a sprite's transparent margin is
  neither selectable nor erasable. A selected sprite shows a bounding box
  around its drawn extent and can be rotated via the panel or the `E` key.
  The properties panel's Brush section (height, shadow, direction) appears
  only while the brush tool is active and the selected-placement section
  (position, height, shadow, facing; the light editor for lights) only
  while the Select tool is active; `E` still cycles the brush otherwise.
  Selection is in-memory per ADR 0006; no format impact.
- World-editor chrome reorganization — the world editor is full-bleed
  (no double center padding) with compact toolbar/gap spacing. Save,
  undo, and redo are icon buttons separated by a divider from the
  tool-contextual controls; the brush dropdown and surface-snap toggle
  show only while a placement tool is active (hidden for Select/eraser/
  light without resetting their state). Tool selection moved to a thin
  vertical icon bar docked inside the viewport's top-left corner
  (Select, pencil, light, eraser) that overlays the canvas without
  touching the view transform. Editor chrome only — no format impact.
- Selectable light icons — every placed point light shows a small
  constant-size diamond icon at its emitter, tinted with the light's
  color, visible in every tool mode: the visible click/drag handle for
  the existing screen-space light pick (Select click selects, Select
  drag moves, Light-tool click selects instead of placing, brush clicks
  pass through), with a hover radius-ring preview under the Select and
  Light tools. Editor chrome only — no format impact.

## In progress

- Dynamic meshes in the compositor (ADR 0007) — skinned, animated
  character (built-in CesiumMan brush) among baked sprites: opaque mesh
  batch sharing the world depth map, three.js as CPU-side libraries
  (parse + AnimationMixer pose engine, zero GL calls), SH-irradiance
  ambient probe from bundle provenance through the bake's ACES chain,
  in-memory-only placements. Mesh serialization, locomotion, terrain /
  dynamic ground (the same batch, unskinned) and multi-character
  instancing are the follow-on design surface.

## Planned

- Real shadow mapping — placement heights made per-pixel world positions
  reconstructable from the composited depth, which a light-space occluder
  pass can consume; until then raised objects anchor visually only via
  the fake contact-shadow ellipses. Optional x/z snapping alongside
  surface snap for one-click aligned stacking.
- Supersampling (render at N× and box-downsample), multi-cube composite
  assets, geometry-level clipping (CSG) instead of shader discard,
  KTX2/UASTC packaging for delivery (the merged g-buffer is already in the
  packed delivery layout), raytraced golden-image diff as a validator,
  Draco/Meshopt/KTX2 decode for glTF inputs, skinned bind-pose extraction,
  bake "application" shell (sessions/projects, batch queue, HDRI library),
  screen-space denoiser option (field exists, wired off), OIDN-class
  denoising for low-sample bakes.
