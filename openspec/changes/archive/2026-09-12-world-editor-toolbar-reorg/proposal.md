# Proposal: World editor toolbar reorganization

## Why

The world editor spends a lot of its panel on chrome: `1rem` padding wraps
the editor (on top of the `1rem` `.center` padding), and the horizontal
toolbar burns a full row on text buttons (Save / Undo / Redo / Pencil /
Eraser / Light / Select / Snap) plus the brush dropdown. On a laptop screen
the isometric viewport — the thing the editor exists for — is a minority of
the panel. The tools also live in the toolbar row, far from the canvas they
act on.

## What Changes

- Reduce the margins around the world editor: the world editor panel joins
  the sprite editor in the full-bleed `.center-viewport` center area, and
  the world editor's own padding, the toolbar's bottom margin, and the flex
  gaps shrink. The editor area and toolbar visibly gain screen real estate.
- Move tool selection (Select, Pencil, Light, Eraser) out of the horizontal
  toolbar into a new thin vertical tool bar docked inside the world
  viewport (Photoshop-style), replacing the text labels with icons; the
  existing behavior of each tool is unchanged.
- Replace the Save, Undo, and Redo text buttons in the editor toolbar with
  icon buttons (same actions, same disabled states, tooltips keep the
  labels).
- Visually separate global actions (Save, Undo, Redo) from
  tool-contextual controls (Snap toggle, brush dropdown) in the toolbar,
  e.g. a divider between the two groups.
- Make the Snap toggle and the brush dropdown visible only while a
  placement (pencil) tool is active — hidden for Select, Eraser, and
  Light.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the world editor toolbar requirement changes — tool
  selection moves to a vertical icon tool bar inside the world viewport,
  Save/Undo/Redo become icon buttons with a global-vs-contextual grouping,
  and the contextual controls (Snap, brush dropdown) are visible only in
  placement mode. The shell layout requirement's margin behavior for world
  tabs changes to full-bleed like sprite tabs.

## Impact

- `src/app/App.tsx` — world tabs use the full-bleed center area.
- `src/app/components/WorldEditor.tsx` — toolbar contents, new vertical
  tool bar, contextual visibility rules.
- `src/app/components/EditorToolbar.tsx` / `src/app/app.css` — toolbar
  grouping/divider styles, vertical tool bar styles, reduced margins;
  possibly a small shared icon-button style and inline SVG icon components
  (new small module, e.g. `src/app/components/icons.tsx`).
- No renderer, bake, or store logic changes; tool behavior (setTool, brush
  selection, snap toggle) is untouched.
- Docs: `docs/runtime.md` (editor shell description) needs a touch-up;
  `docs/roadmap.md` gets a done-entry. No ADR — this is editor chrome, not
  a durable rendering/architecture trade-off.
- Format-version impact: none. No bundle, world JSON, or preset format
  changes; old worlds and sprites load exactly as before.

## Non-goals

- No changes to the sprite (bake) editor's toolbar or layout beyond
  sharing any new CSS/icon primitives.
- No new tools, no keyboard-shortcut changes, no reordering of tool
  behavior (right-click erase, E-cycle direction, shift+move height all
  stay).
- No properties-panel changes; brush height/shadow/direction stay there.
- No icon library dependency — inline SVG only.
