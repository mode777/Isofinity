## MODIFIED Requirements

### Requirement: Placements render their direction's view

Every placement SHALL be drawn from the baked view matching its placement
direction (north by default). Occlusion and dynamic lighting SHALL use
that view's own baked g-buffer — world-space normals and depth from the
same fixed isometric camera — so a placement faces as the rotated asset
stood at bake time and stays pixel-accurately occluded exactly as if that
view were the only one. Each view's sprite SHALL be drawn so that the
view's recorded origin anchor lands at the placement's projected position,
and the placement's ground position SHALL be exactly the cursor's ground
position at placement time — placement is free-form, with no cell offset:
the full 3D anchor point (the view's anchor, at the placement height) lands
exactly at the mouse position that placed it, in every direction. The
placement ghost SHALL be drawn at the same point so the preview matches
the landed placement exactly. A bundle without a recorded custom origin
anchors at its box min corner and SHALL render exactly as before this
change. Placement direction SHALL NOT change ground footprint picking or
erase behavior: both operate on the placement's ground footprint as today.

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

- **WHEN** the user right-clicks a spot holding an east-facing placement
- **THEN** the eraser removes the topmost placement under the cursor
  regardless of its direction

#### Scenario: Custom anchor lands at the placement point

- **WHEN** the user places an asset with the mouse at a ground position
  and a brush height of 0, and the asset's baked origin sits at its ground
  plane (for example its ground-plane center)
- **THEN** the anchor's ground point lands exactly at the mouse's ground
  position — no half-cell offset — and the ghost shown while dragging
  matches the landed placement exactly

#### Scenario: Brush height raises the anchor above the cursor's ground point

- **WHEN** the user places an asset with the brush height at 1 unit and
  the asset's baked origin sits at its ground plane
- **THEN** the anchor point lands exactly 1 unit above the mouse's ground
  position — as if the mouse cursor were hovering 1 unit above the ground —
  so the sprite stands one unit up with the anchor still on the cursor's
  ground track

#### Scenario: The anchor's height is always the brush height

- **WHEN** the user places any asset at any brush height
- **THEN** the anchor point's world height equals the brush height and its
  ground track equals the mouse's ground position, so the asset's base
  rides at (brush height − anchor y): a ground-anchored asset's base sits
  at the brush height, and an asset whose anchor y equals the brush height
  stands with its base on the ground

#### Scenario: Raised anchor sinks the asset accordingly

- **WHEN** the user places at ground level an asset whose baked origin sits
  one unit above the ground (for example a hook on a hanging sign)
- **THEN** the anchor point lands at the mouse's ground position, so
  the asset stands one unit lower than an identical asset anchored at its
  base

#### Scenario: Negative brush height sinks the anchor below the ground

- **WHEN** the user places an asset with a negative brush height
- **THEN** the anchor point lands exactly at the mouse's ground position at
  that height, so the asset hangs or sinks relative to the cursor by the
  anchor's own height offset regardless of the anchor's position in the
  asset

#### Scenario: Switching direction pivots around the anchor

- **WHEN** the user switches a placed asset's direction
- **THEN** the anchor point stays at the placement's ground position and
  the asset pivots around it

#### Scenario: Legacy sprites render unchanged

- **WHEN** the user places a sprite whose bundle records no custom origin
- **THEN** it draws with its box min corner exactly at the mouse's ground
  position and height
