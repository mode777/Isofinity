## MODIFIED Requirements

### Requirement: Extra bundle views are placeable per view

When a sprite bundle is loaded into a world document — as a brush or on
world open — each view slot it stores (the north view plus any extra
E/S/W views) SHALL load as a placeable view of the same asset, provided
that view carries its own rendered pass and its decoded g-buffer depth
lies within the manifest's recorded depth range (compared with a small
half-precision epsilon). Depth outside the range — negative depth in
particular, the signature of a view-slot pass baked against a rotated
camera instead of the fixed one — makes the view unplaceable: an extra
view SHALL be skipped with a named status note naming the slot and the
stale-depth cause (a re-bake of the sprite fixes it), while the bundle's
placeable views still load; the north view failing the check SHALL fail
the whole bundle load with a named error, as a missing rendered pass
does. A view without a rendered pass SHALL NOT be placeable: it SHALL be
skipped with a status note while the bundle's placeable views still load
(the same rendered-pass rule a whole bundle follows today). Each view
SHALL keep its own baked sprite size and origin; a `/4` or `/5` bundle
(or any bundle storing only north) SHALL load exactly as today — a
single north-facing view.

#### Scenario: Multi-view bundle exposes all its directions

- **WHEN** the user picks a sprite whose `/6` bundle stores N, E, S, and W,
  all with render passes and in-range depth
- **THEN** the world document holds all four views of that asset and every
  direction is placeable

#### Scenario: View without a render pass is not placeable

- **WHEN** a bundle's east view has a g-buffer but no rendered pass
- **THEN** east is skipped with a status note and the remaining placeable
  views (at least north) still load

#### Scenario: Stale-depth view is not placeable

- **WHEN** a bundle's east view carries a render pass but its decoded
  g-buffer contains negative depth values (outside the manifest's
  recorded depth range)
- **THEN** east is skipped with a named status note identifying the slot
  and the stale-depth cause, and the remaining placeable views (at least
  north) still load

#### Scenario: Stale-depth north fails the load

- **WHEN** a bundle's north view decodes with depth outside its recorded
  range
- **THEN** the bundle load fails with a named error and no view of that
  asset is placed

#### Scenario: Older bundles stay single-view

- **WHEN** the user picks a `/4` or `/5` bundle as a brush
- **THEN** only the north view loads and no direction control is offered
  for it
