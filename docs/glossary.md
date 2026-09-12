# Glossary

Terms as used in code, specs, and docs. Definitions are one line; follow
the pointer for the real semantics.

## Baked assets

- **Pass** — one per-pixel data channel set produced by a bake (see
  `docs/bake-pipeline.md`): the raster **g-buffer** and the path-traced
  **render** pass. There are no others (albedo/ao removed — ADR 0002).
- **G-buffer** — merged raster pass: rgb = world-space normal, a = linear
  ray depth. A pixel is "empty" iff `length(normal) == 0` (depth 0 is a
  real value; never test `a == 0`).
- **Render pass** — path-traced lit color (ACES, sRGB) with antialiased
  alpha. Required before a sprite can be placed into a world.
- **View slot** — one bake facing: `n`/`e`/`s`/`w` at 90° azimuth steps.
  All slots render from the one fixed camera with the model yaw-rotated
  (ADR 0005). Worlds consume `n` plus every extra slot that carries a
  render pass (one placeable direction each).
- **Slot yaw** — a non-N slot's model rotation: `slotYawDeg(slot)`
  (`src/shared/iso.ts`).
- **`BakeResult`** — in-memory g-buffer of one slot: size, `pxPerUnit`,
  `originPx`, camera, float rgba buffer (`src/bake/bake.ts`).
- **`PtImage`** — in-memory render pass (png bytes + dimensions,
  `src/bake/pt.ts`).
- **Bundle** — `<id>.sprite`: a zip (pure transport) of manifest + passes,
  one per view slot (ADR 0004).
- **Manifest** — `manifest.json` inside the bundle; `format:
  isoinfinity-bake/6`, camera/sprite/passes data for N, optional `views[]`
  table for E/S/W.
- **Provenance** — manifest block (since `/5`): source, path-trace
  settings, environment, and the optional origin anchor. View-independent;
  lets a sprite re-bake in place. Missing/unresolvable ⇒ the document opens
  **view-only**.
- **`pxPerUnit`** — fixed sprite resolution: pixels per world unit (128).
- **Origin anchor** — the authored 3D placement handle of a sprite: a point
  in the N view's asset space measured from the box min corner (default
  `(0,0,0)` = the corner). Set in the sprite properties panel's Origin
  section (north view only); every slot derives its anchor by the slot's
  quarter-turn (`slotAnchorPoint`), and each view's `originPx` records the
  projection. Placement lands the anchor at the placement's position
  (ADR 0008).
- **`originPx`** — projected pixel position of a view's origin anchor in
  sprite pixels; the anchor for multi-cube blitting and placement.

## Editor

- **Document** — in-memory editor state behind a tab (`src/app/
  document.ts`): sprite (bake) or world. Independent of render contexts;
  survives tab switches (ADR 0006).
- **View-only** — a bundle document that cannot re-bake (no provenance or
  unresolvable refs); passes visible, save/export available.
- **Preset** — `presets/<name>.json` in the workspace: reusable bake look
  (`isoinfinity-bake-preset/1`); sample/bounce counts + environment.
  Texture size deliberately excluded.
- **Workspace** — a local folder bound via the File System Access API
  (`src/shared/workspace.ts`) with convention subfolders `hdri/`,
  `models/`, `sprites/`, `worlds/`, `presets/`, `materials/`.
- **Command (undo)** — a do/undo pair recorded on a world document's
  history stack when a mutating world operation applies (`src/runtime/
  history.ts`); carries the minimal inverse delta, never a snapshot.
- **Undo stack** — per world document, in-memory only (ADR 0006): undo/
  redo walks it with Ctrl+Z / Ctrl+Shift+Z; a new command drops the redo
  end; it never reaches a world file.
- **Layer visibility** — the world viewport's per-document in-memory
  hide/show state for the ground, sprite, and mesh layers (ADR 0006):
  hidden layers are not drawn, not pickable, and supply no surface-snap
  heights; never saved, never dirty, never undoable.

## World

- **World** — placements + light state + ground size, saved as
  `isoinfinity-world/8` JSON in `worlds/` (`/1`–`/7` still load; missing
  heights = ground level, missing directions = north, missing
  ground/env/size fields = defaults, older files carry no point lights,
  and a `/7` single ground material loads as slot 0).
