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
  (ADR 0005). Worlds consume only `n` today.
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
  settings, environment. View-independent; lets a sprite re-bake in place.
  Missing/unresolvable ⇒ the document opens **view-only**.
- **`pxPerUnit`** — fixed sprite resolution: pixels per world unit (128).
- **`originPx`** — projected pixel position of the box's world origin
  `(0,0,0)`; the anchor for multi-cube blitting and placement.

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
  `models/`, `sprites/`, `worlds/`, `presets/`.

## World

- **World** — placements + light state, saved as `isoinfinity-world/3`
  JSON in `worlds/` (`/1`+`/2` still load; missing heights = ground
  level, missing directions = north).
- **Sprite layer** — a world's loaded sprite asset: padded passes in two
  texture arrays (render RGBA8 + g-buffer RGBA16F) plus per-layer size/
  origin (`src/runtime/assets.ts`). A multi-view asset loads one layer
  per placeable view slot.
- **Placement direction** — which baked view slot a placement stands in
  (`n`/`e`/`s`/`w`, default `n`): the brush's facing at placement time,
  persisted with the placement (omitted in world files when north).
  Rendering resolves the placement's layer via `viewLayerId(asset, dir)`;
  picking and erase stay direction-independent.
- **Placement** — one instance of a sprite layer at a continuous ground
  position and height; free-form (not grid-snapped), height ≥ 0.
- **Placement height** — a placement's world-unit offset above the ground
  plane. The brush height is adjusted with shift + vertical mouse move or
  set exactly in the toolbar's height field (per-document in-memory
  editor state, never saved).
- **Surface snap** — toolbar toggle: placements take their height from
  the visible surface under the cursor, computed CPU-side from the
  in-memory g-buffers; overrides the shift+wheel height.
- **Contact shadow** — editor chrome: a soft ground ellipse under every
  raised placement (and raised ghost), larger and fainter with height;
  never saved, never dirtying.
- **Height gizmo** — editor chrome: landing diamond at a raised ghost's
  footprint plus a plumb line down to the ground cell; hidden at ground
  level.

## Runtime

- **Compositor** — `src/runtime/renderer.ts`: four draw batches (ground,
  contact shadows, instanced sprite quads, overlay); fixed orthographic
  camera, no scene graph, projection on CPU (`src/shared/iso.ts`).
- **Per-pixel occlusion** — each sprite fragment writes `gl_FragDepth`
  from baked g-buffer depth + the placement's full
  `dot(origin + height, viewDir)`; LEQUAL depth resolves
  interpenetrations — stacking included, at any height — regardless of
  draw order.
- **Key/ambient light** — POE-style dynamic lighting multiplying the
  prerendered texel in linear space (ADR 0003). **Dynamic light** switch
  off = factor identity (pure prerender).
- **Sun position** — `src/shared/sun.ts`: NOAA-style az/el from time of
  day / day of year / latitude; writes through to the manual sliders.
