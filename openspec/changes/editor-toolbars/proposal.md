## Why

Editor actions are scattered: a sprite's save and place-in-world buttons sit
in the properties panel (and place-in-world again at the bottom of the
editor), the world's save lives behind a name field in the properties panel,
and the world editor's tool strip lists sprite layers as buttons with no way
to pick a placement brush before any layer exists. Every editor should own a
toolbar directly above its content, giving each kind a consistent home for
its primary actions and making worlds placeable without a prior
place-in-world handoff.

## What Changes

- Every editor tab gets its own toolbar rendered at the top of the editor's
  main content area (below the tab bar), switching with the active editor
  kind.
- Sprite editor toolbar: **Save** (prompts for a file name, offering the
  current name as default; workspace write when connected, download fallback
  otherwise) and **Place in world**.
- World editor toolbar: **Save** (prompts for a file name, default from the
  document's saved title or the next free `world-N`) and a **pencil**
  placement tool whose brush picker is a dropdown grouped into
  **Primitives** (the built-in test primitives) and **Sprites** (workspace
  `sprites/` bundles). The eraser stays available (toggle next to the
  pencil; right-click erase unchanged).
- Selecting a brush makes it placeable in that world document in memory:
  an already-placed layer is reused; a saved sprite loads its bundle; a
  primitive bakes with default settings. No bundle round trip is required
  and the world turns dirty on placement.
- The old world tool strip (one button per layer + eraser) and the sprite
  editor's bottom action row are absorbed by the toolbars.
- Properties panel stops duplicating these actions: the sprite panel keeps
  source info, bake settings, environment, and pass actions; the world panel
  keeps key light and sun-position controls. (Assumption: actions **move**
  to the toolbars rather than being duplicated.)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: The shell-layout requirement gains the per-editor
  toolbar; the properties-panel requirement drops the save/export actions;
  new requirements define the sprite toolbar (save with filename prompt +
  place-in-world), the world toolbar (save + pencil with grouped brush
  dropdown + eraser), and brush-driven in-memory layer acquisition. Assumes
  `integrated-react-editor` is archived first (its `integrated-editor`
  capability is the baseline this change refines).

## Impact

- `src/app/components/`: new `EditorToolbar` (per-kind variants) rendered
  by `SpriteEditor.tsx` / `WorldEditor.tsx`; `PropertiesPanel.tsx`,
  `SpriteProperties.tsx`, and `WorldProperties.tsx` lose the save/export
  buttons and the world name field.
- `src/app/store/bake.ts` (`saveSprite` gains a name parameter),
  `src/app/store/world.ts` (`saveWorld` gains a name parameter; new
  brush-acquisition action), `src/app/document.ts` (world `tool` already
  carries layer/primitive ids; brush state rides on it).
- Workspace listing (`store/project.ts`) feeds the Sprites brush group;
  `PRIMITIVE_KINDS` feeds the Primitives group. No format changes:
  `isoinfinity-bake/5` and `isoinfinity-world/1` unchanged.
- No engine changes (`src/runtime/` untouched except none); no new
  dependencies.
