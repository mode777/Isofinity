## Why

The world editor can place sprites, characters, and point lights and erase
them, but it cannot select an existing placement to inspect or adjust it.
Changing a placed sprite's height or grounding shadow means erasing and
re-placing it, and the only per-placement selection that exists today is the
Light tool's click-to-select. The properties panel is also inconsistent: light
properties live in the right panel while the brush's height, shadow, and
direction controls live in the toolbar, so the same conceptual properties
appear in two different places.

## What Changes

- Add a **Select** tool to the world toolbar. Clicking selects the placement
  under the cursor — a sprite, character, or point light — and clicking empty
  space deselects; the selected placement is highlighted in the viewport.
- Selection is **pixel-accurate for sprites**: the picker tests the
  placement's baked g-buffer silhouette at the cursor pixel (CPU-side, from
  the document's in-memory g-buffers) instead of its ground footprint, and
  resolves overlaps by per-fragment depth. Characters and point lights are
  picked by screen-space proximity to their projected anchor.
- **Dragging a selected placement moves it** on the ground plane (free-form
  x/z), recorded as one undo command per drag so it integrates with the
  existing undo/redo history. A light's emitter and a character's feet follow
  the cursor.
- Move the world editor's brush **height, shadow, and direction** controls out
  of the toolbar into a new properties-panel **Brush** section. A
  selected-placement section shows the selected sprite's/character's position,
  height, and shadow (opacity), reusing the existing point-light editor for
  lights. The toolbar keeps the pencil, brush dropdown, eraser, light and
  select tools, undo/redo, and the surface-snap toggle.
- No world file format change: selection, the move gesture, and the brush
  defaults are in-memory editor state (ADR 0006) and are never serialized.
  `isoinfinity-world/6` is untouched and every old file loads unchanged.

## Capabilities

### New Capabilities

- `world-editor-selection`: the select tool and a unified placement selection
  (sprite / character / point light), pixel-accurate sprite picking from the
  baked g-buffers, the viewport selection highlight, drag-to-move on the
  ground plane as an undoable edit, and selection lifecycle (deselect on empty
  click / Escape, drop a stale selection after undo or erase).

### Modified Capabilities

- `integrated-editor`: the world toolbar and properties panel change — the
  world toolbar requirement drops the placement-height, shadow, and
  brush-direction controls and gains a Select tool, and the properties-panel
  requirement gains a Brush section (height, shadow, direction) and a
  selected-placement section consistent with the existing point-light editor.

## Impact

- `src/runtime/world.ts` — sprite placements gain a stable id; the world's
  selection/move entry points (the selection identity is shared with mesh and
  light placements).
- `src/runtime/` — a CPU-side picker that samples the in-memory sprite
  g-buffers at the cursor pixel (reusing the texel indexing established by
  `surfaceSnap.ts`), plus the placement-move math.
- `src/app/store/world.ts` — unified selection state and actions, move
  commands recorded on the existing history stack, and removal of the
  toolbar-level height/shadow/direction actions in favour of panel actions.
- `src/app/components/WorldEditor.tsx` — select-tool pointer handling, drag
  move, selection/move overlay, toolbar slimming.
- `src/app/components/WorldProperties.tsx` and `controls.tsx` — Brush and
  selected-placement sections.
- `docs/runtime.md` (world editor input and properties), `docs/glossary.md`
  (select tool, selection, pick), `docs/roadmap.md` (feature). An ADR is
  warranted and planned: selection picks from the in-memory g-buffers on the
  CPU rather than adding a GPU picking/id pass.
- Format-version impact: none — no new world fields, no tolerance changes; the
  in-memory buffers the picker reads are not serialized.

## Non-goals

- No multi-select, marquee, copy/paste, or delete-key removal of the
  selection.
- No silhouette-accurate picking for characters or point lights (screen-space
  proximity to their projected anchor only) and no GPU picking FBO/id pass.
- No change to placement or erase picking: both keep their ground-footprint
  semantics.
- No undo for selection changes themselves (moving is an undo command;
  selecting/deselecting is not).
- No serialization of selection, move state, or brush defaults into world
  files, and no new world format version.
