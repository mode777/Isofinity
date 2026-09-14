# Proposal: Reset zoom to 100% by clicking the zoom percentage label

## Why

Both editor viewports (bake/sprite and world) show a percentage readout in
the corner zoom controls (`− 75% + Fit`), but the readout itself is inert:
the only ways to change zoom are the −/+ buttons, wheel/pinch, and the Fit
action, and none of them returns to exactly 100% (image-native scale). A
clickable percentage label that resets zoom to 100% is a familiar,
one-click affordance for getting back to native scale.

## What Changes

- In the sprite (bake) editor viewport, clicking the zoom percentage
  readout in the corner zoom controls resets that view's zoom to 100%
  (zoom = 1), anchored at the panel center like the −/+ zoom actions.
- In the world editor viewport, the same click-to-reset behavior is added
  to its corner zoom controls' percentage readout.
- The readout is a button (keyboard-accessible) that is disabled/inert
  when no transform is resolved (the readout shows `—`).
- The reset uses the existing per-document in-memory view-transform
  setters, so it still never marks the document dirty and never reaches
  saved bundles or world files.

Assumption (recorded): "reset to 100%" means zoom = 1 while keeping the
point currently at the panel center at the panel center (same anchor as
the −/+ buttons) — the pan is adjusted, not thrown away, and fit remains
a separate action.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the "Viewport pan and zoom with corner zoom
  controls" requirement (sprite viewport) and the "World editor viewport
  zoom and pan" requirement each gain: activating the zoom percentage
  readout SHALL reset the view's zoom to 100%, anchored at the panel
  center, without changing fit semantics or dirtying the document.

## Impact

- `src/app/components/SpriteEditor.tsx` — the `.zoom-value` span becomes
  a clickable control calling the existing `setViewTransform` with a
  zoom-1 transform (panel-center anchored).
- `src/app/components/WorldEditor.tsx` — same for `setWorldViewTransform`.
- `src/app/bakeView.ts` — likely gains a small shared helper (e.g.
  `zoomTo(t, zoom, panel)` or a reuse of `zoomAround` at factor
  `1/t.zoom`); both editors already import their zoom math from here.
- `src/app/app.css` — the `.zoom-value` class gains button styling
  (cursor, hover, focus, disabled state).
- Docs: `docs/runtime.md` (viewport navigation sections for both
  editors) gains the click-to-reset mention; `docs/roadmap.md` gets a
  done entry. **No ADR needed** — this adds no cross-cutting invariant;
  it follows the existing view-transform invariants (ADR 0006: editor
  chrome stays in memory).
- Format-version impact: **none** — view transforms are in-memory editor
  state, never serialized; no bundle or world-file format change, no
  tolerance concerns.

## Non-goals

- No keyboard shortcut for reset-to-100% (e.g. Ctrl+0/Ctrl+1) — the
  editors currently have no zoom shortcuts at all; adding one is a
  separate change.
- No refactor of the duplicated zoom-controls JSX into a shared
  component; the two editors keep their inline blocks, matching the
  existing structure (only the zoom math is shared today).
- Fit behavior is unchanged; 100% and fit stay distinct actions.
- No zoom step presets, no "zoom to selection", no new zoom range.