- **Ground material** — a zip file with a `.material` extension in
  `materials/` holding diffuse (`diff`, with `diffuse` accepted as an
  alias; `diff` wins when both are present), AO/Roughness/Metal (`arm`,
  channels in rgb), gl-convention normal (`nor_gl`), and an optional
  displacement (`disp`, aliases `displace`/`displacement`) map, identified
  by `<name>_<slot>_*.(exr|png|jpg)`; the ground plane tiles it in world
  units (`tileScale` = tiles per world unit).
- **Material slot** — one of up to four ground material bindings (0–3) the
  ground blends and paints at once. Each slot samples one layer of the
  material texture arrays.
- **Splat (coverage)** — the world-space RGBA texture holding the four
  material-slot coverages: rgb = slots 0–2, alpha = slot 3 (derived as
  `1 - r - g - b`). Persisted as a PNG beside the world JSON.
- **Displacement map** — an optional material map used as a per-pixel
  surface height in the ground blend; not geometry displacement.
- **Height-seam blend** — weighting each material's coverage by its
  displacement height (centered on 1, so a missing map is neutral) so the
  boundary between materials follows surface detail instead of a straight
  fade.
- **Sprite layer** — a world's loaded sprite asset: padded passes in two
  texture arrays (render RGBA8 + g-buffer RGBA16F) plus per-layer size/
  origin (`src/runtime/assets.ts`). A multi-view asset loads the north
  layer eagerly and one layer per extra view slot **on demand**; see
  **Lazy view**.
- **Lazy view** — an extra bundle view slot (E/S/W) the world document
  knows about but has not decoded yet: the manifest lists it, so the
  direction is selectable, but its passes are inflated and decoded — and
  its render-pass/depth checks run — only the first time that direction is
  used. Decoded views are cached per source file for the session
  (invalidated by size/last-modified); a view that fails the checks is
  dropped with a skip note and the direction falls back to north
  (`src/runtime/assets.ts`, ADR 0014). The north view always loads eagerly.
- **Placement direction** — which baked view slot a placement stands in
  (`n`/`e`/`s`/`w`, default `n`): the brush's facing at placement time,
  persisted with the placement (omitted in world files when north).
  Rendering resolves the placement's layer via `viewLayerId(asset, dir)`,
  falling back to north while a lazy view decodes; the erase pick reads the
  drawn view's silhouette, so it follows the facing.
- **Placement** — one instance of a sprite layer at a continuous ground
  position and height; free-form (not grid-snapped), height may be
  negative (sunk below the ground plane).
- **Placement height** — a placement's signed world-unit offset from the
  ground plane (negative = sunk below it). The brush height is adjusted
  with shift + vertical mouse move or set exactly in the properties
  panel's Brush section (per-document in-memory editor state, never saved).
- **Selection** — the one placement the Select tool (or the Light tool's
  click) has picked, held per world document as `{ kind, id }` in memory
  (ADR 0006): highlighted in the viewport (a bounding box for a sprite),
  edited in the properties panel, moved by dragging, and cleared on
  Escape, an empty click, or when erase/undo removes it.
- **Select tool** — the world toolbar tool that selects and drags
  placements (sprite, character, or point light) on the ground plane; its
  drag is one undo command, its panel edits are undoable, and the `E` key
  rotates a selected sprite's facing.
- **Pick (selection)** — resolving the placement under the cursor. Sprites
  use their baked g-buffer silhouette and per-fragment depth (so
  transparent margins are not selectable and the visually nearest wins);
  meshes and lights use screen-space proximity. The eraser uses the same
  pick (`src/runtime/selection.ts`, ADR 0012).
- **Light icon (handle)** — the small constant-size diamond drawn over
  every placed point light at its projected emitter, tinted with the
  light's color: the visible face of the light's proximity pick, so
  lights can be found, clicked (select) and dragged (move) in any tool
  mode. Editor chrome — never serialized (ADR 0006).
- **Surface snap** — toolbar toggle: placements take their height from
  the visible surface under the cursor, computed CPU-side from the
  in-memory g-buffers; overrides the shift+mouse height and the height
  field.
