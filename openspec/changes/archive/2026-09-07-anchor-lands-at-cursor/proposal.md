## Why

Placement aims by cursor, but the placement point is the cursor's ground position shifted half a cell (`gx - 0.5, gz - 0.5` in `placeAt`). That half-cell convention is invisible for assets anchored at their box min corner (the anchor coincides with the cell corner the convention was tuned for) and wrong for every other anchor: an asset anchored at its ground-plane center lands half a footprint away from the cursor — up-screen in isometric, which reads as "placed too high". The authored anchor should be the exact handle under the mouse.

## What Changes

- **BREAKING** (placement behavior, not formats): sprite placement SHALL land the asset's full 3D anchor point exactly at the cursor's ground position, at the brush height — the half-cell offset (`- 0.5`) is removed from placement.
  - With brush height 0 and an anchor at the asset's ground plane, the anchor's ground point is exactly the cursor's ground point.
  - With a raised anchor (e.g. a hanging sign's hook), the anchor point still lands at the cursor's ground position and the asset hangs accordingly (existing sinking rule, now cursor-exact).
  - With a negative brush height, the anchor lands at the cursor's ground position at that height.
- The placement ghost SHALL use the same point, so what the user sees while dragging is exactly what lands.
- Picking and erase are unchanged (ground-footprint based, independent of the anchor).
- `placeInWorld`'s hardcoded drop spot stays as-is (demo placement, not cursor-driven).
- Mesh (character) placement keeps its own convention for now (see Non-goals).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-sprite-rendering`: the placement-point requirement changes — the anchor lands at the cursor's ground position (free-form, cell-free) instead of the placement's half-cell-shifted ground position. The "Custom anchor lands at the placement point" scenario is rewritten: the anchor point is exactly the mouse position (ground + brush height); with anchor at ground plane and height 0, the anchor's ground point is the mouse's ground point.

## Impact

- `src/app/store/world.ts` (`placeAt`): drop the `- 0.5` offsets for sprite placement.
- `src/app/components/WorldEditor.tsx` (ghost emission): drop the same `- 0.5` offsets so ghost and placement agree.
- No bake-side change: manifests, `originPx`, provenance, and ADR 0008's anchor semantics are untouched — only where the handle lands.
- Docs: `docs/runtime.md` (placement description) and `docs/roadmap.md` get updates; `docs/decisions/0008` gets a short amendment note (the placement-point convention changes; the anchor itself is unchanged). No new ADR required — this refines 0008 rather than reversing it. Glossary: no new terms.
- Format-version impact: none. No manifest or world-file changes; saved worlds with existing placements load unchanged (their stored ground positions keep their meaning; only new placements land cursor-exact).

## Non-goals

- No change to bake outputs, `originPx` math, or the anchor authoring UI (ADR 0008's bake half stands).
- No change to picking/erase (ground-footprint, cell-free as today).
- No change to mesh/character placement convention (can follow in a later change if the same rule is wanted).
- No grid/cell snapping reintroduction.
