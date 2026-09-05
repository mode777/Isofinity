# Design — World editor zoom/pan + brush ghost preview

## Context

The world editor renders through the raw WebGL2 compositor
(`src/runtime/renderer.ts`): all projection happens once on the CPU into
a fixed "world image" pixel space (`toPx` in `WorldEditor.tsx`, constants
derived from the 12×12 grid), and the canvas displays that image 1:1 at
its native size. Three batches draw per frame — static ground VBO,
instanced sprites with per-pixel occlusion (`gl_FragDepth`), flat
overlay quads. Input maps the pointer to ground coordinates by inverting
the shared projection (`screenToGround`) in that same image space.

The sprite editor already established the viewport conventions this
change adopts: the `ViewTransform` type (`zoom`, `panX`, `panY`) with
`fitTransform` / `zoomAround` / `panned` / `clampZoom` and
`ZOOM_MIN/MAX/STEP` in `src/app/bakeView.ts`, a per-document in-memory
transform (null = fit), wheel-zoom-around-cursor, drag-pan, and corner
`− / % / + / fit` controls. ADR 0006 fixes the state layer this belongs
to: editor chrome is in-memory document state, never serialized.

## Goals / Non-Goals

Goals: crisp zoomable/pannable world viewport with the sprite editor's
interaction vocabulary; placement/erase accuracy invariant under the
transform; live ghost preview of the active brush. Non-goals as in the
proposal (no camera change, no snapping change, no touch, no format
change).

## Decisions

### D1 — GPU view-transform uniform over world-image space (not CPU re-projection, not CSS)

All CPU-projected data stays in world-image pixels exactly as today;
the canvas backing store becomes panel-sized × devicePixelRatio, and a
`uView` uniform (`scale.x, scale.y, offset.x, offset.y`) is applied in
both vertex programs before the existing clip-space mapping:
`px' = px * scale + offset`. `render()` takes the view transform (and
ghost/highlight data, see D3) as arguments; `uRes` becomes the backing-
store size.

- *Why not CPU re-projection*: the ground VBO is static by design and
  instance data is already laid out per frame; re-projecting per frame
  adds work and breaks the "projection happens once" invariant.
- *Why not a CSS transform on the canvas*: blurry above 100%, overlays
  and picking would need a parallel mapping, and no per-batch control
  (the ghost must not transform depth data — see D3).

The fixed isometric camera, `iso.ts` constants, and the projected scene
layout are untouched: zoom/pan only scales/offsets the final image, so
`DEPTH_LINEAR_RANGE`, painter sorting and occlusion semantics are
unaffected.

### D2 — Reuse the bake viewport's transform vocabulary

