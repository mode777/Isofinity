## Why

The bake tool (`bake.html`) and the runtime editor (`index.html`) are two
separate vanilla-DOM apps. Moving a sprite from bake to world today requires
a save-bundle / switch-page / load-bundle round trip, both pages duplicate
workspace wiring, and the imperative `getElementById` UIs (two ~550–680-line
`main.ts` files with hand-rolled state sync) get harder to extend with every
feature. Merging them into one React application with a shared shell turns
that round trip into an in-memory handoff and gives the growing editor a
real UI architecture.

## What Changes

- **BREAKING**: Replace the two-page app (`index.html` + `bake.html`) with a
  single integrated React editor page. `bake.html`, `src/bake/main.ts`,
  `src/runtime/main.ts`, and `src/shared/workspace-ui.ts` are deleted; Vite
  builds one entry.
- **BREAKING**: Sprite bundle format bumps to `isoinfinity-bake/5`, adding a
  provenance section to the manifest: bake source (primitive, or model file
  reference + scale), path-trace bake settings, and the environment used.
  `/4` bundles remain readable and open view-only (no provenance to edit).
- New application shell: top bar (workspace connect/reconnect/disconnect,
  version), tab bar, left project browser, right context-sensitive
  properties panel, center editor area, bottom status bar.
- Editor tabs with in-memory documents: opening a resource opens (or
  focuses) a tab; document state (bake source/settings/passes, world
  layers/placements/light) lives in memory independent of any render
  context, survives tab switches without saving, and carries a dirty
  indicator. One live editor context per editor type, (re)created from the
  document state.
- Project browser lists built-in primitives (always available) plus, when a
  workspace is connected, the workspace's `sprites/`, `models/`, `worlds/`,
  and `hdri/` contents — replacing the per-tool pickers and file inputs for
  opening assets; create actions start new sprite (primitive or model) and
  world documents.
- Properties panel switches content with the active editor: bake options +
  environment + pass/export actions for sprite editors, key light + sun
  position + ambient + dynamic-light switch for world editors.
- "Place in world" handoff: a baked sprite document's passes become a
  sprite layer in a world document in memory — no bundle round trip.
- State management via Zustand stores (workspace, project, bake, world,
  ui/tabs) wrapping the existing engine code unchanged; long-running path-
  traced passes run as store actions with generation guards.
- Resource-lifecycle hardening for React: `Renderer` gains `dispose()`,
  bake contexts dispose on reset, GL contexts are StrictMode-safe
  (workspace permission stays gesture-only).
- New dependencies: `react`, `react-dom`, `zustand`, `@vitejs/plugin-react`.

## Capabilities

### New Capabilities

- `integrated-editor`: The application shell — layout (top bar, tab bar,
  project browser, properties panel, editor area, status bar), tabbed
  in-memory editor documents, the project browser (built-ins + workspace
  assets, open/create flows), the context-sensitive properties panel, and
  the in-memory sprite-to-world placement handoff.

### Modified Capabilities

- `asset-baking`: Bundles emit format `isoinfinity-bake/5` with a provenance
  manifest section (source, bake settings, environment); sprites re-bake in
  the editor from recorded provenance; `/4` bundles open view-only.
- `runtime-sprite-rendering`: Bundle parser accepts `/4` and `/5` (render
  pass still required for placement, `/3` still rejected); the built-in
  test primitives get procedural-environment render passes inside the
  integrated editor (no external HDRI, no separate boot page).
- `workspace`: Workspace listings are surfaced through the integrated
  editor's project browser instead of per-tool pickers (behavior —
  filtering, refresh, degradation without File System Access — unchanged).
  Assumes `workspace-folders` is archived first (its `workspace` and
  `world-persistence` capabilities are the baseline this change refines).

## Impact

- **Deleted**: `bake.html`, `src/bake/main.ts`, `src/runtime/main.ts`,
  `src/shared/workspace-ui.ts` (replaced by the React app).
- **Unchanged engines**: `src/bake/` pipeline (`bake`, `bundle`, `export`,
  `gltf`, `iso`, `primitives`, `pt`), `src/runtime/renderer.ts`,
  `src/runtime/world.ts`, `src/shared/workspace.ts` / `iso.ts` / `sun.ts`.
  `src/runtime/assets.ts` evolves (document-shaped layer source, `/5`
  provenance parsing).
- **Build**: single Vite entry; React TypeScript config (`jsx`), new
  dependencies above. GitHub Pages deploy flow unchanged; deep links to
  `bake.html` die with the page.
- **Formats**: `isoinfinity-bake/5` (breaking; `/4` view-only fallback).
  `isoinfinity-world/1` unchanged.
- **Known-broken AO pass** stays out of scope: it is replaced by a future
  change, not this one.
