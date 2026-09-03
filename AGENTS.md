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
- Vite for dev/build; site hosted on GitHub Pages
  (https://mode777.github.io/Isofinity/), deployed by
  `.github/workflows/deploy.yml` on every push to `main`.

## Commands

- `npm run dev` — dev server
- `npm run build` — typecheck (`tsc --noEmit`) + production build to `dist/`
- `npm run preview` — serve the built `dist/`
- No test or lint setup yet.

## Workflow

- Always commit and push after implementing an OpenSpec change with
  `/opsx-apply` (include the change's `openspec/changes/<name>/` artifacts).

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

## Current state

- Integrated editor (`index.html`, `src/app/`, a React application over
  framework-agnostic engines): one page with a top bar (workspace
  connection), a tab bar of in-memory editor documents, a project browser
  (built-in primitives + workspace `sprites/`, `models/`, `worlds/`),
  a context-sensitive properties panel (bake options for sprite tabs,
  light/sun for world tabs), editor area, and a status bar. Opening a
  resource opens/focuses a tab; documents survive tab switches without
  saving; one live editor context per editor kind. See `docs/runtime.md`.
- Bake pipeline (`src/bake/`): bakes test primitives (sphere, donut,
  cube, cylinder, capsule, plane, slab) and glTF models into per-asset
  sprite passes — a merged g-buffer (float EXR: rgb = world normals,
  a = linear ray depth) and an optional path-traced `render` pass
  (HDRI-lit, ACES; required for placement) — shipped as a zip-byte bundle
  named `<id>.sprite` with a manifest (`format: isoinfinity-bake/5`,
  carrying `provenance`: source, bake settings, environment so sprites
  re-bake in place; `/4` opens view-only). Legacy bundles that still
  record albedo/ao pass entries load with those entries ignored.
  Arbitrary cuboids bake directly; the 1×1×1 cube is just the default
  cell.
- Sprite→world handoff: a baked sprite document's passes become a world
  document layer in memory ("Place in world") — no bundle round trip.
- Workspace binding (File System Access API, `src/shared/workspace.ts`;
  convention: `hdri/`, `models/`, `sprites/`, `worlds/`) is surfaced
  through the top bar, project browser and panels, with dialogs/downloads
  as fallback. Conventions in `docs/bake-pipeline.md`. Worlds
  (placements + light state) save/load as `isoinfinity-world/1` JSON in
  the workspace's `worlds/` folder.
- Raw WebGL2 compositor (`src/runtime/renderer.ts`) with per-pixel sprite
  occlusion, deferred-style directional lighting (key + ambient, shades
  the baked render image by the g-buffer normals), and a global
  dynamic-light switch.
- No released API: expect breaking changes while the architecture is under
  design.
