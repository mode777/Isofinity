## Why

Model sources expose only a unitless uniform scale, so users cannot size an
asset to a real-world dimension without guessing: nothing shows the model's
native size, and nothing tells them how big the baked sprite will be until
the bake fails on the pixel cap. Editors in this genre think in meters
(a door is 2 m tall), and the bake box + origin that placement relies on are
already stored in every sprite bundle but never shown.

## What Changes

- Sprite properties gain a **height input in meters** for model sources:
  entering a desired height derives the uniform scale from the model's
  native bounding-box Y extent (`scale = meters / nativeHeight`), so all
  other axes scale proportionally. The existing raw Scale row stays and
  both stay in sync; the native height is displayed in file units.
- The height input is editor-only: the meters value is not persisted —
  provenance keeps recording the derived uniform `scale` as today, so
  re-bake from provenance is unchanged. The input appears once the source
  model is loaded in the document (native extent known); view-only bundles
  keep working without it.
- The height row shows the resulting sprite pixel size and warns when the
  bake would exceed the sprite pixel cap (before the bake throws).
- The sprite viewport gains a toggleable **bounding-box overlay** in all
  four views (Realtime 3D, Normals, Depth, Render): the projected box
  edges, the world-origin marker, and the X/Y/Z axis lines from the
  origin. Drawn from data already in the document (`cube.size`,
  `sprite.originPx`, fixed camera); opened/view-only bundles show it too.
- No bundle-format change: `isoinfinity-bake/5` already stores the box
  (`cube.size`, `cube.origin`) and the origin's pixel projection
  (`sprite.originPx`).

## Capabilities

### New Capabilities

- *(none)*

### Modified Capabilities

- `asset-baking`: new height-based proportional scaling requirement for
  model sources (meters input derives scale from native Y extent; native
  height display; sprite pixel-size feedback and cap warning; meters not
  persisted).
- `integrated-editor`: new sprite-viewport bounding-box overlay
  requirement (box edges + origin marker + axes across all four views,
  per-document toggle, drawn for live bakes and opened bundles alike).

## Impact

- `src/app/components/SpriteProperties.tsx` — height row, native-height
  hint, sprite-size warning.
- `src/app/store/bake.ts`, `src/app/document.ts` — `setModelHeight`
  setter, overlay toggle state on `BakeDocument`.
- `src/app/components/SpriteEditor.tsx`, `RealtimeCanvas.tsx`,
  `src/app/realtime.ts` — overlay toggle control; realtime box/axes
  helper; 2D projected-overlay drawing.
- `src/bake/iso.ts` — shared box-corner projection helper (box + camera →
  sprite-pixel coordinates) used by the 2D views; verified in
  `src/bake/scratch-verify.ts`.
