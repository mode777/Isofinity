# runtime-mesh-rendering Delta

## MODIFIED Requirements

### Requirement: Character brush behaves like a sprite brush

The character SHALL be placeable and erasable through the existing
placement tools: a depth-tested ghost previews the animated character at
the cursor before placing, the contact shadow follows placement height,
raised placements work as for sprites, erase removes the placement picked
under the cursor (the same pixel-accurate pick the Select tool uses:
g-buffer silhouette and depth for sprites, screen-space proximity for the
character and point lights), whatever its kind, and surface snap computes
the landing height from sprite g-buffers exactly as it does for sprite
brushes.

#### Scenario: Ghost preview occlusion

- **WHEN** a character brush hovers over the world among placed sprites
- **THEN** the ghost shows the character per-pixel occluded exactly as the
  placement would sit

#### Scenario: Erase resolves topmost

- **WHEN** the eraser is used where a character and sprites overlap
- **THEN** the placement under the cursor is removed, whatever its kind,
  exactly as the Select tool would pick it

#### Scenario: Surface snap onto sprites

- **WHEN** surface snap is enabled and the character brush hovers over a
  sprite surface
- **THEN** the character lands at the height the sprite surface under the
  cursor implies, identical to the sprite brush behavior
