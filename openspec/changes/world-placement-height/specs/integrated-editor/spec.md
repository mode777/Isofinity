# integrated-editor Delta

## MODIFIED Requirements

### Requirement: World editor toolbar

A world editor SHALL render a toolbar above its content offering Save, a
pencil placement tool, an eraser toggle, a surface-snap toggle, and a
numeric placement-height field. Save
SHALL prompt for a file name, defaulting to the world's saved name or the
next free `world-N`, and SHALL write the world to the workspace's `worlds/`
folder under the chosen name when a workspace is connected; cancelling
SHALL abort without writing or clearing the dirty state. The pencil tool
SHALL be the active placement tool by default; the brush it places is
chosen from a dropdown grouped into **Primitives** (the built-in test
primitives) and **Sprites** (the workspace's saved sprite bundles, listed
when a workspace is connected). Clicking or dragging on the world canvas
with the pencil places the chosen brush at the pointed cell; the eraser
toggle (and the right mouse button) removes placements. The surface-snap
toggle SHALL control whether placements take their height from the visible
surface under the cursor (on) or from the user-adjusted placement height
(off), as specified by the placement-height requirement; the height field
edits that adjusted height as specified there; both SHALL be per-document
in-memory editor state. The toolbar SHALL replace the
previous per-layer tool strip.

#### Scenario: World toolbar offers save, pencil, and brush dropdown

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar shows Save, a pencil tool marked active, and a brush
  dropdown whose groups list the built-in primitives and the workspace's
  saved sprites

#### Scenario: Surface-snap toggle and height field are available

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar shows a surface-snap toggle that can be switched on
  and off and a numeric height field showing the current placement height,
  and both persist across tab switches within the session

#### Scenario: Saving prompts with a sensible default

- **WHEN** the user activates Save in an unsaved world editor
- **THEN** the prompt offers the first free `world-N` name, and accepting
  writes `worlds/<name>.json` when connected

#### Scenario: Pencil places the selected brush

- **WHEN** the user picks a brush and clicks a cell with the pencil active
- **THEN** an instance of that brush appears at the cell and the world tab
  turns dirty

#### Scenario: Eraser remains available

- **WHEN** the user toggles the eraser and clicks a placed sprite, or
  right-clicks a placed sprite with the pencil active
- **THEN** that placement is removed

### Requirement: World editor viewport zoom and pan

The world editor viewport SHALL fill the editor area and support zooming
and panning with the sprite editor's established viewport conventions:

