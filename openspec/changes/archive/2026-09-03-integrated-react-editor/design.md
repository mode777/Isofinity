## Context

Two vanilla-DOM apps share UI-free engines: `src/bake/main.ts` (550 lines)
and `src/runtime/main.ts` (681 lines) are `getElementById` wiring, hand-
rolled state sync, and status strings over `src/bake/*` (bake pipeline,
`PtBaker`, bundle IO), `src/runtime/renderer.ts` (raw WebGL2), `src/runtime/
world.ts`, and `src/shared/workspace.ts` (File System Access state machine
with an `onWorkspaceChange` observer). The `workspace-folders` change
(specs pending archive) established the workspace capability this change
refines. Sprite bundles are `isoinfinity-bake/4`; worlds are
`isoinfinity-world/1`. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- One React page hosting both editors behind a shared shell, with tabs over
  in-memory documents that survive switching without saving.
- In-memory sprite→world handoff (place-in-world) replacing the bundle
  round trip.
- Provenance in bundles so sprites are re-editable (`isoinfinity-bake/5`).
- Keep every engine module framework-agnostic and file-compatible
  (`isoinfinity-world/1` unchanged).

**Non-Goals:**

- Replacing the known-broken AO pass (future change).
- Per-placement editing in the world editor (selection, move, rotate) —
  world interaction stays place/erase as today.
- Resizable panels, theming, or a component library.
- Migration tooling for `/4` bundles (they keep loading, view-only).
- Multi-file `.gltf` provenance: model provenance stores one workspace file
  name; self-contained `.glb` is the re-bakeable case.

## Decisions

### D1: Document/view split; one live context per editor kind

Editor documents are plain data, keyed by document id in the stores:

- `BakeDocument`: source (primitive | {modelFileName, scale}), bake
  settings, environment (procedural marker | {hdriFileName, rotation,
  intensity, exposure, saturation}), baked passes (`BakeResult` arrays,
  `PtImage`s), `resourceRef` (bundle name when opened/saved), `dirty`.
- `WorldDocument`: `SpriteLayer[]`, placements (`World`), light + sun
  state, `resourceRef`, `dirty`.

Tabs are `{docId, kind}`; the ui store maps resources to open tabs so
re-opening focuses. Editor contexts are views: the world `Renderer` is a
singleton recreated/disposed by the WorldEditor component lifecycle; the
bake side keeps no permanent GL context — pass display draws stored buffers
to 2D canvases, and `PtBaker` is materialized lazily by bake actions and
disposed when the active document changes.

*Alternatives*: one live GL context per tab (hits browser context limits,
wasteful); reset-on-switch losing unsaved work (rejected — documents must
survive without saving). The pipelines already produce plain typed arrays
(`BakeResult`, `PtImage`, `SpriteLayer`), so no engine change is needed for
render-agnostic documents.

### D2: React owns chrome only; engines mount through refs

React renders the shell, panels, browser, tabs — never canvas content.
Editor components own their canvas via `ref` and instantiate/dispose their
engine in `useEffect` (with cleanup). Store subscriptions drive the rAF
render loop, so React re-renders never touch GL state.

*Alternatives*: react-three-fiber (wrong fit — the compositor is raw
WebGL2 and the path tracer is already encapsulated; R3F would only add
reconciliation risk); keeping vanilla DOM (perpetuates the sync problem).

### D3: Zustand stores with slices

Slices: `workspace` (adapts `workspace.ts`'s observer),
`project` (listings + built-ins), `bake`, `world`, `ui` (tabs, active tab,
status line). Rationale: cross-region access (status bar is written from
every slice; project browser triggers bake/world actions), long-running
async actions with generation guards live naturally as store actions, and
`transient` updates (progress strings) avoid re-rendering canvases.
*Alternative*: Context + `useReducer` — workable but re-renders whole
subtrees and has no idiomatic async-action home.

### D4: `isoinfinity-bake/5` provenance

Manifest gains an optional-but-written-on-save section:

```
"provenance": {
  "source": { "kind": "primitive", "primitive": "donut" }
           | { "kind": "model", "model": "robot.glb", "scale": 2 },
  "bake": { "samples", "bounces", "textureSize", "aoSamples", "aoRadius" },
  "environment": { "procedural": true }
               | { "hdri": "sunny.hdr", "rotationDeg", "intensity",
                   "exposure", "saturation" }
}
```

Model references are workspace-relative file names resolved against
`models/` (flat, matching the existing listing convention); environment
references against `hdri/`. Parser accepts `/4` + `/5`; `/4` and
missing-reference `/5` open view-only. Breaking the format is acceptable
per the proposal; `/3` parsing is dropped.

### D5: Place-in-world via the existing `SpriteLayer` normalization

Place-in-world converts the document's passes with the same helpers the
boot bake uses (row flip, float→half g-buffer, `PtImage`→bytes), producing
a `SpriteLayer` pushed into the target `WorldDocument`; id uniqueness via
the existing `uniqueId` scheme. No new interchange format.

### D6: Built-ins bake on open, not at boot

The runtime's all-at-boot bake (`bakeSpriteLayers`) is retired. Opening a
built-in primitive runs the raster bake immediately and the render pass
against the procedural environment automatically, so the sprite is
placeable without user assets (spec: runtime-sprite-rendering delta). New
world documents start with an empty grid — the old demo scene is not
recreated.

### D7: Single page, no router, plain CSS

One Vite entry (`index.html`); the active tab is state, not a URL (deep
links to `bake.html` die — accepted). Styling ports the current dark
palette into plain CSS files with CSS variables; no CSS framework.

### D8: Resource-lifecycle hardening

- `Renderer` gains `dispose()` (delete programs/buffers/textures, release
  context) — required by tab close and StrictMode double-mount.
- All async pass actions check a generation token before committing
  results (pattern already present in `bake/main.ts`, moved into stores).
- Workspace permission stays gesture-only; boot init (`initWorkspace`) is
  idempotent and StrictMode-safe.
- Browsers without File System Access: workspace control disabled with
  reason; dialogs/downloads still work (existing workspace behavior).

## Risks / Trade-offs

- [Memory: each document holds full pass arrays (MBs each)] → acceptable
  for a handful of tabs; dirty-confirm on close prevents silent
  accumulation; no LRU eviction in v1 (documented limit).
- [Long path-traced runs inside store actions can span tab switches] →
  generation tokens discard stale results; switching away from a baking
  tab lets the run finish or be superseded, never corrupt another
  document.
- [React StrictMode double-mounting GL setup] → every effect has a
  symmetric cleanup; `Renderer.dispose()`; dev-mode verification step in
  tasks.
- [Bundle size +~45 KB gzipped (react/zustand)] → irrelevant at this
  scale; three.js already dominates.
- [Workspace-relative model refs break on external rename/move] →
  view-only degradation with a named message; user re-picks the file.
- [`workspace-folders` must archive before this change] → its deltas
  define `workspace`/`world-persistence` capabilities this change modifies
  and builds on; sequence the archives.

## Migration Plan

Single change, clean cut on `main`: new shell replaces both pages, Vite
input collapses to `index.html`, old UI files deleted in the same change.
Deploy unchanged (Pages workflow builds `dist/`). Rollback = git revert;
no data migration exists (bundles/worlds are user files; `/4` bundles and
`isoinfinity-world/1` worlds keep loading).

## Open Questions

None material. The AO-pass replacement and per-placement world editing are
deliberately deferred, not open.
