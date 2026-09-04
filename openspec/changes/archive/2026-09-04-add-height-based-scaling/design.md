## Context

Every model document already carries its native bounding box: `loadGltf`
unions per-mesh bounds, pins the min corner at the origin, and stores the
extent (`doc.gltf.extent`, Y-up per glTF). The bake applies a uniform scale
around the box minimum, and every sprite bundle already stores the outcome
— `cube.size` (scaled box, min at `[0,0,0]`), `sprite.originPx` (the world
origin's pixel projection), `pxPerUnit`, and the fixed isometric camera —
which `decodeBundle` restores into `result.size` / `result.originPx` even
for view-only bundles. So no new data needs computing or storing; the work
is UI: a meters-to-scale editor and an overlay that projects box + origin
into the four viewport views (Realtime 3D, Normals, Depth, Render).

## Goals / Non-Goals

**Goals:**

- Size model assets by desired height in meters; all axes scale
  proportionally via the existing uniform scale path.
- Show the box + origin + axes overlay in all four views, from data the
  document already holds (works for opened view-only bundles).
- Warn before a bake would exceed `MAX_SPRITE_PX` (8192).

**Non-Goals:**

- No bundle-format change (`isoinfinity-bake/5` unchanged); no new
  manifest fields.
- No persistence of the meters value; no non-uniform scaling; no height
  input for built-in primitives (no native-extent UI for them today).
- No change to bake framing, `pxPerUnit`, or provenance semantics.

## Decisions

### Meters are UI sugar over `scale`; scale stays canonical

`setModelHeight(docId, meters)` derives `scale = meters / extent[1]` and
delegates to the existing `setModelScale`; provenance keeps recording
`scale`. Alternative considered — persisting `targetHeightM` in
provenance and deriving scale on load — rejected: a format-semantics bump
with no consumer, and re-bake would need the model loaded anyway. The
height row shows `scale × extent[1]`; both rows derive from the single
`doc.scale`, so sync is automatic and there is one source of truth.
Displayed values are rounded for readability only; rounding never feeds
back into state.

### Height input keyed on `doc.gltf` presence

The input renders only when the document holds the loaded model (native
extent known) — model-source docs and provenance-re-baked docs after the
model loads. View-only bundles and primitive docs see no height row. The
native extent is labelled in file units: glTF nominally says meters but
assets ship in arbitrary units, and the input itself defines the
conversion regardless.

### One projection helper in `src/bake/iso.ts`

Add a pure function, e.g. `projectBoxFrame(size, pxPerUnit, padPx)`,
returning sprite-pixel coordinates for the box's 12 edges, the world
origin, and the three origin-adjacent axis segments, computed with the
same math as `frameIsoBox` (project the 8 corners through the same
orthographic frame, map through `originPx`). Both 2D views and the
scratch-verify tests consume it. Alternative — projecting inside each
component — rejected: duplicated camera math invites drift from the bake
frame.

### 2D views: overlay drawn in the existing canvas pass

The Normals/Depth/Render draw path already renders into a panel-sized
backing store applying zoom/pan to the image (`drawImage` at
`panX/panY, w×zoom, h×zoom`). The overlay draws the projected segments in
the same ctx with the same mapping (image px → screen: `pan + px ×
zoom`), stroked at hairline width with half-pixel alignment; axes colored
conventionally (X red, Y green, Z blue), box edges neutral, origin marker
distinct (small cross). It is a pure function of `doc.result` +
`transform`, recomputed on the same effect that redraws the image.

### Realtime view: scene-space `LineSegments`

`RealtimeMeshView` builds its scene from `prim` framed by
`frameIsoBox(prim.size, …)`, so the overlay is a three.js `LineSegments`
of the same projected geometry in world space — box `[0,0,0] → prim.size`
(glTF path, geometry pre-normalized) or the cell box for legacy
primitives (geometry centered at box center; the declared cell is what
the bake frames). The origin-adjacent box edges double as the X/Y/Z axes
(colored per axis), so no separate axis geometry is needed; the world
origin is a corner of the box by construction. Toggling adds/removes the
object; prim recreation (scale change) rebuilds it.

### Toggle lives on the document

`BakeDocument` gains an in-memory flag (default off), edited by a "Box"
button in the viewport's view-controls row next to the view-mode buttons.
It is per document (independent tabs), survives view/tab switches like
the view transforms, and is not serialized into bundles or presets.

### Cap warning computed, not baked

`projectBoxFrame`'s pixel extent equals what `bakePrimitive` will produce,
so the properties panel computes it from `extent × scale` (pure math, no
render) and compares against `MAX_SPRITE_PX`; the warning shows the
offending `WxH px`. The bake keeps its existing throw as the backstop.

## Risks / Trade-offs

- [Displayed height drifts from stored scale via float rounding] → scale
  is the only stored value; height is always derived, never written back
  rounded.
- [Overlay half-pixel misalignment at high zoom] → stroke with 0.5 px
  offsets in image space; cosmetic-only risk.
- [Legacy primitive boxes don't hug geometry (declared cell ≠ tight
  bounds)] → consistent with bake framing; accepted for primitives, tight
  for models. No consumer needs primitive-tight bounds today.
- [Models authored Z-up show the "wrong" axis as height] → Y is height by
  glTF spec; a Z-up file is malformed input. The native-extent display
  makes the mismatch visible; no auto-detection attempted.
- [Users expect the meters value to survive save/load] → it doesn't by
  design; the derived height is re-displayed after re-bake restores the
  source. Documented in the panel hint.

## Migration Plan

Additive UI on top of existing state; no format, API, or stored-data
changes. Rollback is reverting the components. Verified via
`npm run build` plus scratch-verify additions for the projection helper
and height derivation; browser-visual checks (overlay alignment, toggle
UX) are manual.

## Open Questions

None — all scope decisions were settled during exploration.
