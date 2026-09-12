# Design: World editor toolbar reorganization

## Context

The world editor (`src/app/components/WorldEditor.tsx`) is a flex column:
a horizontal `EditorToolbar` row, the `.world-viewport` canvas, and a hint
line. It renders inside `.center` (`padding: 1rem`), which sits inside the
world editor's own `padding: 1rem` — a double inset the sprite editor does
not pay (bake tabs get `.center-viewport`, padding 0). The toolbar row
holds ten text-labeled controls: Save / Undo / Redo / Pencil / brush
`<select>` / Eraser / Light / Select / Snap plus a hint span
(`WorldEditor.tsx:1226-1342`). Tool state (`doc.tool`: a brush id,
`'eraser'`, `select`, or `point-light`), the chosen brush, and the snap
flag already live in the per-document world store (`src/app/store/world.ts`)
— this change only moves and restyles the controls that drive them.

See proposal.md for motivation and the spec delta for the required
behavior.

## Goals / Non-Goals

**Goals:**

- Give the world viewport the space the chrome currently wastes (margins,
  one full toolbar row).
- Put tool selection next to the canvas as a compact icon strip.
- Make the toolbar scan faster: icons for global actions, one visual
  group boundary, contextual controls only when they apply.

**Non-Goals:**

- No tool-behavior, shortcut, or store changes; no sprite-editor layout
  changes; no icon dependency (see proposal Non-goals).

## Decisions

### D1: Icons are inline SVG components, no library

New small module `src/app/components/icons.tsx` exporting ~7 icon
components (`IconSave`, `IconUndo`, `IconRedo`, `IconSelect`, `IconPencil`,
`IconLight`, `IconEraser`) as simple 16–18px `currentColor` SVGs, used
inside buttons that keep their `title` tooltips.

- *Rejected: an icon font/library (lucide-react, react-icons).* Adds a
  dependency and bundle weight for seven glyphs, and the editor's flat
  dark UI needs only simple monochrome shapes.
- *Rejected: unicode glyphs / emoji.* Inconsistent across platforms and
  impossible to style precisely.

### D2: Tool bar is a viewport overlay docked at the viewport's left edge

A `.tool-bar` absolutely positioned inside `.world-viewport` (same
floating-panel language as `.zoom-controls`: `position: absolute; z-index:
2; panel background; border; border-radius`), vertically arranged, top-left
of the viewport. The canvas stays full-bleed underneath; the bar intercepts
pointer events only on itself, so `pointerPoint`/picking math is untouched.
The bar is ~2rem wide; buttons ~1.75rem square so touch targets stay
usable.

- *Rejected: a flex-sibling column left of the viewport.* Permanently
  consumes a gutter and forces the viewport (and its picking coordinate
  space) to shrink; "inside the workspace" reads as overlaying the
  editing surface, like Photoshop's docked strip over the canvas area.
- *Rejected: bottom-left.* Collides visually with the bottom-right zoom
  cluster's corner-panel rhythm; top-left is free in the world viewport
  (the `.slot-switcher` top-left overlay exists only in the bake
  viewport).

Note: sprites can pass underneath the bar. That is accepted (same as the
existing zoom cluster overlaying placements); the panel is near-opaque so
occluded content remains discoverable by panning.

### D3: Toolbar grouping — global group, divider, contextual group

Toolbar order becomes: `[Save] [Undo] [Redo] | [brush dropdown] [Snap] …
[hint]`. Implemented as a `.toolbar-separator` (1px vertical rule, same
height as the controls) or two `.toolbar-group` wrappers — exact markup
settled at implementation, the requirement is the visible separation. Icon
buttons get an `.icon-btn` style (square, centered glyph) so the three
global actions read as one unit.

### D4: Contextual visibility via conditional render, placement-mode = not a special tool

Placement mode is `tool` not in `{ 'select', 'eraser', 'point-light' }` —
this includes the initial `''` (no brush yet) state, where the dropdown
shows its `brush…` placeholder. The brush `<select>` and Snap button are
rendered only in placement mode (conditional render, not `display: none`)
— simpler, keeps the DOM honest for tests. The store is untouched, so
hiding cannot reset brush/snap state (satisfies the state-survival
scenario). The `lastBrush` ref logic (`WorldEditor.tsx:1135`) already
implements pencil-restore semantics and carries over to the tool bar's
pencil button.

### D5: Margins — world tabs go full-bleed, chrome insets shrink

- `App.tsx:42`: render `center center-viewport` for world docs too (the
  class name becomes a slight misnomer; a comment notes it covers both
  viewport editors).
- `.world-editor`: `padding: 1rem → 0.35rem`, `gap: 0.6rem → 0.35rem`.
- `.editor-toolbar`: `margin-bottom: 0.8rem → 0` (the flex gap covers the
  spacing), `padding: 0.45rem 0.75rem → 0.3rem 0.5rem`, `gap: 0.5rem →
  0.35rem`.
- The hint line under the viewport stays, at the reduced gap; its margins
  tighten if they still dominate. Exact px values are tuned visually
  during implementation; the spec pins the outcome (full-bleed, small
  chrome), not the numbers.

### D6: State model unchanged (ADR 0006)

Active tool, chosen brush, brush direction, and snap flag remain
per-document **in-memory editor state** — never serialized into world
files (ADR 0006: persisted / in-memory / engine objects). The tool bar
itself is editor chrome: nothing about it reaches `isoinfinity-world/5`.
Undo/redo buttons only call the existing `undoWorld`/`redoWorld`.

## Risks / Trade-offs

- [Icon-only controls hurt discoverability] → Tooltips keep the full names
  and behavior hints; the toolbar hint span still names the active tool in
  text; tool icons are conventional (cursor, pencil, bulb, eraser).
- [Tool bar overlays canvas content] → Accepted for the zoom cluster
  already; bar is thin and near-opaque; it never captures canvas events
  outside itself, so worst case is a hidden sprite recoverable by panning.
- [Delta stacks on the unarchived `add-world-select-tool` change] → The
  MODIFIED requirement blocks here are based on that change's versions of
  "World editor toolbar" / "Properties panel follows the active editor".
  Archive `add-world-select-tool` first; validate this change after
  (`openspec validate --strict`) to catch drift.
- [World docs sharing `.center-viewport` makes the class name misleading]
  → Rename is out of scope; a comment at the render site documents that it
  means "viewport editor, full-bleed".

## Migration Plan

Pure UI change, no data or format migration. Deploy: normal push to
`main` (Pages workflow). Rollback: revert the commit; no persisted state
is affected.

## Open Questions

None — exact spacing values and icon artwork are implementation details
tuned during apply.
