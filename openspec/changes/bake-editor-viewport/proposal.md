# Bake editor viewport

## Why

The sprite (bake) editor crams its passes into two small side-by-side
figures inside a scrolling center column. The images are tiny, cannot be
inspected closely, and g-buffer normal/depth inspection is hidden behind a
caption toggle. Working on bake quality needs a large inspectable view of
each pass — and a live 3D look at the source geometry — not a thumbnail
grid.

## What Changes

- Reorganize the sprite editor content area into a single viewport panel
  that fills the remaining editor space (between toolbar and status bar,
  inside the center region).
- The viewport shows exactly one of four views at a time, selected from a
  view-mode switcher overlaying the viewport's top-right corner (styled
  like the zoom controls):
  - **Realtime 3D** — a real-time 3D render of the document's source
    geometry (classic Three.js mesh render with a fixed default light),
    drawn from the bake's fixed isometric camera so it stays comparable
    with the baked passes.
  - **Normals** — the g-buffer world-normal visualization.
  - **Depth** — the g-buffer ray-depth visualization.
  - **Render** — the path-traced baked render pass.
- The old side-by-side pass figures, the g-buffer caption toggle, and the
  render figcaption button go away; bake/re-render actions already live in
  the properties panel.
- Zoom controls overlay the viewport's corner: `−`, a percentage readout,
  and `+` (e.g. `− 75% +`), plus a fit action; wheel zooms around the
  cursor and dragging pans.
- View mode and zoom/pan state are per-document in-memory state (each view
  keeps its own zoom/pan — the views use different zoom baselines),
  restored on tab re-activation, not saved into bundles.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the sprite editor's content area becomes a single
  full-space viewport with four switchable views (realtime 3D, normals,
  depth, render), per-document view state, and pan/zoom with corner zoom
  controls; the sprite toolbar gains the view-mode switcher and the
  side-by-side pass figures are removed.

## Impact

- `src/app/components/SpriteEditor.tsx` — restructured into toolbar +
  viewport; new view switching, pan/zoom, zoom controls.
- New realtime 3D view component/mini-renderer (three.js, already a
  dependency) rendering the document's source geometry (`Primitive`
  geometry/groups) with a fixed light; context lifecycle must respect the
  one-live-context-per-editor-kind rule and dispose GPU resources on mode
  and tab switches.
- `src/app/app.css` — viewport layout, overlay zoom controls, mode styles;
  removal of `.passes` figure layout.
- `src/app/store/bake.ts` / `src/app/document.ts` — optional in-memory view
  state fields on `BakeDocument` (mode, zoom, pan); no bundle-format change.
- No changes to bake output, bundle format, workspace conventions, or the
  world editor.
