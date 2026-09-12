# world-edit-history Specification

## Purpose

Lets users take back and re-apply world editing operations (sprite, mesh and
point-light placements and edits) through undo/redo, per world document,
without touching the saved world file format.

## Requirements

### Requirement: Undo reverts the last world edit

The world editor SHALL support undo that reverts the most recent mutating
world operation for the active world document. Mutating operations include:
placing a sprite, erasing (remove-top), placing a mesh, placing a point
light, updating a point light's properties, and deleting a point light.
After an undo, the world's visible state (placements, lights, sort order)
MUST be identical to its state before the reverted operation.

#### Scenario: Undo a sprite placement

- **WHEN** the user places a sprite into a world document and undoes
- **THEN** the sprite is no longer in the world and the scene renders as before the placement

#### Scenario: Undo an erase

- **WHEN** the user erases a placement and undoes
- **THEN** the erased placement returns with the same asset, position, height, direction and shadow strength

#### Scenario: Undo a light edit

- **WHEN** the user changes a point light's properties (or deletes it) and undoes
- **THEN** the light's previous properties (or its existence) are restored exactly

### Requirement: Redo re-applies an undone world edit

The world editor SHALL support redo that re-applies the most recently undone
operation. Redo MUST be invalidated (the redo stack cleared) whenever a new
mutating operation is recorded after an undo.

#### Scenario: Redo after undo

- **WHEN** the user undoes a placement and then redoes
- **THEN** the placement is re-applied with the same parameters

#### Scenario: New edit clears redo

- **WHEN** the user undoes an operation and then performs a new placement
- **THEN** redo is unavailable until another undo makes an undone operation current again

### Requirement: History is per document and survives tab switches

Undo history SHALL be kept per world document. Switching to another tab and
back SHALL preserve the document's undo/redo state. Documents persist in
memory across switches (existing editor behavior), and the history rides the
document.

#### Scenario: History survives a tab switch

- **WHEN** the user places a sprite in world A, switches to world B, switches back to A, and undoes
- **THEN** world A's placement is undone and world B's history is unaffected

### Requirement: History is never serialized into world files

Undo history SHALL be in-memory editor state only (ADR 0006). World files
MUST NOT gain new fields for history, and the world file format version is
unchanged; old files load unchanged and files saved before/after undo use
are byte-compatible in schema.

#### Scenario: Undo does not affect the saved file

- **WHEN** the user saves a world, performs edits and undoes them
- **THEN** no history data is written anywhere and a fresh load of the saved file matches the saved scene

### Requirement: Undo/redo marks the document dirty

Undo and redo SHALL mark the affected world document dirty so the dirty-tab
close warning and save-state indicator stay accurate after taking back or
re-applying edits to a saved document.

#### Scenario: Undo after save marks dirty

- **WHEN** the user saves a world, places a sprite, saves again, then undoes the placement
- **THEN** the document is reported dirty again

### Requirement: Undo/redo controls and shortcuts

The world editor SHALL surface undo and redo as toolbar buttons, disabled
respectively when there is nothing to undo and nothing to redo, and SHALL
support keyboard shortcuts: Ctrl/Cmd+Z for undo and Ctrl/Cmd+Shift+Z (and
Ctrl/Cmd+Y) for redo, active only when a world document is focused.

#### Scenario: Buttons reflect history state

- **WHEN** a freshly opened world document is shown
- **THEN** both undo and redo buttons are disabled; after one placement undo is enabled and redo is not

#### Scenario: Shortcut undo on a focused world tab

- **WHEN** the user presses Ctrl+Z while a world document is the active tab
- **THEN** the last world edit is undone
