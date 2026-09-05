## Why

The world editor clamps placement height at the ground plane: both
shift+mouse-move and the toolbar height field refuse to go below `0`
(`setHeightLevel` in `src/app/store/world.ts`, `HeightInput` in
`src/app/components/WorldEditor.tsx`). That makes it impossible to sink a
sprite into the ground or below a neighbouring surface — the standard trick
for waterlines, buried rocks, or seated figures — even though every
downstream system (projection, depth sort, occlusion, world files) already
treats height as a plain finite world-unit offset.

## What Changes

- Allow negative placement heights: the brush height can be lowered below
  the ground plane without clamping.
- Shift+mouse-move lowers the height past ground level continuously instead
  of stopping at `0`.
- The toolbar height field applies committed negative values verbatim
  instead of clamping them to `0`.
- Ghost preview, height gizmo, depth sort, occlusion, and saved world files
  work unchanged for negative heights (they are already height-sign-agnostic);
  the contact shadow stays suppressed at or below ground level.
- Documentation comment updates only: `Placement.y` (`src/runtime/world.ts`)
  and `WorldDocument.heightLevel` (`src/app/document.ts`) drop their
  `>= 0` claims.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `integrated-editor`: the **Placement height control** requirement stops
  clamping at the ground plane — shift-move lowers below ground level and
  manual input applies negative values as entered; the two clamp scenarios
  are replaced by below-ground equivalents.

## Impact

- Code: `src/app/store/world.ts` (`setHeightLevel` clamp),
  `src/app/components/WorldEditor.tsx` (`HeightInput` commit clamp),
  comment-only updates in `src/app/document.ts` and `src/runtime/world.ts`.
- Specs: delta against `openspec/specs/integrated-editor/spec.md` only.
  `world-persistence` already accepts any finite height (negatives included)
  and `runtime-sprite-rendering` occlusion is positional, so neither needs
  a delta.
- Format version: none — `isoinfinity-world/3` stores `y` as a finite
  number; negative values round-trip without a format change and old files
  (no `y`, or `y >= 0`) load as before.
- Docs: `docs/runtime.md` (world editor input description, if it mentions
  the clamp), `docs/glossary.md` line 67 ("above the ground" → signed
  offset), `docs/roadmap.md` placement-height bullet. No ADR — this relaxes
  a local editor control, not a cross-cutting invariant.
- Non-goals: no lower bound beyond finite-number validation; no changes to
  surface snap (it keeps returning the visible surface's height, ≥ 0); no
  shadow rendering for sunk placements; no per-pixel ground intersection
  masking (a sunk sprite still draws its full sprite, including the part
  "under" the ground plane); no bake-pipeline or bundle-format changes.
