## Context

The shell (`src/app/App.tsx`) renders editors keyed by document kind;
`SpriteEditor.tsx` and `WorldEditor.tsx` each own a container div and their
existing chrome (view notice, pass figures, the world `.tools` strip,
`.editor-actions`). Save and place-in-world currently live in
`SpriteProperties.tsx` / `WorldProperties.tsx`; the store actions
`saveSprite` (`store/bake.ts`), `saveWorld` / `setTool` / `placeAt`
(`store/world.ts`) derive or receive names implicitly. World documents
already carry `tool: string` ("a layer id, a primitive id, or 'eraser'"),
and the world render loop re-reads the live document every frame, so tool
and layer changes need no new rendering wiring. `placeInWorld`
(`store/world.ts`) converts a bake document's passes into a layer via
`resultToLayer` (`store/bake.ts`) and requires `result` + `render` passes.

## Goals / Non-Goals

**Goals:**

- One toolbar per editor kind, rendered above that editor's content, owning
  its primary actions.
- Brush-driven world placement that works without a prior place-in-world
  handoff (primitives bake on demand, saved sprites load on demand).
- Filename prompts on both save actions with sensible defaults.

**Non-Goals:**

- Undo/redo, placement preview ghosts, drag-from-project-browser placement.
- Custom modal dialog infrastructure (native `prompt` is enough for now).
- Touching the known-broken AO pass or the properties panel's pass actions.
- Download fallback for world saves (stays workspace-only, per
  `world-persistence`).
- Format changes (`isoinfinity-bake/5`, `isoinfinity-world/1` unchanged).

## Decisions

- **Toolbar lives inside each editor component, not in `App.tsx`.** A shared
  presentational `EditorToolbar` (flex row styled like `.topbar`, new
  `.editor-toolbar` class) is rendered as the first child of
  `.sprite-editor` / `.world-editor`. Alternatives: a shell-level row under
  the tab bar keyed by doc kind (keeps placement uniform but duplicates the
  kind switch that `App.tsx` already does and pulls editor concerns into the
  shell); floating panels (rejected: not a toolbar). Editors already own
  their chrome, so the toolbar switches with the editor for free.
- **Filename prompts use `window.prompt`.** Consistent with the existing
  `window.confirm` dirty-close guard; zero new UI infrastructure. Defaults:
  sprite → the document's current title (falling back to the bake result
  id, extension stripped); world → the saved ref title, else
  `suggestWorldName`. `null` (cancel) aborts before any write; dirty state
  untouched. A styled modal can replace this later without spec changes.
- **`saveSprite(docId, name?)` / `saveWorld(docId, name?)` take explicit
  names.** Callers (the toolbars) run the prompt; the panel buttons and the
  world name input are deleted. Sanitization, `sprites/` vs `worlds/`
  targets, verbatim re-save of view-only bundles, ref/title update, and
  dirty clearing stay in the store actions, unchanged in behavior.
- **Brush model rides on the existing `doc.tool` string.** `tool ===
  'eraser'` keeps meaning eraser (toolbar toggle + right-click, as today);
  any other value is the active brush id and implies the pencil. New worlds
  default to pencil with no brush selected (`tool: ''`); clicking with no
  brush places nothing and the hint tells the user to pick one. This
  replaces the per-layer button strip; `setTool` is unchanged.
- **Brush dropdown is built from two groups with explicit kinds:**
  Primitives from `PRIMITIVE_KINDS` (always available), Sprites from
  `useProject(s => s.sprites)` (workspace `sprites/` listing, shown when
  connected). A selected value is `{ kind: 'primitive' | 'sprite', id }`,
  so store code never sniffs strings; the dropdown shows the friendly name
  and the toolbar displays the active brush.
- **Acquisition (`selectBrush`) ensures a layer, then sets the tool.**
  Order: if `doc.layers` already holds `id`, just `setTool`. Otherwise:
  - *saved sprite*: `readWorkspaceFile('sprites', name)`, parse with the
    bundle parser `openBundleDoc` uses, convert passes via `resultToLayer`,
    append layer with `id` = bundle stem (asset id — matches how world
    saves reference placements). Bundles lacking the passes a layer needs
    (e.g. no render pass) are rejected with a status message.
  - *primitive*: bake a transient bake document (same factory the project
    browser uses, never opened as a tab) with default settings — raster
    bake + render pass, the same passes `placeInWorld` requires — then
    `resultToLayer` into the world doc and dispose the baker.
  Async steps run under a per-document guard like the existing long-running
  store actions; progress and failures land in the status bar; failure
  leaves `tool` untouched. Acquiring a layer marks the world dirty.
- **Sprite editor's bottom `.editor-actions` row is removed.** Place in
  world moves to the toolbar; re-bake stays in the properties panel's pass
  actions (already duplicated there today). The world `.tools` strip is
  replaced by the toolbar.

## Risks / Trade-offs

- [Primitive bake-on-demand costs a raster + path-traced render] → bake
  with default (fast) settings, report progress in the status bar, cache the
  layer in the world document so it happens once per brush per document.
- [`window.prompt` is blocking and plain] → acceptable at this scale and
  consistent with the existing confirm dialog; swap for a modal later.
- [Layer id collisions: a saved sprite named `sphere.sprite` shares `sphere`
  with the primitive] → brush acquisition is first-wins per document (an
  existing layer is reused); documented behavior, not guarded against.
- [Two places still know editor kinds (App switch + editor components)] →
  mild; the toolbar is self-contained per editor so no shared registry is
  needed yet.

## Migration Plan

Pure UI/store refactor on one page; no data or format migration. Ships
behind the normal Pages deploy; rollback is reverting the commit.

## Open Questions

None.
