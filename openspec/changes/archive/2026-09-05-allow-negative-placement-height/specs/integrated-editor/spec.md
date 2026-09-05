## MODIFIED Requirements

### Requirement: Placement height feedback in the world viewport

The world viewport SHALL make off-ground heights visible without relying
on the sprites alone. While the ghost stands off the ground plane — above
or below it — the viewport SHALL draw a height gizmo for it: a landing
diamond outlining the ghost's displaced position and a plumb line
connecting it to the same ground cell, so the height is readable at a
glance. Every placement that stands above the ground plane — and a ghost
above it — SHALL also get a contact-shadow ellipse drawn on the ground at
the placement's ground position, beneath all sprites, whose size and
opacity SHALL decrease as the height increases; a placement or ghost at
or below ground level SHALL cast no ellipse. The gizmo and the shadow
ellipses SHALL be editor chrome only: drawn from data the document
already holds, tracking the viewport's zoom and pan, never serialized
into world files, and never marking the document dirty.

#### Scenario: Gizmo appears while the ghost is raised

- **WHEN** the effective ghost height is above ground level
- **THEN** the viewport draws the landing diamond at the raised ghost
  position and a plumb line down to the ground cell

#### Scenario: Gizmo appears while the ghost is below ground

- **WHEN** the effective ghost height is below ground level
- **THEN** the viewport draws the landing diamond at the sunken ghost
  position and a plumb line up to the ground cell

#### Scenario: Gizmo hidden at ground level

- **WHEN** the ghost stands at ground level
- **THEN** no gizmo is drawn

#### Scenario: Raised placements cast a contact shadow

- **WHEN** the viewport shows a placement standing above the ground plane
- **THEN** a shadow ellipse lies on the ground under it, beneath all
  sprites, and a ground-level placement shows no ellipse

#### Scenario: Below-ground placements cast no contact shadow

- **WHEN** the viewport shows a placement or ghost standing below the
  ground plane
- **THEN** no shadow ellipse is drawn for it

#### Scenario: Shadow falloff with height

- **WHEN** the same brush is placed at a low and at a high height
- **THEN** the higher placement's ellipse is smaller and fainter than the
  lower one's

#### Scenario: Feedback tracks zoom and pan

- **WHEN** the user zooms or pans the viewport while a raised ghost and
  shadow ellipses are visible
- **THEN** the gizmo and ellipses stay anchored to their world positions,
  scaling and moving with the projected image

#### Scenario: Feedback is editor chrome only

- **WHEN** the user saves a world with raised placements and inspects the
  saved file
- **THEN** the file contains the placements' heights but no gizmo or
  shadow data, and showing the feedback never turned the document dirty
  by itself

## ADDED Requirements

### Requirement: Unclamped placement height control

The world editor SHALL give the current brush a placement height that the
user adjusts in two ways:

- **Shift + mouse move**: while shift is held, vertical mouse movement
  over the viewport SHALL adjust the placement height — moving the mouse
  up raises it, moving down lowers it — in free-form (continuous) steps,
  allowed to continue below the ground plane into negative values. The
  viewport SHALL NOT pan or zoom while the height is adjusted this way,
  and ordinary hover tracking SHALL continue.
- **Manual height input**: the world toolbar SHALL offer a numeric
  placement-height field following the editor's precise-numeric-input
  conventions: committing (Enter or focus loss) SHALL apply the entered
  finite value exactly, including negative values below the ground plane;
  input that is empty or not a valid number SHALL be rejected with the
  document unchanged and the field reverting to the current height, and
  Escape SHALL cancel editing and restore the current value.

The placement height SHALL be per-document in-memory
editor state, defaulting to ground level for a newly opened or created
world, preserved across tab switches, and never serialized into world
files. When the surface-snap toggle is on, the height for placements and
the ghost SHALL instead come from the visible surface under the cursor:
the editor SHALL determine, from the world document's in-memory sprite
layers, the nearest-to-camera covered surface at the cursor pixel and
use that surface's height; over empty ground or nothing at all the
height SHALL be ground level. Surface snap SHALL override both the
shift-move adjustment and the manual input (the stored height is kept
and applies again when snap goes off). The effective height SHALL apply
to every placement the brush makes (clicks and drags alike) and to the
ghost preview. Adjusting or entering a height SHALL NOT by itself mark
the document dirty; a placement made at a non-zero height SHALL mark it
dirty.

#### Scenario: Shift-move raises the brush height

- **WHEN** the user holds shift and moves the mouse upward over the world
  viewport with a brush active
- **THEN** the effective placement height increases and the ghost (and
  its height gizmo) rises accordingly, without the viewport panning

#### Scenario: Shift-move lowers the brush below the ground

- **WHEN** the user holds shift and moves the mouse downward past ground
  level
- **THEN** the placement height continues into negative values and the
  ghost sinks below the ground plane accordingly

#### Scenario: Manual height input applies an exact value

- **WHEN** the user types `1.5` into the toolbar height field and presses
  Enter
- **THEN** the placement height becomes exactly `1.5` and the ghost shows
  it

#### Scenario: Manual height input applies negative values

- **WHEN** the user types `-2` into the height field and commits
- **THEN** the applied height is exactly `-2` and the ghost renders sunk
  below the ground plane

#### Scenario: Manual height input rejects invalid values

- **WHEN** the user clears the height field or types non-numeric text and
  commits
- **THEN** the document is unchanged and the field reverts to the current
  height

#### Scenario: Escape cancels height editing

- **WHEN** the user changes the height field's text and presses Escape
- **THEN** the document is unchanged and the field shows the current
  height again

#### Scenario: Surface snap places onto a raised surface

- **WHEN** surface snap is on and the user points the cursor at the top
  of a raised placement
- **THEN** the ghost sits on that surface's height, and clicking places
  the brush there

#### Scenario: Surface snap over empty ground stays grounded

- **WHEN** surface snap is on and the cursor is over the ground grid or
  empty space with no surface under it
- **THEN** the placement height is ground level

#### Scenario: Surface snap overrides the adjusted height

- **WHEN** the user has raised the placement height and then switches
  surface snap on
- **THEN** placements and the ghost use the surface height under the
  cursor, not the previously adjusted height

#### Scenario: Height is per-document session state

- **WHEN** the user raises the height in one world tab, switches to
  another tab and back, then saves, closes, and reopens the world
- **THEN** the raised height is exactly as left across the tab switch,
  and the reopened world starts at ground level with no height data in
  the saved file

#### Scenario: Drag-painting uses the effective height

- **WHEN** the user left-drags across the viewport with a brush at a
  raised height
- **THEN** every placement made during the drag lands at the effective
  height current for its pointer position

## REMOVED Requirements

### Requirement: Placement height control

**Reason**: Superseded by the ADDED "Unclamped placement height control"
requirement: the ground-plane clamp is gone, so shift-move lowers below
ground level and the manual field applies negative values verbatim. Its
clamp scenarios ("Shift-move never goes below the ground", "Manual height
input clamps negatives") pin behavior that no longer exists and are
dropped rather than carried into the replacement.

**Migration**: None — editor control behavior only; worlds, bundles, and
saved files are unaffected.
