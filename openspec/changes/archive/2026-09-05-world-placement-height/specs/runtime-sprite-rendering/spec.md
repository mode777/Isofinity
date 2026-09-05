# runtime-sprite-rendering Delta

## MODIFIED Requirements

### Requirement: Per-pixel occlusion stays g-buffer driven

Per-pixel occlusion between sprites SHALL not depend on shading: depth
comes from the baked g-buffer, and sprite coverage for fragment discard
comes from g-buffer emptiness (the hard raster coverage of the same bake
draw) — never from the antialiased alpha of the render pass. Every placed
sprite instance SHALL add its placement's world offset — ground position
and height — to the baked g-buffer depth in the shared global reference
frame, so occlusion and interpenetration stay pixel-accurate at any
height: a raised sprite occludes exactly along its baked silhouette
against the ground and against other placements, whether stacked, sunk
into, or beside them. Cursor placement and erase keep using ground-
footprint picking; erase SHALL remove the placement with the greatest
depth key — the topmost — among the placements whose ground footprint
contains the cursor.

#### Scenario: Interpenetrating sprites resolve pixel-accurately

- **WHEN** two sprites overlap in depth
- **THEN** the per-pixel occlusion boundary between them follows the baked
  g-buffer depth

#### Scenario: Stacked sprites resolve pixel-accurately

- **WHEN** a sprite is placed at a height above another sprite's ground
  position so their silhouettes overlap on screen
- **THEN** the per-pixel occlusion boundary between them follows the baked
  g-buffer depth with the raised placement's offset applied, and the
  raised sprite's pixels hide the underlying sprite exactly where its own
  g-buffer is opaque

#### Scenario: Partial render-pass alpha never drops fragments

- **WHEN** a sprite pixel lies inside the baked g-buffer coverage but its
  render-pass alpha is partial (antialiased edge)
- **THEN** the fragment is still rendered and blends with the partial alpha
  rather than being discarded

#### Scenario: Erase removes the topmost placement

- **WHEN** two placements' ground footprints both contain the cursor and
  one stands higher than the other
- **THEN** erasing removes the higher placement first, and a repeat erase
  removes the lower one
