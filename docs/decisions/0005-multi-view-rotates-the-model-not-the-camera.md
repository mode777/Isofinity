# 0005 — Multi-view bakes rotate the model, not the camera

Status: Accepted (2026-09-04, `isoinfinity-bake/6`)

## Context

Sprites need to face placement directions (N/E/S/W). The bake has exactly
one fixed isometric camera — the whole format depends on it (see ADR 0001)
— so views cannot be "different camera angles" without breaking depth
reconstruction, the shared texture-array upload, and the fixed-view
runtime.

## Decision

`VIEW_SLOTS = ['n','e','s','w']` at 90° azimuth steps; **every slot renders
from the same fixed iso camera** and presents the model yaw-rotated about
the vertical axis (`R_y(yaw)`, `slotYawDeg` in `src/shared/iso.ts`),
re-anchored so the rotated box's min corner sits back at the origin
(`yawRotatedBoxSize`, `applySlotModelRotation`).

- The images are pixel-identical to rotating the camera instead — a rigid
  model↔camera transform maps the slot's virtual camera direction onto the
  fixed one — but the **stored world data is not**: normals, depth, and
  environment lighting belong to the rotated model's world frame, so each
  view is a drop-in sprite for a placement facing that direction, lit by
  the world-fixed environment exactly as the rotated asset would stand in
  it. (The first implementation rotated the camera; review rejected it on
  exactly these grounds.)
- G-buffer depth for every view is measured along the fixed world view
  direction; the per-view `azimuthDeg` in the manifest records the slot's
  view azimuth as a stable slot identifier, not a camera parameter.
- Format `/6`: the manifest keeps its entire `/5` shape for the N view
  (top-level, historical zip entry names) and adds one optional `views[]`
  table; extra views zip as `<id>-<slot>-gbuffer.exr` /
  `<id>-<slot>-render.png`. `/4` and `/5` parse as N-only. Provenance
  (source/settings/environment) is view-independent.

## Consequences

- One code path for all slots; N output stays byte-compatible with `/5`
  consumers, and worlds/runtime still consume only N (`extraViews` is
  editor-side until a placement-orientation change lands).
- Up to 4 g-buffers + 4 render images per open document (bounded by the
  8192 px sprite cap and per-document baker disposal).
- The realtime preview, box overlay, and pixel-size warnings must apply
  the slot's yaw too, or they disagree with what bakes.

## Rejected alternatives

- Rotating the camera per slot (first implementation): identical pixels,
  wrong stored normals/depth/lighting frame — a view baked that way could
  not be relit or occluded correctly in a world.
- Arbitrary camera angles: breaks ADR 0001's reconstructibility and the
  fixed-view compositor.
- Per-slot top-level manifest fields instead of a `views` table: forces
  world/runtime readers to learn `/6` immediately.
