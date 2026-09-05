## ADDED Requirements

### Requirement: Extra bundle views are placeable per view

When a sprite bundle is loaded into a world document — as a brush or on
world open — each view slot it stores (the north view plus any extra
E/S/W views) SHALL load as a placeable view of the same asset, provided
that view carries its own rendered pass. A view without a rendered pass
SHALL NOT be placeable: it SHALL be skipped with a status note while the
bundle's placeable views still load (the same rendered-pass rule a whole
bundle follows today). Each view SHALL keep its own baked sprite size and
origin; a `/4` or `/5` bundle (or any bundle storing only north) SHALL
load exactly as today — a single north-facing view.

#### Scenario: Multi-view bundle exposes all its directions

- **WHEN** the user picks a sprite whose `/6` bundle stores N, E, S, and W,
  all with render passes
- **THEN** the world document holds all four views of that asset and every
  direction is placeable

#### Scenario: View without a render pass is not placeable

- **WHEN** a bundle's east view has a g-buffer but no rendered pass
- **THEN** east is skipped with a status note and the remaining placeable
  views (at least north) still load

#### Scenario: Older bundles stay single-view

- **WHEN** the user picks a `/4` or `/5` bundle as a brush
- **THEN** only the north view loads and no direction control is offered
  for it

### Requirement: Placements render their direction's view

Every placement SHALL be drawn from the baked view matching its placement
direction (north by default). Occlusion and dynamic lighting SHALL use
that view's own baked g-buffer — world-space normals and depth from the
same fixed isometric camera — so a placement faces as the rotated asset
stood at bake time and stays pixel-accurately occluded exactly as if that
view were the only one. Placement direction SHALL NOT change ground
footprint picking or erase behavior: both operate on the placement's cell
as today.

#### Scenario: Placement draws its direction

- **WHEN** the user places a brush facing east
- **THEN** the placement shows the asset's east view, shaded by the
  dynamic lights exactly like any other placement

#### Scenario: Directions occlude pixel-accurately

- **WHEN** a south-facing placement interpenetrates or stands behind other
  sprites
- **THEN** its hidden pixels resolve along its south view's baked
  silhouette, the same per-pixel depth boundary a north placement gets

#### Scenario: Direction does not change picking or erase

- **WHEN** the user right-clicks a cell holding an east-facing placement
- **THEN** the eraser removes the topmost placement in that cell
  regardless of its direction
