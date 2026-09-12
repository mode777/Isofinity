# world-editor-selection Delta

## ADDED Requirements

### Requirement: Hidden layers are not pickable

Placement picking — the Select tool, the eraser, and drag interactions on
selected placements — SHALL consider only placements on visible layers. With
the sprite layer hidden, clicks SHALL pass through sprite placements as if
the space were empty; with the mesh layer hidden, the skinned character
SHALL NOT be selectable. Picking SHALL NOT itself change layer visibility,
and the layer dropdown's state SHALL NOT change what a pick returns beyond
excluding hidden layers.

A selection that exists while its layer is hidden SHALL be kept rather than
cleared, but its selection highlight SHALL NOT be drawn while the layer is
hidden; showing the layer again SHALL restore the highlight. Hiding the
ground layer changes no pick results (the ground is not a placement) —
clicks on empty space keep deselecting as before.

#### Scenario: Clicks pass through a hidden sprite layer

- **WHEN** the sprite layer is hidden and the user clicks where a sprite
  placement stands (over the ground)
- **THEN** the click does not select or erase that sprite; with the Select
  tool it deselects as if empty space were clicked

#### Scenario: Hidden character is not selectable

- **WHEN** the mesh layer is hidden and the user clicks the character with
  the Select tool
- **THEN** the character is not selected, and a click falls through to
  whatever is visible underneath (or deselects)

#### Scenario: Eraser skips hidden layers

- **WHEN** the sprite layer is hidden and the user right-clicks where a
  sprite placement stands
- **THEN** no placement is removed

#### Scenario: Selection survives hiding its layer

- **WHEN** a sprite is selected and the user hides the sprite layer, then
  shows it again
- **THEN** the selection is kept throughout, the highlight is not drawn
  while the layer is hidden, and the highlight reappears when the layer
  returns