`WorldDocument` gains `viewTransform: ViewTransform | null` (null =
fit, mirroring the bake document's per-view missing entry); a
`setWorldViewTransform` action mirrors `setViewTransform` in
`store/bake.ts`. Fit computes `fitTransform(CANVAS_W, CANVAS_H,
panel.w, panel.h)`; the default view on open/create is fit. Zoom/pan
math (`zoomAround`, `panned`, `clampZoom`, `ZOOM_*`) is imported from
`bakeView.ts` — one vocabulary across both editors. The field is
in-memory only (ADR 0006); world JSON is untouched.

Pointer→ground inverts the transform: panel px → subtract pan, divide by
zoom → world-image px → existing `screenToGround`. This keeps placement
position invariant under zoom (a spec scenario).

Input bindings: `wheel` (non-passive, `preventDefault`) follows the
trackpad-native convention: a **plain wheel event** (two-finger scroll,
or a mouse wheel) pans by the scroll delta — the content follows the
fingers, with deltaMode normalized (line ×16, page × panel size); a
**ctrl-modified wheel** (trackpad pinch, ctrl+scroll) zooms around the
cursor via `zoomAround` with the top-left pan origin (same as the bake
2D views). Middle-button drag pans, using `setPointerCapture` and
`preventDefault` on middle-down (suppresses browser autoscroll) — middle
is chosen because left paints and right erases; a ResizeObserver tracks
the panel like `SpriteEditor.tsx` and only re-fits while the transform
is null.

Touch screens join the same bindings: `touch-action: none` is already on
the canvas, so Pointer Events deliver every finger. Touch runs a small
state machine beside the mouse path: **one finger** behaves like the
mouse's left button — drag paints and drives the ghost, and a release
without movement beyond a small slop places (tap-to-place); **two
fingers** are a neutral pre-gesture (nothing paints, so positioning a
third finger is safe); **three fingers** pan by their centroid via
`panned` from the transform captured when the third finger lands,
ending cleanly (transform kept, no snap-back) when the count drops
below three. Placement is deliberately deferred to move/release instead
of pointer-down so landing a pan gesture cannot drop accidental sprites
— a trade against the mouse's click-to-place immediacy, pinned by the
spec's touch outcomes rather than its phasing. Note that three fingers
on a *trackpad* are a different input entirely: macOS consumes them
(Spaces/Mission Control swipes, the three-finger drag accessibility
feature) and delivers no event, so trackpad panning rides two-finger
scroll and trackpad zooming rides pinch (ctrl+wheel) instead.

### D3 — Ghost as an extra depth-tested instance of the sprite program (not an overlay canvas)

When the active tool is a brush whose layer is loaded and the cursor is
over the canvas, the render loop appends one sprite instance for the
ghost — same layer index, origin/size/ppu math, and depth sort key
(`depthOf` of the ground position) as a real placement, at `hoverRef`'s
ground position. **Depth stays on**: the ghost renders through the same
path as real placements — depth test LEQUAL, `gl_FragDepth` from the
baked g-buffer — so the preview is WYSIWYG: it shows exactly where the
placement would interpenetrate or hide behind nearer objects, including
the partial hide-and-reveal a unit cell next to tall geometry produces.
Appending it to the same painter-sorted batch (far → near) makes this
fall out of the existing occlusion solve; the depth write is harmless
because everything drawn after it is nearer and wins LEQUAL. Transparency
is optional styling: an alpha multiplier uniform may exist as a tuning
knob, but the default is a plain placement draw (opaque); nothing in the
renderer depends on it.

- *Why not a second transparent canvas / DOM preview*: a parallel
  surface must re-implement layer math and stay aligned under zoom/pan —
  duplicate state for no benefit; the ghost is one more instance of
  data the loop already computes.
- *Why depth-on (not an x-ray preview)*: the preview's job is to show
  the placement as it will land; exempting it from depth would draw a
  floating overlay that contradicts the actual result, especially where
  the cursor sits behind foreground sprites.
- *Preview-only is state, not rendering*: the ghost never enters the
  placement list — it is excluded from `placeAt`/erase/picking and never
  marks the document dirty; occlusion participation is purely visual.

The ghost reuses `hoverRef` (ground coords), so it automatically tracks
the inverse-transform-corrected pointer position. It draws only — it
never calls `placeAt`/`markDirty`, satisfying the preview-only scenario.

### D4 — Placement behavior unchanged

Left click/drag paints, right click erases, `placeAt` keeps its
cursor-centered math. Zoom/pan and ghost are purely viewport concerns;
the store's placement/erase/save paths gain only the transform action.

## Risks / Trade-offs

- [Render pass blurs above 100% zoom (LINEAR)] → accepted; identical to
  the sprite editor's 2D views. The NEAREST g-buffer keeps the discard
  boundary stable.
- [Non-integer zoom scales the checkerboard/hairline overlays unevenly]
  → overlays transform with the same uniform, so they stay aligned with
  the world; minor sub-pixel width variation accepted.
- [Middle-drag conflicts with platform conventions on some mice] →
  zoom controls give a mouse-free path; space+drag deliberately
  deferred (non-goal) rather than half-supported.
- [Panel resize while zoomed] → explicit transforms persist (only null
  = fit refits), same as the bake viewport; the backing store tracks
  DPR so crispness is retained.
- [Ghost drawn opaque may hide the cursor point under dense coverage] →
  depth-on is the point (WYSIWYG); an optional alpha uniform remains as
  a styling knob and does not affect placement math.

## Migration Plan

No persisted-format or bundle changes: deploy = code revert. Docs to
update on landing: `docs/runtime.md` (world editor + Input sections),
`docs/roadmap.md`; no new ADR (D1–D3 apply an existing convention, they
do not settle a new cross-cutting trade-off).

## Open Questions

None.
