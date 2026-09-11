## ADDED Requirements

### Requirement: Point lights show a clickable, draggable icon

Every placed point light SHALL be marked in the world viewport by a small
editor-chrome icon drawn at the light's projected emitter point. The icon
SHALL be visible whenever the world document is open, regardless of the
active tool, and SHALL have a constant on-screen size that tracks the
viewport's zoom and pan with the world image (editor chrome anchored to the
world position, like the selection highlight). The icon SHALL be tinted with
the light's sRGB color so distinct lights are distinguishable; a selected or
hovered light's icon SHALL keep the same treatment as its selection
highlight (the light's radius ring).

Clicking within the icon's hit area — the same small screen-space tolerance
around the projected emitter the existing light pick uses — SHALL select that
light wherever the existing pick already selects lights (the Select tool; the
point-light tool's click-near-a-light behavior). Dragging a light by its icon
with the Select tool SHALL move the light along the ground plane exactly as
dragging the selected light does (live move; one undoable move command on
release). When the cursor rests within an icon's hit area with the Select
tool or the point-light tool active, the light's radius ring SHALL be shown
as hover feedback.

The icons SHALL be overlay chrome: they SHALL NOT be serialized into world
files, showing them SHALL NOT mark the document dirty, and they SHALL NOT
affect the rendered scene, the bake pipeline, or the light's deferred-light
contribution. Icons SHALL NOT consume clicks from placement brushes: with a
brush tool active, clicking on an icon SHALL place the brush as if the icon
were not there.

#### Scenario: Every placed light shows its icon

- **WHEN** a world contains two point lights of different colors and no
  placement is selected
- **THEN** each light shows a small icon at its emitter point, tinted with
  that light's color, in every tool mode

#### Scenario: Icon tracks zoom and pan

- **WHEN** the user zooms or pans the world viewport
- **THEN** each light icon stays anchored to its light's emitter point in the
  world image and keeps the same on-screen size

#### Scenario: Clicking an icon selects the light

- **WHEN** the user clicks on a light's icon with the Select tool
- **THEN** that light becomes the selected placement and its radius ring
  highlight appears

#### Scenario: Dragging an icon moves the light

- **WHEN** the user drags a light's icon with the Select tool and releases
- **THEN** the light follows the cursor during the drag and the move is one
  undoable command; undo returns the light to its pre-drag position

#### Scenario: Hovering an icon previews the radius ring

- **WHEN** the cursor rests within a light icon's hit area with the Select
  tool or the point-light tool active
- **THEN** the light's radius ring is shown while the cursor stays there

#### Scenario: Icons are chrome, not content

- **WHEN** the user selects a light, saves the world, and inspects the file
- **THEN** the file contains the light's placement data but no icon data, and
  selecting or hovering the icon did not mark the document dirty

#### Scenario: Brush clicks pass through icons

- **WHEN** a placement brush is active and the user clicks on a light icon
- **THEN** the brush places at that spot as usual and the light is not
  selected
