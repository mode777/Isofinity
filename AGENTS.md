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
- Vite for dev/build; site hosted on GitHub Pages
  (https://mode777.github.io/Isofinity/), deployed by
  `.github/workflows/deploy.yml` on every push to `main`.

## Commands

- `npm run dev` — dev server
- `npm run build` — typecheck (`tsc --noEmit`) + production build to `dist/`
- `npm run preview` — serve the built `dist/`
- No test or lint setup yet.

## Current state

- Bake tool (`bake.html`, `src/bake/`): bakes test primitives (sphere,
  donut, cube, cylinder, capsule, plane, slab) into per-asset sprite
  passes — albedo (PNG) and a merged g-buffer (float EXR: rgb = world
  normals, a = linear ray depth) — plus a manifest
  (`format: isoinfinity-bake/3`). Arbitrary cuboids bake directly; the
  1×1×1 cube is just the default cell. Conventions in
  `docs/bake-pipeline.md`.
- Runtime editor (`index.html`, `src/runtime/`, shared math in
  `src/shared/`): bakes sprites at page load, places them freely on an
  isometric ground plane. Raw WebGL2 compositor with per-pixel sprite
  occlusion and deferred-style directional lighting (key + ambient, shades
  the baked albedo/normal G-buffer) with realtime light controls. See
  `docs/runtime.md`.
- No released API: expect breaking changes while the architecture is under
  design.
