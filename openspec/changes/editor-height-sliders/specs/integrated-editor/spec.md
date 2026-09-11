## MODIFIED Requirements

### Requirement: Unclamped placement height control

The world editor SHALL give the current brush a placement height that the
user adjusts in three ways:

- **Shift + mouse move**: while shift is held, vertical mouse movement
  over the viewport SHALL adjust the placement height — moving the mouse
  up raises it, moving down lowers it — in free-form (continuous) steps,
  allowed to continue below the ground plane into negative values. The
  viewport SHALL NOT pan or zoom while the height is adjusted this way,
  and ordinary hover tracking SHALL continue.
- **Manual height input**: the properties panel's Brush section SHALL offer a
  numeric placement-height field following the editor's precise-numeric-input
  conventions: committing (Enter or focus loss) SHALL apply the entered
  finite value exactly, including negative values below the ground plane;
  input that is empty or not a valid number SHALL be rejected with the
  document unchanged and the field reverting to the current height, and
  Escape SHALL cancel editing and restore the current value.
- **Height slider**: the Brush section SHALL additionally offer a slider
  spanning −2 to +2 world units alongside the numeric field, adjusting the
  same stored brush height. Dragging the slider SHALL apply the dragged
  value continuously within the slider band. The slider SHALL be a pointer
  shortcut only: the stored height SHALL NOT be clamped to the slider band,
  a value outside the band SHALL keep its exact entered value with the
  slider thumb parked at the nearer end, and dragging the thumb from that
  end SHALL pull the height back into the band. The slider SHALL follow the
  height field's edit-state rules: it never marks the document dirty, and
  while surface snap is on it SHALL be replaced together with the numeric
  field by the read-only snap display.

The placement height SHALL be per-document in-memory
editor state, defaulting to ground level for a newly opened or created
world, preserved across tab switches, and never serialized into world
files. When the surface-snap toggle is on, the height for placements and
the ghost SHALL instead come from the visible surface under the cursor:
the editor SHALL determine, from the world document's in-memory sprite
layers, the nearest-to-camera covered surface at the cursor pixel and use
that surface's height. The snapped read SHALL be exact: the top face of a
placement whose visible top surface is at world height 1 SHALL yield an
effective placement height of 1 (within bake/render numeric precision),
not a value above it — snapping onto a unit cube's top is equivalent to
entering `1` manually. Over empty ground or nothing at all the height
SHALL be ground level. While surface snap is on, the height field
SHALL display the height snap read at the current cursor position, so the
user can see the value snap picked; the display is transient feedback and
SHALL NOT overwrite the stored brush height, which applies again when snap
goes off. Surface snap SHALL override the shift-move adjustment, the
slider, and the manual input (the stored height is kept and applies again
when snap goes off). The effective height SHALL apply to every placement
the brush makes (clicks and drags alike) and to the ghost preview.
Adjusting or entering a height SHALL NOT by itself mark the document
dirty; a placement made at a non-zero height SHALL mark it dirty.

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

- **WHEN** the user types `1.5` into the Brush section's height field and
  presses Enter
- **THEN** the placement height becomes exactly `1.5` and the ghost shows it

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

#### Scenario: Slider drag adjusts the brush height

- **WHEN** the user drags the Brush section's height slider to a position
  within its band
- **THEN** the stored brush height follows the dragged value between −2
  and +2 and the ghost shows it, without marking the document dirty

#### Scenario: Typed value outside the slider band stays exact

- **WHEN** the user types `5` into the height field and commits
- **THEN** the brush height is exactly `5`, the field shows `5`, and the
  slider thumb sits parked at its +2 end

#### Scenario: Dragging the slider pulls an out-of-band value into the band

- **WHEN** the brush height is `5` (slider parked at its +2 end) and the
  user drags the slider thumb down to `1`
- **THEN** the brush height becomes `1` and follows the drag

#### Scenario: Height slider hides with the field while surface snap is on

- **WHEN** the user toggles surface snap on with a brush active
- **THEN** the Brush section replaces the height field and its slider with
  the read-only snap display, and toggling snap off restores both with the
  stored height

#### Scenario: Snap onto a unit cube's top lands at height 1

- **WHEN** surface snap is on and the cursor hovers the top face of a
  placement whose visible top surface is at world height 1
- **THEN** the effective placement height is 1 (not higher), the ghost
  sits on that surface, and clicking places the brush at height 1 —
  equivalent to typing `1` into the height field

#### Scenario: Height field shows the snapped read

- **WHEN** surface snap is on and the cursor moves over a surface at
  height 0.5 and then over empty ground
- **THEN** the height field shows the snapped height under the
  cursor (0.5, then 0), without changing the stored brush height

#### Scenario: Stored height survives a snap session

- **WHEN** the stored brush height is 2, surface snap is toggled on and
  the cursor moves over surfaces of various heights, then snap is toggled
  off
- **THEN** the height field and placements use the stored height 2 again

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

#### Scenario: Drag-painting uses the effective height

- **WHEN** the user left-drags across the viewport with a brush at a
  raised height
- **THEN** every placement made during the drag lands at the effective
  height current for its pointer position

#### Scenario: Height is per-document session state

- **WHEN** the user raises the height in one world tab, switches to
  another tab and back, then saves, closes, and reopens the world
- **THEN** the raised height is exactly as left across the tab switch,
  and the reopened world starts at ground level with no height data in
  the saved file
