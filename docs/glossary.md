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

- **World** — placements + light state, saved as `isoinfinity-world/1`
  JSON in `worlds/`.
- **Sprite layer** — a world's loaded sprite asset: padded passes in two
  texture arrays (render RGBA8 + g-buffer RGBA16F) plus per-layer size/
  origin (`src/runtime/assets.ts`).
- **Placement** — one instance of a sprite layer at a continuous ground
  position; free-form (not grid-snapped).

## Runtime

- **Compositor** — `src/runtime/renderer.ts`: three draw batches (ground,
  instanced sprite quads, highlight); fixed orthographic camera, no scene
  graph, projection on CPU (`src/shared/iso.ts`).
- **Per-pixel occlusion** — each sprite fragment writes `gl_FragDepth`
  from baked g-buffer depth + the placement's `dot(origin, viewDir)`;
  LEQUAL depth resolves interpenetrations regardless of draw order.
- **Key/ambient light** — POE-style dynamic lighting multiplying the
  prerendered texel in linear space (ADR 0003). **Dynamic light** switch
  off = factor identity (pure prerender).
- **Sun position** — `src/shared/sun.ts`: NOAA-style az/el from time of
  day / day of year / latitude; writes through to the manual sliders.
