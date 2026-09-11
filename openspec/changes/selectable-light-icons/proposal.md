## Why

Placed point lights are invisible in the world editor until selected or hovered
with the point-light tool: they are only pickable through an invisible 14 px
screen-space proximity test around the emitter. Users cannot see that a light
exists or where exactly to grab it, so selecting, moving, and erasing lights is
guesswork. A small always-visible icon at each light's emitter makes lights
discoverable and gives them an obvious click/drag target.

## What Changes

- Every placed point light renders a small editor-chrome icon at its projected
  emitter point in the world viewport, in all tool modes (like the existing
  radius ring, but as a compact constant-size marker).
- The icon is tinted with the light's color so multiple lights are
  distinguishable at a glance.
- Clicking an icon selects that light (Select tool; the point-light tool keeps
  its existing click-near-light-selects behavior, now with a visible target).
  The icon's hit area is a small screen-space radius around the emitter,
  consistent with the existing light pick.
- Dragging a light's icon with the Select tool moves the light along the ground
  plane (the existing selected-placement drag path; live move + one undoable
  command on release).
- Hovering an icon shows the light's radius ring as hover feedback (the same
  ring the selection highlight uses).
- The icon is overlay chrome: never serialized into world files, never marks
  the document dirty, tracks zoom/pan with the world image.

### Assumptions (recorded, not user-confirmed)

- Icons are always visible while a world is open (not tool-gated, not
  toggleable); this matches how the editor already always shows contact
  shadows and the grid.
- Icons pick lights under the Select and point-light tools only; with a
  placement brush active, clicking on an icon still places the brush (icons
  are not occluders for brush clicks) — consistent with today's behavior where
  only Select/eraser/light-tool consume picks.
- Icon visual: small constant-size screen-space marker (radius ~4 px core,
  ~14 px hit radius, matching the existing `lightPickPx`), drawn in the light's
  sRGB color; selected/hover states keep using the existing highlight ring.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `world-editor-selection`: point lights gain a visible, clickable, draggable
  icon handle at their emitter — a new requirement for the icon (visibility,
  color tint, chrome semantics, zoom/pan tracking), an extended selection
  requirement (icon click selects), and an extended highlight requirement
  (hover ring feedback); drag-to-move reuses the existing selected-placement
  drag requirement unchanged.

## Impact

- `src/app/components/WorldEditor.tsx` — draw the per-light icons into the
  existing overlay flat batch; icon hit-testing in the Select tool's
  pointerdown (and light tool's existing pick) and hover feedback.
- `src/runtime/selection.ts` — unchanged (the proximity pick already covers
  icon clicks; the icon is its visible affordance).
- `src/runtime/renderer.ts` — unchanged (overlay batch already supports flat
  alpha quads/triangles).
- No world-file format change (editor chrome only, per ADR 0006); no bundle
  format change; no new dependencies.
- Docs: `docs/runtime.md` (world editor input/overlay section) and
  `docs/roadmap.md` get a line; `docs/glossary.md` gains "light icon (handle)"
  if the term sticks. No ADR — this is editor chrome within the existing
  in-memory-editor-state decision, not a new cross-cutting trade-off.

## Non-goals

- No gizmo for moving a light vertically (height stays a properties-panel
  field; the icon moves on the ground plane only).
- No icons for sprites or characters (they are already visible; the Select
  tool picks them by silhouette).
- No light icons in the game render path — icons are editor chrome and never
  affect the composited scene, the bake pipeline, or saved files.
- No multi-select, no marquee selection, no icon toggling per document.
