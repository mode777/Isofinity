## MODIFIED Requirements

### Requirement: Placements render their direction's view

Every placement SHALL be drawn from the baked view matching its placement
direction (north by default). Occlusion and dynamic lighting SHALL use
that view's own baked g-buffer — world-space normals and depth from the
same fixed isometric camera — so a placement faces as the rotated asset
stood at bake time and stays pixel-accurately occluded exactly as if that
view were the only one. Each view's sprite SHALL be drawn so that the
view's recorded origin anchor lands at the placement's projected position
— the same point where the sprite's box min corner lands today: the
placement's ground position at its height — so the authored anchor, not
the box corner, is the handle that lands where the user places, in every
direction. A bundle without a recorded custom origin anchors at its box
min corner and SHALL render exactly as before this change. Placement
direction SHALL NOT change ground footprint picking or erase behavior:
both operate on the placement's cell as today.

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

#### Scenario: Custom anchor lands at the placement point

- **WHEN** the user places an asset whose baked origin is its ground-plane
  center at a cell and ground level
- **THEN** the asset's ground center lands at that cell's min corner (the
  anchor spot where the box corner lands today), and switching the
  placement's direction keeps the anchor at that spot with the asset
  pivoting around it

#### Scenario: Raised anchor sinks the asset accordingly

- **WHEN** the user places at ground level an asset whose baked origin sits
  one unit above the ground (for example a hook on a hanging sign)
- **THEN** the anchor point lands at the placement's ground position, so
  the asset stands one unit lower than an identical asset anchored at its
  base

#### Scenario: Legacy sprites render unchanged

- **WHEN** the user places a sprite whose bundle records no custom origin
- **THEN** it draws exactly as before the origin anchor existed, with its
  box min corner at the placement's position