- An unmodified wheel event SHALL pan the viewport at constant zoom by the
  scroll delta (the trackpad's two-finger scroll, or a mouse wheel); a
  pinch gesture (ctrl-modified wheel) SHALL zoom around the cursor
  position, within the shared zoom bounds; zooming SHALL NOT move the
  world point under the cursor.
- Middle-mouse drag SHALL pan the viewport at constant zoom; the left
  button SHALL keep painting placements and the right button SHALL keep
  erasing.
- On touch screens, a three-finger drag SHALL pan the viewport at
  constant zoom without placing or erasing; a single finger SHALL keep
  the pointer's place/paint behavior (tap places, drag paints); two
  fingers SHALL be a neutral pre-gesture that neither paints nor pans.
  Trackpad three-finger gestures are consumed by the operating system
  and never reach the browser, so they are explicitly out of scope.
- Corner zoom controls (zoom out, a percentage readout, zoom in, and a
  fit action) SHALL overlay the viewport. Zoom actions SHALL anchor at
  the panel center; fit SHALL restore the default view that shows the
  whole grid letterboxed in the panel.

The zoom/pan SHALL be a 2D view transform of the fixed projected image:
the fixed isometric camera, projection constants, and the projected
scene layout SHALL NOT change — every zoom level shows the same
projected world, scaled and offset. Pointer picking (placement and
erase) SHALL invert the same transform, so the ground position under the
cursor — and therefore where a placement lands — SHALL be identical at
every zoom and pan offset. The transform SHALL be per-document in-memory
editor state: preserved across tab switches and view recreations,
never serialized into world files, defaulting to fit when a world is
opened or created.

#### Scenario: Pinch zoom keeps the cursor anchored

- **WHEN** the user pinches (trackpad pinch / ctrl+wheel) over the world
  viewport while pointing at a placed sprite
- **THEN** the viewport zooms around the cursor and the world point
  under the cursor stays under it

#### Scenario: Two-finger scroll pans the viewport

- **WHEN** the user two-finger scrolls (or rolls the mouse wheel) over
  the world viewport
- **THEN** the viewport pans with the scroll delta and no placement is
  added or erased

#### Scenario: Middle-drag pans without placing or erasing

- **WHEN** the user drags with the middle mouse button across placed
  sprites
- **THEN** the viewport pans with the drag and no placement is added or
  erased

#### Scenario: Three-finger touch drag pans without placing

- **WHEN** the user drags three fingers across the world viewport on a
  touch screen
- **THEN** the viewport pans with the fingers and no placement is added
  or erased

#### Scenario: Single-finger touch keeps the painting behavior

- **WHEN** the user taps, or drags one finger across, the world viewport
  on a touch screen
- **THEN** a tap places the selected brush at the point and a drag
  paints, exactly as a mouse click/drag does

#### Scenario: Zoom controls mirror the sprite editor

- **WHEN** the user activates the corner zoom controls
- **THEN** zoom out, the percentage readout, and zoom in work as in the
  sprite viewport, and the fit action restores the whole-grid default
  view

#### Scenario: Picking stays accurate at any zoom

- **WHEN** the user zooms in and clicks on a ground point
- **THEN** the placement lands at the same world position that point had
  before zooming

#### Scenario: View transform is per-document in-memory state

- **WHEN** the user zooms a world tab, switches to another tab, and
  switches back
- **THEN** the zoom/pan is exactly as left; after saving, closing, and
  reopening the world, the viewport opens at the default fit view and
  the saved world file contains no view-transform data

### Requirement: Brush ghost preview

While a brush (pencil) tool is active in a world editor and the brush's
sprite layer is loaded, the viewport SHALL render that brush's sprite as
a ghost at the exact position the next placement would occupy — centered
on the cursor's ground position and at the effective placement height
(the adjusted brush height, or the surface height under the cursor when
surface snap is on) — tracking the pointer live. The ghost
SHALL participate in the same per-pixel occlusion as a real placement
(depth-tested, resolved by the baked g-buffer depth), so the preview
shows exactly where the placement would interpenetrate or hide behind
nearer objects, including objects above or below the ghost's height.
Transparency is optional styling: the ghost MAY be drawn
semi-transparent or opaque. The ghost SHALL be a preview only: it SHALL
NOT affect picking or the placement list, and SHALL NOT mark the
document dirty. Activating a placement (left-click or left-drag) SHALL
keep the existing behavior. The ghost SHALL be hidden when the eraser is
active,
when no brush is chosen, when the brush's layer is not loaded, and when
the cursor leaves the viewport — in those states the viewport SHALL fall
back to the unit-cell hover highlight (eraser) or no highlight.

#### Scenario: Ghost follows the cursor

- **WHEN** the user picks a brush and moves the mouse across the world
  viewport
- **THEN** a ghost copy of the brush's sprite moves with the cursor,
  centered on the pointer's ground position as a placement would be

#### Scenario: Ghost reflects the effective height

- **WHEN** the user raises the placement height by moving the mouse with
  shift held, or hovers over a raised surface with surface snap on
- **THEN** the ghost renders at that height above the cursor's ground
  position, exactly where the next placement would land

#### Scenario: Click places what the ghost showed

- **WHEN** the user left-clicks while the ghost is visible
- **THEN** a placement of the same brush lands exactly where the ghost
  was — same ground position and same height — with the same per-pixel
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

## ADDED Requirements

### Requirement: Placement height control

The world editor SHALL give the current brush a placement height that the
user adjusts in two ways:

- **Shift + mouse move**: while shift is held, vertical mouse movement
  over the viewport SHALL adjust the placement height — moving the mouse
  up raises it, moving down lowers it — in free-form (continuous) steps,
  clamped so the height never goes below the ground plane. The viewport
  SHALL NOT pan or zoom while the height is adjusted this way, and
  ordinary hover tracking SHALL continue.
- **Manual height input**: the world toolbar SHALL offer a numeric
  placement-height field following the editor's precise-numeric-input
  conventions: committing (Enter or focus loss) SHALL apply the entered
  value, committed values SHALL be clamped to ≥ 0, input that is empty or
  not a valid number SHALL be rejected with the document unchanged and
  the field reverting to the current height, and Escape SHALL cancel
  editing and restore the current value.

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

#### Scenario: Shift-move never goes below the ground

- **WHEN** the user holds shift and moves the mouse downward past ground
  level
- **THEN** the placement height clamps at ground level and the ghost sits
  on the ground

#### Scenario: Manual height input applies an exact value

- **WHEN** the user types `1.5` into the toolbar height field and presses
  Enter
- **THEN** the placement height becomes exactly `1.5` and the ghost shows
  it

#### Scenario: Manual height input clamps negatives

- **WHEN** the user types `-2` into the height field and commits
- **THEN** the applied height is `0` (ground level)

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

### Requirement: Placement height feedback in the world viewport

The world viewport SHALL make raised heights visible without relying on
the sprites alone. While the ghost stands above the ground plane, the
viewport SHALL draw a height gizmo for it: a landing diamond outlining
the ghost's raised position and a plumb line dropping from it to the
same ground cell, so the height is readable at a glance. Every placement
that stands above the ground plane — and a ghost above it — SHALL also
get a contact-shadow ellipse drawn on the ground at the placement's
ground position, beneath all sprites, whose size and opacity SHALL
decrease as the height increases; a ground-level placement SHALL cast no
ellipse. The gizmo and the shadow ellipses SHALL be editor chrome only:
drawn from data the document already holds, tracking the viewport's zoom
and pan, never serialized into world files, and never marking the
document dirty.

#### Scenario: Gizmo appears while the ghost is raised

- **WHEN** the effective ghost height is above ground level
- **THEN** the viewport draws the landing diamond at the raised ghost
  position and a plumb line down to the ground cell

#### Scenario: Gizmo hidden at ground level

- **WHEN** the ghost stands at ground level
- **THEN** no gizmo is drawn

#### Scenario: Raised placements cast a contact shadow

- **WHEN** the viewport shows a placement standing above the ground plane
- **THEN** a shadow ellipse lies on the ground under it, beneath all
  sprites, and a ground-level placement shows no ellipse

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
