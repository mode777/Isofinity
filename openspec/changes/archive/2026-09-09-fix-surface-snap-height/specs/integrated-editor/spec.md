## MODIFIED Requirements

### Requirement: Brush ghost preview

While a brush (pencil) tool is active in a world editor and the brush's
sprite layer is loaded, the viewport SHALL render that brush's sprite as
a ghost at the exact position the next placement would occupy — with the
brush's anchor point projecting exactly onto the cursor: the anchor
position SHALL be the cursor's view ray intersected with the horizontal
plane at the effective placement height (at ground level that is the
cursor's ground position; at a raised or sunken height the anchor
follows the ray so mouse and anchor stay the same 2D point) — and at the
effective placement height (the adjusted brush height, or the surface
height under the cursor when surface snap is on) — tracking the pointer
live. Placements (clicks, drags, and touch taps) SHALL land at the same
anchor position and height the ghost showed. The ghost
SHALL participate in the same per-pixel occlusion as a real placement
(depth-tested, resolved by the baked g-buffer depth), so the preview
shows exactly where the placement would interpenetrate or hide behind
nearer objects, including objects above or below the ghost's height.
Transparency is optional styling: the ghost MAY be drawn
semi-transparent or opaque. The ghost SHALL be a preview only: it SHALL
NOT affect picking or the placement list, and SHALL NOT mark the
document dirty. The ghost SHALL be hidden when the eraser is active,
when no brush is chosen, when the brush's layer is not loaded, and when
the cursor leaves the viewport — in those states the viewport SHALL fall
back to the unit-cell hover highlight (eraser) or no highlight.

#### Scenario: Ghost follows the cursor

- **WHEN** the user picks a brush and moves the mouse across the world
  viewport
- **THEN** a ghost copy of the brush's sprite moves with the cursor, its
  anchor point projecting exactly onto the pointer's 2D position

#### Scenario: Raised height keeps the anchor under the cursor

- **WHEN** the placement height is raised (manually or via surface snap)
  and the user moves the mouse across the world viewport
- **THEN** the ghost's anchor point still projects exactly onto the
  cursor — the ghost follows the cursor's ray at the height plane rather
  than staying on the ray's ground intersection

#### Scenario: Ghost reflects the effective height

- **WHEN** the user raises the placement height by moving the mouse with
  shift held, or hovers over a raised surface with surface snap on
- **THEN** the ghost renders at that height, exactly where the next
  placement would land

#### Scenario: Click places what the ghost showed

- **WHEN** the user left-clicks while the ghost is visible
- **THEN** a placement of the same brush lands exactly where the ghost
  was — same anchor position and same height — with the same per-pixel
  occlusion the ghost showed

#### Scenario: Ghost is occluded like a real placement

- **WHEN** the ghost overlaps an existing placement that would partly
  hide a real placement at that position and height
- **THEN** the ghost's hidden pixels are occluded by the same per-pixel
  depth boundary an actual placement there would get

#### Scenario: Ghost hidden for eraser and missing brush

- **WHEN** the user toggles the eraser, or picks no brush, while moving
  the mouse over the viewport
- **THEN** no ghost sprite is drawn; with the eraser the unit-cell hover
  highlight shows as before

#### Scenario: Ghost is a preview only

- **WHEN** the user moves the mouse across the viewport with a brush
  active
- **THEN** the document stays clean (no dirty mark) and no placement
  exists until an actual click or drag

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
layers, the nearest-to-camera covered surface at the cursor pixel and use
that surface's height. The snapped read SHALL be exact: the top face of a
placement whose visible top surface is at world height 1 SHALL yield an
effective placement height of 1 (within bake/render numeric precision),
not a value above it — snapping onto a unit cube's top is equivalent to
entering `1` manually. Over empty ground or nothing at all the height
SHALL be ground level. While surface snap is on, the toolbar height field
SHALL display the height snap read at the current cursor position, so the
user can see the value snap picked; the display is transient feedback and
SHALL NOT overwrite the stored brush height, which applies again when snap
goes off. Surface snap SHALL override both the shift-move adjustment and
the manual input (the stored height is kept and applies again when snap
goes off). The effective height SHALL apply to every placement the brush
makes (clicks and drags alike) and to the ghost preview. Adjusting or
entering a height SHALL NOT by itself mark the document dirty; a placement
made at a non-zero height SHALL mark it dirty.

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

#### Scenario: Snap onto a unit cube's top lands at height 1

- **WHEN** surface snap is on and the cursor hovers the top face of a
  placement whose visible top surface is at world height 1
- **THEN** the effective placement height is 1 (not higher), the ghost
  sits on that surface, and clicking places the brush at height 1 —
  equivalent to typing `1` into the height field

#### Scenario: Height field shows the snapped read

- **WHEN** surface snap is on and the cursor moves over a surface at
  height 0.5 and then over empty ground
- **THEN** the toolbar height field shows the snapped height under the
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