- **Mesh placement** — one instance of the built-in skinned character at
  a continuous ground position, height and yaw. Editor-session state:
  never serialized into world files (ADR 0006) — saving/loading a world
  drops characters silently. Erase resolves the topmost placement across
  sprite, mesh, and light kinds (shared depth key).
- **Point light placement** — a placed light (light tool): emitter at the
  placed cell center + height, falloff radius, energy, sRGB color.
  Persisted in `isoinfinity-world/6`; at most 16 render concurrently
  (`MAX_POINT_LIGHTS`), further placements render dark.
- **Joint palette** — per-character, per-frame array of
  `bone.matrixWorld · boneInverse` matrices (column-major `mat4[]`,
  ≤ 64 joints): the CPU pose engine's output, the mesh vertex shader's
  skinning input (`src/runtime/meshAsset.ts`).
- **Bind pose / bind-space geometry** — the skinned mesh's vertex data
  pre-multiplied by its `bindMatrix`, so per-frame palettes land directly
  in world space. The **world offset** (part of the asset) re-anchors the
  first *rendered* pose's feet at y = 0 and centers x/z — applied by the
  draw origin, post-skinning.
- **SH probe** — 9 RGB spherical-harmonics diffuse-irradiance
  coefficients projected from the sprites' bake environment (resolved
  from bundle provenance, else the built-in default; `src/runtime/
  shProbe.ts`), evaluated per pixel as a quadratic polynomial of the
  normal — baked into the mesh/ground albedo·AO texel at geometry-write
  time (the environment-derived part of the ambient).
- **Character brush** — the world toolbar's built-in animated character
  (Khronos CesiumMan, committed with attribution): place/erase/height
  like a sprite brush; the ghost shows the bind pose; playback is in
  place (no locomotion).
- **Contact shadow** — editor chrome: a soft ground ellipse under every
  raised placement (and raised ghost), larger and fainter with height;
  never saved, never dirtying.
- **Grounding shadow** — an optional baked ground darkening (per-document
  toggle, default on) derived from the g-buffer and composited into the
  render pass's empty pixels as a blue-tinted mid-alpha patch; the
  runtime classifies it by the tint (`r < b`), blends it unshaded, writes
  its true ground-plane depth, and suppresses it for placements off the
  ground (`src/bake/shadow.ts`, ADR 0010).
- **Height gizmo** — editor chrome: landing diamond at a raised ghost's
  footprint plus a plumb line down to the ground cell; hidden at ground
  level.

## Runtime

- **Compositor** — `src/runtime/renderer.ts`: two-phase frame — a
  geometry pass (ground/material plane, contact shadows, meshes,
  instanced sprite quads) into an offscreen MRT target set, the deferred
  light pass, then the unlit overlay; fixed orthographic camera, no scene
  graph, projection on CPU (`src/shared/iso.ts`).
- **Screen-space g-buffer** — the geometry pass's offscreen targets:
  RT0 (RGBA8 display texel = albedo·AO), RT1 (RGBA16F: world normal +
  linear depth — the per-sprite bake g-buffer layout), RT2 (RGBA16F: linear depth in r,
  depth). Blending is straight alpha per attachment; the grounding shadow
  maps to the ground plane (up normal, ground depth).
- **Deferred light pass** — one fullscreen pass applying every dynamic
  light — ambient picker, key directional, point lights — once, over the
  composite, with world position reconstructed from the g-buffer depth
  (ADR 0001) and the ADR 0003 multiplicative factor applied exactly once
  for every surface kind (ADR 0011).
- **Per-pixel occlusion** — each sprite fragment writes `gl_FragDepth`
  from baked g-buffer depth + the placement's full
  `dot(origin + height, viewDir)`; LEQUAL depth resolves
  interpenetrations — stacking included, at any height — regardless of
  draw order.
- **Key/ambient light** — POE-style dynamic lighting multiplying the
  albedo·AO texel in linear space (ADR 0003), applied in the deferred
  pass. **Dynamic light** switch off = factor identity (pure prerender).
- **Point light** — a deferred light with position, radius (quadratic
  window to zero at the edge), energy, and color; reaches ground, sprites,
  and meshes alike through the same pass.
- **Sun position** — `src/shared/sun.ts`: NOAA-style az/el from time of
  day / day of year / latitude; writes through to the manual sliders.
