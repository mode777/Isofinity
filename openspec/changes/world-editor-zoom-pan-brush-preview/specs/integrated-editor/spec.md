## ADDED Requirements

### Requirement: World editor viewport zoom and pan

The world editor viewport SHALL fill the editor area and support zooming
and panning with the sprite editor's established viewport conventions:

- Mouse wheel SHALL zoom around the cursor position, within the shared
  zoom bounds; zooming SHALL NOT move the world point under the cursor.
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

#### Scenario: Wheel zoom keeps the cursor anchored

- **WHEN** the user rolls the mouse wheel over the world viewport while
  pointing at a placed sprite
- **THEN** the viewport zooms in around the cursor and the world point
  under the cursor stays under it

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
on the cursor's ground position — tracking the pointer live. The ghost
SHALL participate in the same per-pixel occlusion as a real placement
(depth-tested, resolved by the baked g-buffer depth), so the preview
shows exactly where the placement would interpenetrate or hide behind
nearer objects. Transparency is optional styling: the ghost MAY be drawn
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

#### Scenario: Click places what the ghost showed

- **WHEN** the user left-clicks while the ghost is visible
- **THEN** a placement of the same brush lands exactly where the ghost
  was, with the same per-pixel occlusion the ghost showed

#### Scenario: Ghost is occluded like a real placement

- **WHEN** the ghost overlaps an existing placement that would partly
  hide a real placement at that position
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
