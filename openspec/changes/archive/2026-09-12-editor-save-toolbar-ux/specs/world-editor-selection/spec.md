## ADDED Requirements

### Requirement: Selected sprite can be deleted from the properties panel

When a sprite placement is selected with the Select tool, its properties
section SHALL offer, next to the Deselect control, a Delete control that
removes the placement from the world. Deleting SHALL behave like erasing
the placement with the eraser: the removal is recorded as an undoable
command and the selection is cleared. Deselect SHALL continue to leave the
placement in place.

#### Scenario: Delete removes the selected sprite

- **WHEN** a sprite placement is selected and the user activates Delete in
  its properties section
- **THEN** the placement is removed from the world and the selection is
  cleared

#### Scenario: Delete is undoable

- **WHEN** a selected sprite is deleted via the properties section and the
  user performs undo
- **THEN** the placement is restored

#### Scenario: Deselect still keeps the placement

- **WHEN** a selected sprite's Deselect control is activated
- **THEN** the selection is cleared and the placement remains in the world
