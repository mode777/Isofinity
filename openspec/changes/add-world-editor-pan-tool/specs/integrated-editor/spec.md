# integrated-editor Delta

## MODIFIED Requirements

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
- While the Space key is held, the viewport SHALL enter a temporary pan
  mode: the canvas cursor SHALL show a grab affordance (grabbing while a
  pan drag is in flight), and a left-button drag SHALL pan the viewport at
  constant zoom. While Space is held, pointer actions that would mutate
  the world SHALL be suppressed: a left press SHALL NOT place, paint,
  select, or drag-move a selection, and a right press SHALL NOT erase or
  clear the selection. A pan drag started while Space is held SHALL
  continue until the pointer is released, even if Space is released during
  the drag; only presses made while Space is up behave normally.
  When the editor's key handling is suppressed because the focus is in a
  form control, holding Space SHALL NOT enter pan mode and SHALL keep the
  control's normal text-editing behavior.
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
opened or created. Space-pan SHALL move the same transform and SHALL NOT
mark the document dirty, be undoable, or change any saved world data.

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

#### Scenario: Space-drag pans without placing or erasing

- **WHEN** the user holds Space and drags with the left mouse button
  across placed sprites while a placement brush is active
- **THEN** the viewport pans at constant zoom with the drag, no
  placement is added or erased, and the canvas cursor shows the
  grab/grabbing affordance

#### Scenario: Space suppresses select and erase actions

- **WHEN** the user holds Space while the Select tool is active and
  left-presses on a selected placement, and then right-presses on a
  placed sprite
- **THEN** no selection starts or moves, nothing is erased, and the
  view pans with the drags instead

#### Scenario: Releasing Space mid-drag completes the pan

- **WHEN** the user starts a space-pan drag and releases Space while
  still holding the left button
- **THEN** the drag continues to pan until the pointer is released, and
  only afterwards do place/paint/select/erase behaviors resume for new
  presses

#### Scenario: Space keeps text-editing behavior in form controls

- **WHEN** the focus is in an editor form control (for example a text
  input or slider field) and the user presses Space
- **THEN** the control receives the space keystroke as usual and the
  world viewport does not enter pan mode

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
