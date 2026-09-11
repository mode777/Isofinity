## Context

Point lights are full placements today (`LightPlacement` in
`src/runtime/world.ts`): the point-light tool places them, the Select tool
picks them by a 14 px screen-space proximity test around the projected emitter
(`pickPlacementAt`, `src/runtime/selection.ts`), Select-drag moves them
(`moveSelectionLive`/`commitSelectionMove`), and the properties panel edits
them — but nothing is drawn at the emitter until selection or a point-light-tool
hover. The viewport already draws editor chrome into a flat alpha overlay
batch (`FlatBatchBuilder` in `src/app/components/WorldEditor.tsx`: contact
shadows go to a depth-tested batch, the light radius ring, height gizmo and
selection outlines to an overlay batch drawn without depth test, in world-image
pixels that zoom/pan transform). Input handlers already convert every pointer
event to world-image pixels (`pointerPoint`).

## Goals / Non-Goals

**Goals:**

- A constant-size, per-light icon in the overlay batch, tinted with the
  light's color, visible in every tool mode.
- Hover/selection feedback via the existing radius ring.
- Click/drag selection riding the existing proximity pick and Select-drag
  machinery with no new pick code.

**Non-Goals:**

- No vertical (height) drag gizmo; no icons for sprites/meshes; no icons in
  the bake pipeline, the game render path, or saved files. See proposal.md
  Non-goals.

## Decisions

### D1: Icons are per-frame overlay-batch chrome, not scene objects

Draw each icon into the existing overlay `FlatBatchBuilder` inside
`renderFrame`, next to `lightRing` (WorldEditor.tsx:582-603): a small filled
diamond centered on `toPx(l.x + 0.5, l.z + 0.5, l.y)` (same projection the
ring and the pick use), ~4 px half-diagonal, in the light's color, over a
slightly larger dark under-diamond as an outline for contrast. Re-emitted
every frame from `live.world.listLights()` like every other chrome element —
no cache, no per-icon Object3D, no disposal path.

*Alternative — DOM/absolutely-positioned divs synced to the transform:*
rejected; it duplicates zoom/pan sync in a second representation and splits
input handling (canvas picks vs. DOM clicks) when the flat batch already
draws zoom/pan-correct chrome and the pick already works in world-image px.

*Alternative — a texture/icon sprite in the sprite batch:* rejected; the
sprite batch is depth-tested scene content with per-pixel g-buffer occlusion
— putting chrome there would make icons occludable by sprites and visible in
depth semantics, exactly what "overlay chrome" must not be.

### D2: Selection/drag reuse the existing proximity pick unchanged

The Select tool already resolves lights within 14 px of the projected emitter
(`pickPlacementAt` light branch) and already starts a `selectDrag` from any
hit; the point-light tool already selects on click near a light. The icon adds
no new input path — it makes the existing one visible. The icon's visual core
(≈4 px) sits well inside the 14 px hit radius, so "click the icon" and "click
near the emitter" are the same event.

*Alternative — icon-shaped exact hit test:* rejected; two tolerances for one
affordance invites "I clicked the icon but missed" bugs, and the larger
radius is the friendlier target.

### D3: Hover ring computed per frame from `hoverRef`, not pointer events

In `renderFrame`, when the active tool is Select or point-light and
`hoverRef.current` is within the same 14 px of some light's projected emitter,
draw that light's ring at a hover alpha (reuse `lightRing`, ~0.3 — between the
ghost's 0.25 and selection's 0.4). Derived state, no new listeners, no store
writes; automatically correct after undo/erase/move because it reads the live
document each frame.

### D4: Icon tint straight from the light's sRGB hex

Convert `colorHex` channels to 0-1 floats directly for the flat batch (the
batch is not tone-mapped or lit — `renderer.ts` overlay colors are raw).
Selected/hover ring stays the neutral `HIGHLIGHT_COLOR` like today, so state
reads through shape, not color.

### D5: Icons always visible, brush clicks pass through

Icons render in all tool modes (constant chrome, like the grid). The
placement paths (`placeAt` branches in `onDown`/`onMove`) are untouched, so a
brush click on an icon places as if the icon were not there — only
Select/eraser/point-light consume picks today, and that stays true. In-memory
editor chrome only: nothing added to `WorldDocument`, `isoinfinity-world`
files, or any bundle (ADR 0006 — never serialize editor chrome).

### D6 (optional cleanup, non-blocking): unify the light tool's inline pick

The point-light tool's `onDown` carries its own inline 14 px loop
(WorldEditor.tsx:955-965) duplicating the selection pick's light branch. It
can collapse onto `pickAt`, but that refactor is not required for this
change; keep it only if it falls out naturally.

## Risks / Trade-offs

- [Many lights clutter the viewport] → icon is a small constant-size marker;
  the radius ring only appears on hover/selection; acceptable for
  editor-typical light counts.
- [Icon tint blends into a same-colored background] → dark under-diamond
  outline plus alpha keeps it legible on bright prerendered sprites.
- [Two lights within 14 px of each other] → the existing depth-ordered
  proximity pick decides (visually nearer wins); icons overlap identically.
  No mitigation needed.
- [Hover ring flicker when the cursor sits exactly between two lights] → the
  per-frame loop picks the first/nearest hit deterministically; visual jitter
  is bounded by the 14 px radius.

## Migration Plan

None — no format, API, or persisted-state change. Rollback is deleting the
icon emit + hover block in `WorldEditor.tsx`.

## Open Questions

None.
