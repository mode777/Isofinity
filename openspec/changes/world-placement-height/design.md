# Design: world-placement-height

## Context

The runtime composites sprites with per-pixel depth: every fragment
computes `d = g.a + depthOff` and writes `gl_FragDepth = 0.5 − d/128`
(`src/runtime/renderer.ts`), where `g.a` is the baked linear ray depth
against a **global reference plane through the world origin** (ADR 0001)
and `depthOff` is a per-instance constant fed `VIEW_DIR[0]·x +
VIEW_DIR[2]·z` (`src/app/components/WorldEditor.tsx`, the `emit()`
helper). Because all depths share one global frame, translating an asset
to any `(x, y, z)` is exactly equivalent to adding `VIEW_DIR · (x, y, z)`
to every pixel's depth — and `y` is simply the term nobody feeds in yet.
The sprite shader needs no change.

Current state around it: `Placement` is `{x, z, primId, key}` with
`key = VIEW_DIR·(x+½, ·, z+½)` used as the far→near painter sort (blend
ordering only; the LEQUAL depth buffer resolves opaque pixels in any
order). Placements are free-form cursor-centered on the ground; the ghost
preview exists; wheel = pan, ctrl+wheel = zoom, middle-drag = pan. World
files are `isoinfinity-world/1` parsed strictly in `src/app/store/world.ts`.
The world document's sprite layers already hold their g-buffers in memory
as half-float `Uint16Array`s.

See proposal.md for motivation; the spec deltas pin the behavior.

## Goals / Non-Goals

**Goals:**

- Pixel-exact occlusion for placements at any height, with zero renderer
  and zero bake changes.
- Height input that feels native to the existing wheel conventions.
- Surface snap computed without GPU readback stalls.
- Height made legible: gizmo + contact shadows, editor chrome only.
- Forward/backward-compatible world files.

**Non-Goals:**

- No shadow mapping (real shadows); the contact shadow is a drawn ellipse.
- No x/z snapping when surface snap is on (height-only snap).
- No negative heights: the ground batch writes no depth, so a sprite sunk
  below the grid would draw *over* the ground and read wrong. Clamp ≥ 0.
- No selection/moving of existing placements; no E/S/W slot placement.

## Decisions

### D1: Height rides the existing per-instance depth offset — renderer untouched

`emit()` sets `depthOff = VIEW_DIR[0]·x + VIEW_DIR[1]·y + VIEW_DIR[2]·z`
and blits the sprite at pixel-Y shifted by `y·SCREEN_UP[1]·PPU` (world +Y
is exactly screen-vertical at the fixed camera, so the shift is purely
vertical). `renderer.ts` is unchanged — the `aInst.w` slot already exists.

*Alternatives*: re-baking raised sprite variants (wasteful, wrong —
sprites are position-free by design); a real view-projection in the
shader (needless for a fixed orthographic camera); CPU compositing
(throws away the GPU per-pixel path). Chosen because ADR 0001's global
reference plane makes translation an additive constant — the LEQUAL depth
buffer then resolves stacking *and* interpenetration pixel-exactly
regardless of draw order.

### D2: Painter key gains the y term only

Sort key becomes `VIEW_DIR[0]·(x+½) + VIEW_DIR[1]·y + VIEW_DIR[2]·(z+½)`,
keeping the existing cell-center convention. The key only orders
alpha-blended AA edge pixels; the per-pixel depth test does the rest.

