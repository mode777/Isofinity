# 0001 — Depth instead of a position pass

Status: Accepted (since inception; format `isoinfinity-bake/3` onward)

## Context

The design constraint is per-pixel world-space position + normal on every
baked asset, enabling pixel-accurate occlusion/intersection and deferred
lighting. Storing position naively costs three float channels per pixel —
two more than strictly needed.

## Decision

No position pass exists. With the fixed orthographic camera every pixel's
ray direction and origin are known constants, so full 3D position is
exactly reconstructible from the pixel coordinate plus one scalar:

- `depth = dot(worldPos, viewDir)` — linear ray distance from the global
  reference plane through the world origin, perpendicular to the view
  direction (chosen over camera distance so depths stay comparable across
  cube sprites and across assets).
- Depth lives in the g-buffer pass's alpha channel (rgb = world-space
  normal, a = depth) — the classic packed-G-buffer layout, and exactly the
  texture planned KTX2/UASTC delivery would carry.
- Reconstruction: `reconstructWorldPos()` (`src/bake/iso.ts` /
  `src/shared/iso.ts`) sits next to the camera constants so bake-time and
  runtime can never drift apart.

## Consequences

- Two float channels saved per pixel, forever, through every format and
  packaging change.
- Depth is half-precision through the pipeline (raster target) — worst
  case ≈ 0.0008 units (~0.1 px at 128 px/unit), accepted for the
  fixed-range layout.
- Normals must stay baked; deriving them from depth derivatives breaks at
  silhouettes and interior edges (the donut hole).
- The camera must remain fixed/orthographic — this trade depends on it
  (see the POE baseline: the fixed view is part of the design anyway).

## Rejected alternatives

- Storing a float RGB position pass: two extra channels, no consumer that
  depth cannot serve.
- Camera-relative distance instead of reference-plane depth: not
  comparable across sprites baked from repositioned cameras.
