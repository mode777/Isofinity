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
- The tool bar's dedicated pan tool SHALL pan the same way while it is
  the active tool: a left-button drag (and a single-finger touch drag)
  SHALL pan at constant zoom with the same grab/grabbing cursor, and
  presses that would mutate the world SHALL be refused while the pan tool
  is selected — a left press SHALL NOT place, paint, select, or move, and
  a right press SHALL NOT erase or clear the selection (a pan-tool tap
  SHALL do nothing). The pan tool SHALL be mutually exclusive with the
  placing, painting, and selecting tools like any other tool; switching
  to another tool SHALL restore that tool's normal press behavior.
  Holding Space SHALL pan the same way with any active tool, the pan tool
  included.
- On touch screens, a three-finger drag SHALL pan the viewport at
  constant zoom without placing or erasing; a single finger SHALL keep
  the pointer's place/paint behavior (tap places, drag paints) — except
  under the pan tool, whose single-finger drag pans — and two
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
opened or created. Space-pan and the pan tool SHALL move the same
transform and SHALL NOT mark the document dirty, be undoable, or change
any saved world data; the active tool (pan tool included) is per-document
in-memory editor state and never serialized either.

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

#### Scenario: Pan tool pans without mutating

- **WHEN** the user selects the pan tool and left-drags, right-clicks,
  and left-clicks across placed sprites
- **THEN** the drags pan the view at constant zoom with the
  grab/grabbing cursor, and nothing places, erases, selects, or
  deselects

#### Scenario: Switching away from the pan tool restores press behavior

- **WHEN** the user switches from the pan tool back to a placement brush
- **THEN** left-click/drag places again and right-click erases, with no
  leftover pan-mode suppression

#### Scenario: Pan tool single-finger touch drag pans

- **WHEN** the user selects the pan tool on a touch screen and drags one
  finger across the viewport (releasing without a drag as a tap)
- **THEN** the finger drag pans the view, the tap does nothing, and with
  any other tool the single-finger tap/drag behavior is unchanged

#### Scenario: Three-finger touch drag pans without placing

- **WHEN** the user drags three fingers across the world viewport on a
  touch screen
- **THEN** the viewport pans with the fingers and no placement is added
  or erased

#### Scenario: Single-finger touch keeps the painting behavior

- **WHEN** the user taps, or drags one finger across, the world viewport
  on a touch screen with a placement brush active
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

### Requirement: World editor viewport tool bar

A world editor SHALL render a thin vertical tool bar docked inside the world
viewport, Photoshop-style, offering one button per tool: Select, pan, pencil
(placement), point light, terrain paint, and eraser. Each button SHALL show an
icon instead of a text label, with a tooltip naming the tool (and its behavior
hint), and the active tool's button SHALL be visually highlighted. Activating a
tool button SHALL switch the editor to that tool with the same semantics the
previous toolbar text buttons had (the pencil restores the last chosen brush).
The tool bar SHALL overlay the viewport without affecting the view transform:
hovering or clicking it SHALL NOT pan, zoom, place, erase, paint, or pick, and
canvas interaction outside the bar SHALL behave exactly as before. The active
tool SHALL be per-document in-memory editor state — it SHALL never be
serialized into world files.

#### Scenario: Tools are offered as icons

- **WHEN** the user activates a world editor tab
- **THEN** a thin vertical bar inside the viewport shows the Select, pan,
  pencil, point-light, terrain-paint, and eraser tools as icon buttons, with
  the active tool highlighted and each button's tooltip naming its tool

#### Scenario: Activating a tool

- **WHEN** the user clicks the eraser button in the tool bar
- **THEN** the eraser becomes the active tool (clicks remove the picked
  placement), the highlight moves to the eraser button, and no dialog or
  mode other than the tool switch occurs

#### Scenario: Activating the pan tool

- **WHEN** the user clicks the pan button in the tool bar
- **THEN** the pan tool becomes active (drags pan the view, mutating
  presses are refused), the highlight moves to the pan button, and no
  dialog or mode other than the tool switch occurs

#### Scenario: Activating the terrain paint tool

- **WHEN** the user clicks the terrain paint button in the tool bar
- **THEN** the terrain paint tool becomes active, the Paint section appears in
  the properties panel, and left-dragging over the ground paints the active
  material slot

#### Scenario: Pencil restores the last brush

- **WHEN** the user had a sprite brush chosen, switches to the Select tool,
  and then clicks the pencil button in the tool bar
- **THEN** the pencil tool is active again with that same brush chosen

#### Scenario: The tool bar does not eat canvas input

- **WHEN** the user clicks or drags on the viewport outside the tool bar
- **THEN** the tool bar neither places nor erases nor paints nor pans, and the
  click behaves exactly as it would with the bar hidden
