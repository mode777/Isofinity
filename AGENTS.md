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

- Every tool (bake tool and runtime editor) surfaces one shared build
  version, computed at build/dev time in `vite.config.ts` from git:
  `v<commit count>+<short hash>` (e.g. `v142+9f2a1bc`). It increases by one
  with each commit automatically — never bump it by hand.
- The constant is injected as `__APP_VERSION__` and consumed via
  `APP_VERSION` (`src/version.ts`); both pages show it next to their title.
- Builds without git metadata (zip download, unusual CI) fall back to
  `dev`. The Pages deploy uses `fetch-depth: 0` so the count is exact.

## Current state

- Bake tool (`bake.html`, `src/bake/`): bakes test primitives (sphere,
  donut, cube, cylinder, capsule, plane, slab) and glTF models into
  per-asset sprite passes — albedo (PNG), a merged g-buffer (float EXR:
  rgb = world normals, a = linear ray depth), and an optional path-traced
  `render` pass (HDRI-lit, ACES) — shipped as a zip-byte bundle named
  `<id>.sprite` with a manifest (`format: isoinfinity-bake/4`). Arbitrary
  cuboids bake directly; the 1×1×1 cube is just the default cell. Both
  tools can bind a workspace folder (File System Access API,
  `src/shared/workspace.ts`; convention: `hdri/`, `models/`, `sprites/`,
  `worlds/`) to load and save assets in place, with dialogs/downloads as
  fallback. Conventions in `docs/bake-pipeline.md`. The path-traced `ao`
  pass is KNOWN BROKEN (accumulates empty output) and will be replaced
  with a different approach in a future change.
- Runtime editor (`index.html`, `src/runtime/`, shared math in
  `src/shared/`): bakes sprites at page load, places them freely on an
  isometric ground plane, and loads extra objects from `.sprite` bundles
  (dialog or workspace `sprites/` listing); worlds (placements + light
  state) save/load as `isoinfinity-world/1` JSON in the workspace's
  `worlds/` folder. Raw WebGL2 compositor with per-pixel sprite occlusion,
  deferred-style directional lighting (key + ambient, shades the baked
  albedo/normal G-buffer), per-sprite baked/unlit display modes, and a
  global dynamic-light switch. See `docs/runtime.md`.
- No released API: expect breaking changes while the architecture is under
  design.
