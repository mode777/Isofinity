# Design: Reset zoom to 100% by clicking the zoom percentage label

## Context

Both editors render an identical corner zoom-controls cluster (`− <pct> +
Fit`) as inline JSX — `SpriteEditor.tsx` (~495) and `WorldEditor.tsx`
(~2042). The readout is a plain `<span class="zoom-value">`. All zoom math
is shared in `src/app/bakeView.ts`: `zoomAround(t, cx, cy, factor, ox, oy)`
zooms by a multiplicative factor keeping viewport point (cx, cy) fixed,
with a per-view pan origin (top-left for 2D views, panel center for the
Realtime 3D view). Each editor already has a `zoomBy(factor)` helper that
anchors at the panel center and persists through the existing in-memory
setters (`setViewTransform` / `setWorldViewTransform`; ADR 0006 — editor
chrome, never serialized). No reset-to-100% exists anywhere; only Fit.

## Goals / Non-Goals

**Goals:**

- Clicking/keyboard-activating the percentage readout sets the active
  view's zoom to exactly 1 (100%), anchored at the panel center.
- Identical behavior in bake (per-view, including Realtime 3D) and world
  editors, reusing the shared zoom helpers so the two stay consistent.
- Zero serialization/dirty impact (stays pure editor chrome).

**Non-Goals:**

- No keyboard shortcut (Ctrl+0/Ctrl+1), no shared ZoomControls component
  extraction, no fit changes, no zoom-range changes (see proposal).

## Decisions

### D1: Absolute `zoomTo` helper instead of `zoomBy(1 / zoom)`

Add `zoomTo(t, targetZoom, cx, cy, originX?, originY?)` to
`src/app/bakeView.ts`, computing `k = targetZoom / t.zoom` and applying
`zoomAround`'s exact pan formula (`pan' = k·pan + (1−k)·(c − o)`) with
`clampZoom(targetZoom)` as the resulting zoom.

- Rejected `zoomBy(1 / t.zoom)`: `t.zoom * (1 / t.zoom)` is not
  guaranteed to be exactly 1 in IEEE floats (e.g. zoom 1.4 →
  0.9999999999999998); the spec pins "exactly 100%". Cheap to do right.
- Rejected resetting pan to a fixed origin (0,0): throws away the user's
  viewing context and contradicts the pinned convention that zoom actions
  anchor at the panel center (integrated-editor spec, world viewport).

### D2: Panel-center anchor, per-view pan origin

Call sites mirror each editor's existing `zoomBy`: viewport point
(panel.w/2, panel.h/2); the sprite editor passes the Realtime 3D pan
origin offsets (panel.w/2, panel.h/2) exactly as its `zoomBy` does
(SPR `SpriteEditor.tsx:341-343`), 2D views and the world editor use the
default origin (0,0). The point under the panel center before the click
stays there after it.

### D3: Readout becomes a `<button type="button">`

Replace the `<span class="zoom-value">` with a button carrying the same
class, `title="Reset zoom to 100%"`, `disabled` when no transform is
resolved (the `—` state). CSS: reset button defaults (background, border,
padding, font) on `.zoom-value` so the current look is preserved, then
add `cursor: pointer` and a `:hover`/`:focus-visible` affordance in
`app.css`.

Keyboard notes: Enter activates in both editors. In the world editor,
Space on a focused button is already claimed by pan mode (`typingTarget`
does not exempt BUTTON, `WorldEditor.tsx:221-230` — same as every toolbar
button today), so only Enter activates it there; the sprite editor has no
Space handler, so Space activates it normally. No handler changes needed.

### D4: No store/model changes

The reset writes through the existing `setViewTransform(docId, view, t)`
/ `setWorldViewTransform(docId, t)` — per-document **in-memory editor
state, never serialized** into bundles or world files, never marked dirty
(ADR 0006). Clicking it does not create undo entries (view transforms are
not undoable today; unchanged).

## Risks / Trade-offs

- [CSS regression: readout stops looking like a label] → mirror the
  current computed look in `.zoom-value` button resets; visual check is
  part of the browser pass.
- [Panel missing at click time (no measured size)] → same guard as
  `zoomBy`: bail out when `transform`/`panel` is missing; button is
  disabled without a transform anyway.
- [Behavior drift between the two duplicated JSX blocks] → both call the
  one shared `zoomTo`; acceptable residual duplication matches the
  existing structure (no component extraction in this change).

## Migration Plan

Single commit, no data or format migration (nothing serialized). Rollback
= revert the commit. Gates: `npm run build`; behavior check in the browser
harness by the user (no headless browser here); no Node verifier touches
these files.

## Open Questions

None.
