# Proposal: world-placement-height

## Why

Worlds are ground-level only: every placement sits on the grid plane, so
objects cannot stack or interpenetrate above the ground (a cube on a cube,
a lamp on a wall). The rendering architecture makes height nearly free —
g-buffer depth is measured against a global reference plane (ADR 0001), so
a translated asset's composite depth is a pure additive constant — meaning
placement can gain a height dimension with zero changes to bakes, assets,
or the sprite shader.

## What Changes

- Placements gain a free-form height `y` (world units, clamped ≥ 0),
  stored per placement and applied at render time.
- **Height control**: shift+wheel over the world viewport raises/lowers the
  brush height (free-form); a **surface-snap toggle** in the world toolbar
  overrides it — the ghost then sits at the height of the visible surface
  under the cursor, computed CPU-side from the world document's in-memory
  g-buffers (no GPU readback).
- **Height feedback**: when the effective placement height is above the
  ground, the viewport draws a plumb-line gizmo (landing diamond at the
  raised position, line down to the ground cell); **contact-shadow
  ellipses** are drawn on the ground under every raised placement and the
  ghost, with size/opacity falling off as height grows.
- **Renderer**: the per-instance depth offset gains the `y` term
  (`VIEW_DIR · (x,y,z)`) and the sprite blit shifts vertically by
  `SCREEN_UP[1] · y`; per-pixel occlusion then resolves stacking and
  intersection pixel-accurately. No shader, bake, or asset changes.
- **Persistence**: world files become `isoinfinity-world/2` with an
  optional per-placement height; `/1` files keep loading (ground level).
- Ghost preview, erase (topmost by 3D depth key), and drag-painting all
  honor the effective height.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the world toolbar gains the surface-snap toggle;
  the viewport's wheel convention reserves shift-modified wheel for
  placement height; new requirements for the placement-height control and
  the height feedback (gizmo + shadow ellipses); the ghost preview renders
  at the effective placement height.
- `runtime-sprite-rendering`: per-pixel occlusion extends to placements at
  any height — each instance adds its placement's `VIEW_DIR · (x,y,z)`
  offset to the baked g-buffer depth in the same global frame; erase keeps
  ground-footprint picking and resolves to the topmost placement.
- `world-persistence`: saving writes `isoinfinity-world/2` (per-placement
  height optional, default ground); loading accepts `/1` and `/2`, mapping
  a missing height to ground level.

## Impact

- **Code**: `src/runtime/world.ts` (Placement carries `y`; 3D depth sort
  key), `src/app/components/WorldEditor.tsx` (blit/depth offsets, shift+wheel,
  surface-snap computation, gizmo + shadow batches, canvas headroom),
  `src/app/store/world.ts` (format `/2` parse/save, height + snap actions).
  `src/runtime/renderer.ts` is unchanged; the bake pipeline is untouched.
- **Format impact**: `isoinfinity-world/1` → `isoinfinity-world/2`; the
  parser accepts both, per-placement `y` is optional and defaults to 0;
  no bake-format change, no bundle change.
- **Docs**: `docs/runtime.md` (world rendering + input), `docs/glossary.md`
  (height / surface-snap terms), `docs/roadmap.md`. `docs/bake-pipeline.md`
  is untouched (no bake convention changes). No new ADR — this applies
  ADR 0001 (depth-not-position) rather than settling a new cross-cutting
  trade-off.
- **Out of scope (non-goals)**: x/z snapping when surface snap is on
  (height-only snapping); negative heights (sinking below the grid — the
  ground batch writes no depth, so sunk sprites would read wrong); real
  shadow mapping (the depth reconstruction it needs is enabled by this
  change but is its own feature); rotating or moving existing placements;
  placement of E/S/W view slots; selecting individual placements.