*Alternative*: key the full asset-box center (needs per-asset world size,
which `SpriteLayer` doesn't carry). Deferred — the same approximation
class exists today for non-cube assets.

### D3: Shift+wheel for height, reading both wheel axes

Some browsers translate shift+wheel into horizontal scroll (`deltaX`).
The wheel handler gains a shift branch that adjusts height from
`deltaY || deltaX`, with the existing `deltaMode` normalization; plain
wheel keeps panning, ctrl+wheel keeps zooming. Free-form per the user's
decision: apply the scaled delta directly (default step ~0.25 units per
wheel notch, tunable), clamped at 0.

*Alternative*: dedicated keys (PgUp/PgDn) or a toolbar stepper — more
discoverable but off-hand; the wheel is already the viewport's modifier
surface. Keyboard control can be added later without spec changes.

### D4: Surface snap computed CPU-side from the in-memory g-buffers

At the cursor pixel, for each placement whose blit rect contains it:
sample that layer's g-buffer texel, skip empty pixels
(`length(normal) == 0`), compute `d = g.a + VIEW_DIR·placement offset`,
keep the max. Reconstruct the surface point with the orthonormal frame
from `src/shared/iso.ts`:

```
worldPos = u·SCREEN_RIGHT + v·SCREEN_UP + d·VIEW_DIR
```

(pixel → world units via the same `toPx` inverse the picking already
uses). Placement height = `worldPos.y`. No GPU readback (no
`readPixels` stall, no PBO plumbing), no dependency on the bake-side
`reconstructWorldPos` (`src/bake/iso.ts` — same math, different pixel
frame). Cost: O(placements) texel samples per pointer move.

*Alternative*: async GPU depth readback — exact same numbers but adds
fence/PBO machinery for a value we already hold in memory.

### D5: Snap sets height only; x/z stays cursor-centered free-form

Preserves today's placement feel and the per-pixel-occlusion exercise it
enables. One-click aligned stacking would want optional x/z snapping —
recorded as a possible follow-up, deliberately excluded here.

### D6: Contact shadows and the gizmo are flat-batch editor chrome

Draw order becomes ground → shadows → sprites → highlight: ellipses are
CPU-projected ground polygons (triangle fan through `groundToScreen`,
slightly larger and fainter as height grows) drawn alpha-blended without
depth interaction, so sprites always composite over them and the ground
never conflicts (it writes no depth). The gizmo — landing diamond at the
raised ghost position + plumb line to the ground cell — reuses the same
flat program and the existing highlight styling, drawn whenever the
effective ghost height is > 0. Both live in a per-frame dynamic buffer
like the existing eraser highlight. Nothing of this reaches a world file
(ADR 0006 state model).

### D7: `isoinfinity-world/2` with optional per-placement `y`

`parseWorldFile` accepts `/1` and `/2`; `/2` placement entries carry an
optional finite `y` (absent or `/1` → 0). The saver writes `/2` and
always emits `y` (0 for ground level) — uniform files, tolerant reader.
`Placement` gains `y`; `World.place/removeAt/list` thread it through;
erase keeps ground-footprint picking with the max-depth-key rule, which
naturally removes the top of a stack (same cell ⇒ y dominates the key).

*Alternative*: silently extend `/1` — rejected: old builds would load
stacked worlds flattened to the ground, and the project's format
discipline is strict-reject by name.

### D8: Height level and snap toggle are per-document in-memory state

`WorldDocument` gains `heightLevel: number` (default 0) and
`surfaceSnap: boolean` (default off) — preserved across tab switches like
`tool`/`viewTransform`, never serialized into world files.

## Risks / Trade-offs

- [Half-float g-buffer depth ulp grows with d (~1 px at d≈28, far corner
  plus tall stack) → possible hairline seams between coplanar faces of
  adjacent sprites] → pre-existing condition, slightly more reachable
  with stacks; if visible, switch the g-buffer texture upload to RGBA32F
  (`halfArray` in `src/runtime/assets.ts`) — localized change, no format
  impact.
- [Painter-key approximation can mis-order AA edge blends for
  interpenetrating non-cube assets at mixed heights] → same class as
  today's approximation; opaque pixels are unaffected (depth-test
  resolved). Monitor; full fix needs per-asset box size in the layer set.
- [Contact shadow under an object standing next to a wall can look
  detached] → acceptable for chrome; radius/falloff constants are tuning
  knobs, not behavior.
- [Surface snap height is the *surface point's* y, so hovering a side
  face places at mid-height] → intended under free-form rules (walls
  grow sideways); the ghost shows it before the click.

## Migration Plan

No data migration: `/1` files load unchanged; a re-save upgrades a world
to `/2` naturally. Rollback is a plain revert — an older build then
rejects `/2` files with the existing named-error path, acceptable while
the format carries no released-API guarantee. Browser-only feature; no
deploy sequencing beyond a normal push.

## Open Questions

- Exact wheel step size and where the numeric height readout lives
  (status bar vs toolbar) — feel decisions, settle during implementation;
  the specs pin behavior, not the step constant.
