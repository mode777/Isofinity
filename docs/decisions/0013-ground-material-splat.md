# 0013 — Ground material splat: four slots, one RGBA coverage texture, displacement seams

Status: Accepted (2026-09, terrain-material-painting)

## Context

The ground was a single tiled material. Authors needed several materials
blended by a painted coverage map, with seams that read as natural rather
than a linear fade, persisted so a world carries its painting with it.
Three constraints shaped the decision: the ground program must stay within
WebGL2's guaranteed fragment sampler budget; a stamp that "replaces" one
material with another must not merely tint both; and the coverage mirror
must outlive the per-tab editor renderer so undo, save and resize keep
working. Full process record:
`openspec/changes/terrain-material-painting/`.

## Decision

The ground (`src/runtime/renderer.ts`, `src/app/groundMaterial.ts`,
`src/shared/splat.ts`) blends up to four material slots sampled as four
`TEXTURE_2D_ARRAY`s — diffuse, normal, arm, displacement, four layers each
— plus the coverage splat: five texture units. All maps are normalized to
one size and RGBA8 (EXR diffuse is converted).

The coverage splat is RGBA8: rgb are slots 0–2 and alpha is slot 3,
derived as `1 - r - g - b`, so the four weights always sum to 1. A brush
stamp is a **normalized replace** (`w ← (1-a)·w + a·e_c`); slot 3 clears
rgb, which raises the derived alpha. In the shader, each material's weight
is modulated by its optional displacement map (`disp`/`displace`/
`displacement` in the zip name) centered on 1 (`1 + (h - 0.5)·scale + bias`)
so a missing map is neutral and only the transition band changes.

The engine keeps a **CPU coverage mirror** on the world document as the
source of truth (ADR 0006 engine state, never serialized) — painting,
per-stroke undo, resize, and save all operate on it, and the renderer
uploads full or changed rectangles. Coverage persists as a PNG beside the
world JSON (custom raw-channel codec in `src/shared/png.ts`, because canvas
premultiplies and would destroy rgb under alpha 0); the world format is
`isoinfinity-world/8` (`ground.materials[]`, `ground.paint`), with `/1`–`/7`
still loading.

## Consequences

- The ground shader fetches five arrays/splat and composites albedo,
  normal and AO in-shader; adding a fifth material would need a different
  layout, and per-material tile scales are deliberately not supported (one
  shared scale).
- EXR ground diffuse loses HDR radiance to the RGBA8 arrays (accepted).
- Coverage resolution is fixed texels-per-world-unit (16 by default,
  capped at 2048), so painting keeps a consistent brush size in world
  units; resizing the ground resamples the mirror.
- The paint stamp is CPU, not a blended GPU draw: correct normalized
  replace for all four channels is not expressible in one fixed-function
  blend when the fourth lives in alpha, and the mirror must survive
  renderer remounts for undo/save anyway.
- The splat PNG is a second file the world owns; Save As renames it and the
  JSON references it, so worlds stay relocatable.

## Rejected alternatives

- **Four independent painted channels** — needs either a CPU stamp loop or
  a ping-pong FBO plus readback plumbing; the derived fourth keeps the
  invariant free and one stored-alpha channel.
- **Composite prepass into a screen-space texture** — keeps HDR and bounds
  samplers, but adds a render target and a second blend stage for a
  capability (HDR ground diffuse) that was not required.
- **Separate per-slot samplers** — 4 materials × 4 maps + splat = 17 units,
  over WebGL2's guaranteed 16.
- **Coverage-multiplier or layer-stack semantics** — tints rather than
  replaces, contrary to the requested paint behavior.
- **Canvas PNG round trip** — `putImageData`/`drawImage` premultiply, so a
  coverage rgb value under alpha 0 would be lost; the raw codec preserves
  every channel.
