## Context

See proposal.md — Why. In short: height is clamped at the ground plane in
exactly two places — `setHeightLevel` (`Math.max(0, y)`) and the toolbar
`HeightInput` commit (`Math.max(0, parsed)`) — while every downstream
consumer already treats placement height as a signed world-unit offset:

- Projection: `toPx(x, z, y)` is linear in `y` (negative y projects lower
  on screen).
- Painter sort: `depthOf` (`src/runtime/world.ts`) is linear in `y`; with
  the fixed camera looking down, a negative `y` correctly sorts as farther.
- Per-pixel occlusion: positional against the shared reference plane; no
  sign assumptions.
- Persistence: `isoinfinity-world/3` validates `y` with
  `Number.isFinite` — negatives already round-trip, and old formats
  default to `0` as before.
- Surface snap: unprojects the visible surface from the g-buffer, so it
  returns the surface's own height (≥ 0) and never a negative brush value.

The height value is per-document in-memory editor state (ADR 0006) — it
is never serialized into world files, so no persistence change is needed.

## Goals / Non-Goals

**Goals:**

- Let the brush height go below the ground plane via shift+mouse-move and
  via the toolbar field, with no artificial lower bound.
- Keep the height gizmo readable for sunken ghosts (diamond + plumb line
  connecting the displaced footprint to the ground cell).
- Keep saved worlds, old-format loading, and surface-snap behavior exactly
  as they are.

**Non-Goals:**

- No per-pixel ground-intersection masking: a sunk sprite still draws its
  whole sprite quad, including the part visually "under" the ground grid.
  Fixing that needs a depth-vs-ground composite change — out of scope.
- No shadow for at-or-below-ground placements (the existing
  `y <= GROUND_EPSILON` skip already covers this; it stays).
- No changes to the bake pipeline, bundle format, or world file format.
- No minimum-height clamp or other bounds beyond finite-number validation.

## Decisions

- **Drop the clamp entirely rather than lowering it to a fixed negative
  bound** (e.g. −5 m). Rationale: no downstream system imposes a bound,
  the file format is finite-number based, and any chosen constant would be
  arbitrary. Rejected alternative: a configurable minimum — loses to YAGNI;
  nothing in the editor or assets needs it today.
- **Accept any finite value in both input paths; keep rejecting
  empty/non-numeric input.** The store's `setHeightLevel` gains an
  `Number.isFinite` guard (mirroring the world-file parser's rule) instead
  of the ground clamp; `HeightInput` commits `parsed` verbatim. Rejected
  alternative: silently clamping only the mouse gesture (free-form
  continuous gesture feels different from typed input) — loses because two
  different rules for one value would surprise, and the spec now pins one
  behavior for both.
- **Extend the height gizmo to below-ground ghosts**
  (`ghost.y > GROUND_EPSILON` → `Math.abs(ghost.y) > GROUND_EPSILON`).
  The plumb line then runs up from the sunken landing diamond to the
  ground cell. Rationale: a sunk ghost with no gizmo is hard to aim;
  the gizmo is what makes off-ground heights readable. Rejected
  alternative: leaving the gizmo above-ground-only (strictly less
  implementation) — loses because it degrades the editor feedback exactly
  where the new feature operates, for no saved complexity.
- **Contact shadows stay above-ground-only.** `emitShadow` already returns
  for `y <= GROUND_EPSILON`; a "shadow" for a buried object is
  ill-defined without a real shadow-mapping model (see roadmap). No code
  change; spec now states it explicitly.
- **Comment-only doc updates for the data model**: `Placement.y`
  (`src/runtime/world.ts`) and `WorldDocument.heightLevel`
  (`src/app/document.ts`) drop their "≥ 0" claims; `setHeightLevel`'s doc
  comment drops "clamped to the ground plane". No API or type change —
  `y` was already `number`.

## Risks / Trade-offs

- [A sunk sprite draws over the ground grid, looking wrong at shallow
  angles] → Accepted trade-off for this change; recorded as a non-goal.
  The full fix (ground-plane depth masking in the compositor) is tracked
  for the shadow-mapping/depth work on the roadmap.
- [Users can sink sprites far below the plane and "lose" them visually]
  → The gizmo's plumb line marks the ground cell; the eraser removes by
  ground cell regardless of height, so cleanup stays one click.
- [Old saved worlds with negative heights created by hand-editing JSON]
  already load correctly today (finite-number validation); this change
  only makes producing them reachable from the UI.

## Migration Plan

None needed: no format, API, or persisted-state change. Rollback is a
plain revert.

## Open Questions

None.
