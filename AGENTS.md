# AGENTS.md

## What this is

Isofinity renders a fixed top-down isometric view of a world composed of
pre-rendered objects, in the style of Baldur's Gate 1/2 and Pillars of
Eternity, with real-time dynamic lighting on top.

The defining design constraint: an object is more than a color sprite. Every
pre-rendered asset carries, per pixel:

- color (albedo) from the prerender,
- baked world-space positional data,
- baked normal data.

The per-pixel position/normal data is what enables pixel-accurate occlusion
and intersection tests plus deferred lighting over the static scene. Do not
model assets as plain RGBA images, and do not treat lighting as purely baked
or screen-space.

The technical baseline is `docs/poe-rendering-baseline.md` — Obsidian's
description of how Pillars of Eternity renders (four-pass bake: final,
depth, normal, albedo; deferred lights over the prerendered plane). Treat
it as the reference architecture; design against it.

## Toolchain

- TypeScript, rendering via WebGL2. Do not assume or introduce WebGPU or
  another backend.
- Do not try to run headless chrome or any other browser for verification.
  This environment cannot launch one; verify what is verifiable statically
  (`npm run build`, Node-runnable logic) and leave browser checks to the
  user.
- `/tmp/opencode` is root-owned and not writeable in this environment; use
  `/tmp` directly for temporary files instead.
- Vite for dev/build; site hosted on GitHub Pages
  (https://mode777.github.io/Isofinity/), deployed by
  `.github/workflows/deploy.yml` on every push to `main`.

## Commands

- `npm run dev` — dev server
- `npm run build` — typecheck (`tsc --noEmit`) + production build to `dist/`
- `npm run preview` — serve the built `dist/`
- `npm run verify:bundles` — Node-runnable bundle/multi-view checks
  (`src/bake/views-verify.ts`: manifest shape, parse round trips,
  old-format tolerance, rejection cases). Run after touching
  `src/bake/bundle.ts` or `src/bake/export.ts`.
- `npm run verify:mesh` — Node-runnable dynamic-mesh checks
  (`src/runtime/mesh-verify.ts`: CesiumMan GLB structure, skinned-asset
  extraction, pose-engine palettes, SH probe vs a numerical integral).
  Run after touching `src/runtime/meshAsset.ts` or
  `src/runtime/shProbe.ts`.
- Browser harness: `npm run dev` → `/scratch-verify.html` — bake/GL
  checks and primitive bundle hashes for regression diffs. Needs a
  browser: update it when bake behavior changes, but leave the actual
  browser run to the user.
- No test framework or lint setup; the two harnesses above plus
  `npm run build` are the gates.
- `openspec` is not on PATH; run it via `npx openspec ...` (verified:
  `npx openspec --version` → 1.11.0).

## Workflow

- Always commit and push after implementing an OpenSpec change with
  `/opsx-apply` (include the change's `openspec/changes/<name>/` artifacts).
- Whenever a commit is pushed after `/opsx-apply`, also report the resulting
  build version of the push: `v<commit count>+<short hash>` (e.g.
  `git rev-list --count HEAD` + `git rev-parse --short HEAD`).

## Versioning

- Every editor surface shows one shared build version, computed at
  build/dev time in `vite.config.ts` from git: `v<commit count>+<short
  hash>` (e.g. `v142+9f2a1bc`). It increases by one with each commit
  automatically — never bump it by hand.
- The constant is injected as `__APP_VERSION__` and consumed via
  `APP_VERSION` (`src/version.ts`); the editor's top bar shows it next to
  the app title.
- Builds without git metadata (zip download, unusual CI) fall back to
  `dev`. The Pages deploy uses `fetch-depth: 0` so the count is exact.

## Documentation

- `docs/poe-rendering-baseline.md` — the POE reference architecture;
  design against it.
- `docs/bake-pipeline.md` — bake conventions and the bundle format: the
  invariants (camera, depth semantics, row order, pass/channel layout)
  and the format-history table.
- `docs/runtime.md` — editor shell, document model, world rendering and
  input.
- `docs/glossary.md` — one-line definitions of every term the code and
  docs use (pass, view slot, provenance, placement, …).
- `docs/recipes.md` — touchpoint checklists per feature shape (format
  change, editor property, bake pass, primitive, world state).
- `docs/roadmap.md` — done/planned summary; update it when a change
  lands.
- `docs/decisions/` — architecture decision records (ADRs): the durable
  *why* behind cross-cutting invariants (depth-not-position, shading
  model, pass set, container, view slots).

Dividing rule: `openspec/specs/` pin required behavior, `docs/` hold
invariants and rationale, this file points rather than restates. When work
settles a durable architecture decision — a trade-off future changes must
respect — document it as a short ADR in `docs/decisions/` (new numbered
file + a row in its index). Full design/process records stay in
`openspec/changes/`; the ADR extracts only what outlives the change.

## Current state

- Integrated editor (`index.html`, `src/app/`, a React application over
  framework-agnostic engines): one page with a top bar (workspace
  connection), a tab bar of in-memory editor documents, a project browser
  (workspace `sprites/`, `models/`, `worlds/`), a context-sensitive
  properties panel, editor area, and a status bar. Documents survive tab
  switches without saving; one live editor context per editor kind.
  Shell/model details: `docs/runtime.md`.
- Bake pipeline (`src/bake/`): bakes test primitives and glTF models into
  per-asset sprite passes — a merged g-buffer (float EXR: rgb = world
  normals, a = linear ray depth) and a path-traced `render` pass
  (HDRI-lit, ACES; required for placement) — shipped as `<id>.sprite`
  zip-byte bundles with a manifest (`format: isoinfinity-bake/6`: N/E/S/W
  view slots, view-independent `provenance` so sprites re-bake in place;
  `/4`+`/5` open view-only/N-only). Worlds consume the N view. Pipeline
  details: `docs/bake-pipeline.md`.
- Sprite→world handoff: a baked sprite document's N-view passes become a
  world document layer in memory ("Place in world") — no bundle round
  trip.
- Workspace binding (File System Access API, `src/shared/workspace.ts`;
  convention: `hdri/`, `models/`, `sprites/`, `worlds/`, `presets/`) is surfaced
  through the top bar, project browser and panels, with dialogs/downloads
  as fallback. Worlds (placements + light state) save/load as
  `isoinfinity-world/1` JSON in the workspace's `worlds/` folder.
- Raw WebGL2 compositor (`src/runtime/renderer.ts`) with per-pixel sprite
  occlusion, deferred-style directional lighting (key + ambient, shades
  the baked render image by the g-buffer normals — multiplicatively, see
  `docs/decisions/0003`), a global dynamic-light switch, and a dynamic
  mesh batch (skinned character among sprites; three.js as CPU-side
  libraries, SH-irradiance ambient — see `docs/decisions/0007`). Mesh
  placements are in-memory editor state; serialization, locomotion and
  terrain are open follow-ons.
- No released API: expect breaking changes while the architecture is under
  design.
