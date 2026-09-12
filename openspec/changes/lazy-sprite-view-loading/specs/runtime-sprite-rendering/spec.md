## MODIFIED Requirements

### Requirement: Extra bundle views are placeable per view

When a sprite bundle is loaded into a world document — as a brush or on
world open — its north view SHALL be decoded and validated at load, and
each extra view slot it stores (E/S/W) SHALL be registered as a pending
direction of the same asset and resolved on first use: the first time a
placement direction, brush direction, or direction switch selects that
slot, the runtime SHALL decode the view's g-buffer and rendered pass and
make it placeable, provided that view carries its own rendered pass and
its decoded g-buffer depth lies within the manifest's recorded depth
range (compared with a small half-precision epsilon). Depth outside the
range — negative depth in particular, the signature of a view-slot pass
baked against a rotated camera instead of the fixed one — makes the view
unplaceable: the slot SHALL be skipped with a named status note naming
the slot and the stale-depth cause (a re-bake of the sprite fixes it) and
the direction SHALL fall back to north. A view without a rendered pass
SHALL likewise not be placeable: it SHALL be skipped with a status note
on first use and the direction SHALL fall back to north. The north view
failing the load-time check SHALL fail the whole bundle load with a named
error, as a missing rendered pass does. Each view SHALL keep its own
baked sprite size and origin; a `/4` or `/5` bundle (or any bundle
storing only north) SHALL load exactly as today — a single north-facing
view. Resolving a slot SHALL only decode that slot's passes; the passes
of unused slots SHALL NOT be inflated or decoded.

#### Scenario: Multi-view bundle exposes all its directions

- **WHEN** the user picks a sprite whose `/6` bundle stores N, E, S, and W,
  all with render passes and in-range depth
- **THEN** the world document opens with the north view immediately and
  each of E, S, and W becomes placeable when first selected, with every
  direction placeable once resolved

#### Scenario: Only requested views are decoded

- **WHEN** a multi-view bundle is loaded and only the north direction is
  ever used
- **THEN** the extra views' g-buffer and render passes are never inflated
  or decoded

#### Scenario: View without a render pass is not placeable

- **WHEN** a bundle's east view has a g-buffer but no rendered pass
- **THEN** selecting east skips it with a status note, falls back to
  north, and the remaining placeable views (at least north) still load

#### Scenario: Stale-depth view is not placeable

- **WHEN** a bundle's east view carries a render pass but its decoded
  g-buffer contains negative depth values (outside the manifest's
  recorded depth range)
- **THEN** selecting east skips it with a named status note identifying
  the slot and the stale-depth cause, falls back to north, and the
  remaining placeable views (at least north) still load

#### Scenario: Stale-depth north fails the load

- **WHEN** a bundle's north view decodes with depth outside its recorded
  range
- **THEN** the bundle load fails with a named error and no view of that
  asset is placed

#### Scenario: Older bundles stay single-view

- **WHEN** the user picks a `/4` or `/5` bundle as a brush
- **THEN** only the north view loads and no direction control is offered
  for it

## ADDED Requirements

### Requirement: Resolved sprite views are cached per source bundle

A sprite view decoded for a world document SHALL be cached in memory
against its source workspace file for the session, so re-opening a world
or re-picking a brush that references the same file reuses the decoded
view data rather than reading, inflating, and decoding it again. The
cache SHALL be invalidated when the source file's identity changes
(size or last-modified). The cache SHALL be in-memory editor state only
and SHALL NOT be serialized into worlds, bundles, or any persisted
format.

#### Scenario: Re-picking a loaded sprite does not decode again

- **WHEN** the user picks a sprite brush whose bundle was already loaded
  earlier in the session
- **THEN** the brush becomes available without reading or decoding the
  bundle again

#### Scenario: Re-opening a world reuses decoded views

- **WHEN** the user re-opens a world whose sprites were decoded earlier
  in the session and whose files are unchanged
- **THEN** the referenced views are served from the cache instead of the
  bundle files

#### Scenario: Editing a bundle invalidates its cached views

- **WHEN** a cached bundle file is replaced (its size or last-modified
  time changes) and loaded again
- **THEN** the runtime decodes the new bundle and does not serve stale
  view data
