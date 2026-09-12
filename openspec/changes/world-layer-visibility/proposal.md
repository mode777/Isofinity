# Proposal: World editor layer-visibility dropdown

## Why

The world editor composites three layers — ground, sprites, and meshes — into
one viewport, and there is no way to temporarily declutter it: a sprite stack
hides the ground texture, the character hides sprites behind it, and the only
way to see through a layer is to delete placements. Isolating layers is a
standard editor affordance and cheap to add as viewport chrome.

## What Changes

- Add a layer control (stacked-layers icon button) docked in the world
  viewport's **top-right corner** — the mirror image of the top-left tool
  bar; the bottom-right corner already hosts the zoom cluster.
- Clicking the button toggles a dropdown with one checkable row per layer:
  **Ground**, **Sprites**, **Meshes**. Toggling a row hides/shows that layer
  in the viewport immediately.
- Hidden layers stop participating in the world: they are not drawn (ground
  surface, contact shadows, sprite/mesh batches and their baked grounding
  shadows), not pickable (Select and eraser skip them), and their placements
  no longer supply surface-snap heights. Hiding changes nothing about the
  stored world content — placements stay in place and reappear when the
  layer is shown again.
- Layer visibility is per-document in-memory editor state (ADR 0006 style,
  like the active tool): never serialized into world files, never pushed onto
  the undo/redo stack, and all layers start visible for new and opened
  worlds.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: adds the requirement for a world-viewport
  layer-visibility control — top-right icon + dropdown with Ground/Sprites/
  Meshes toggles, immediate render effect (including shadows), surface-snap
  exclusion, transient per-document state, and no canvas-input interference.
- `world-editor-selection`: adds the requirement that hidden layers are not
  pickable — Select and eraser pick only visible layers, while an existing
  selection on a hidden layer is kept (its highlight is suppressed until the
  layer returns).

## Impact

- `src/app/components/WorldEditor.tsx` — the corner control + dropdown UI;
  `renderFrame` gating (skip ground application, contact shadows, sprite/
  mesh instance and shadow emission per hidden layer); `pickAt` and the
  `effectiveHeight` surface-snap inputs filtered per visible layers.
- `src/app/document.ts` — transient `layerVisibility` field on
  `WorldDocument` (in-memory editor state, with the established
  "never written into world files" JSDoc convention).
- `src/app/store/world.ts` — defaults in `newWorldDoc`/`openWorldDoc`; a
  toggle action that updates the document without `markDirty` and without
  history.
- `src/app/components/icons.tsx` — stacked-layers icon; `src/app/app.css` —
  dropdown styles matching the existing corner panels.
- Minimal renderer touch only (`src/runtime/renderer.ts`): an optional
  per-frame `groundVisible` flag on the `render()` call so the ground stage
  can be skipped without disturbing the editor's ground-apply cache; sprites
  and meshes are already drawn exactly what the caller feeds, so their
  gating stays on the editor side. No bake changes.
- Docs: `docs/runtime.md` (world editor chrome description) gets a
  touch-up; `docs/roadmap.md` gets a done-entry. No ADR — editor chrome
  reusing the persisted/in-memory split already settled by ADR 0006.
- **Format-version impact: none.** No new world-file fields; old
  `isoinfinity-world/7` (and older) files load exactly as before, and no
  bundle or preset format changes.

## Non-goals

- No per-placement visibility — the dropdown toggles whole layers only.
- No fourth layer for point lights; light icons stay visible regardless of
  layer state.
- No persistence, undo/redo, or cross-session memory of visibility; no
  keyboard shortcuts; no per-tab (vs per-document) scoping change.
- No bake-pipeline, world-format, or renderer-architecture changes.
