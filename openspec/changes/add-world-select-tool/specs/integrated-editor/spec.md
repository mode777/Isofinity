# integrated-editor Delta

## MODIFIED Requirements

### Requirement: World editor toolbar

A world editor SHALL render a toolbar above its content offering Save, undo and
redo controls, a pencil placement tool, a brush dropdown, an eraser toggle, a
point-light placement tool, a Select tool, and a surface-snap toggle.

Save SHALL prompt for a file name, defaulting to the world's saved name or the
next free `world-N`, and SHALL write the world to the workspace's `worlds/`
folder under the chosen name when a workspace is connected; cancelling SHALL
abort without writing or clearing the dirty state.

The pencil tool SHALL be the active placement tool by default; the brush it
places is chosen from a dropdown grouped into **Primitives** (the built-in test
primitives) and **Sprites** (the workspace's saved sprite bundles, listed when a
workspace is connected). Clicking or dragging on the world canvas with the
pencil places the chosen brush at the pointed cell; the eraser toggle (and the
right mouse button) removes placements. The point-light tool places point lights
as specified by the point-light tool requirement. The Select tool selects and
moves placements as specified by the world-editor-selection capability.

The surface-snap toggle SHALL control whether placements take their height from
the visible surface under the cursor (on) or from the user-adjusted placement
height (off), as specified by the placement-height requirement. The brush's
placement height, grounding-shadow strength, and direction SHALL be edited in
the properties panel's Brush section (see the properties-panel requirement),
not in the toolbar; both the surface-snap toggle and the Brush section values
SHALL be per-document in-memory editor state. The toolbar SHALL replace the
previous per-layer tool strip.

#### Scenario: World toolbar offers save, pencil, and brush dropdown

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar shows Save, a pencil tool marked active, a brush
  dropdown whose groups list the built-in primitives and the workspace's saved
  sprites, and a Select tool

#### Scenario: Surface-snap toggle and height field are available

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar shows a surface-snap toggle that can be switched on and
  off and it persists across tab switches within the session, while the
  placement-height field lives in the properties panel's Brush section

#### Scenario: Brush properties live in the panel

- **WHEN** the user activates a world editor tab with a brush chosen
- **THEN** the toolbar shows no numeric height field and no direction control,
  and the properties panel's Brush section offers the placement height,
  grounding-shadow strength, and (for a multi-view sprite) the direction

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

#### Scenario: Select tool is available

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar offers a Select tool alongside the pencil, eraser, and
  point-light tools

### Requirement: Brush direction selection

A world editor SHALL let the user choose which way the current brush faces when
the brush is a sprite baked with more than one placeable view slot (N/E/S/W). A
direction control in the properties panel's Brush section SHALL list the active
brush's available directions in N, E, S, W order and SHALL be enabled only while
the active brush is a multi-view sprite; for single-view sprites and primitives
it SHALL be disabled (or hidden) and the brush faces north. Picking a direction
SHALL make subsequent placements face that way, and the ghost preview SHALL show
the brush as that direction's view. Pressing the `E` key (without modifier keys)
in the world editor SHALL cycle the brush through its available directions in
N → E → S → W order, wrapping around and skipping directions the sprite does not
provide; for a single-view brush or while a text field, select, or other form
control has keyboard focus it SHALL do nothing. The chosen brush direction SHALL
be per-document in-memory editor state: it SHALL never by itself mark the
document dirty nor reach a saved file — a placement's direction is persisted
only when placed, as specified by world persistence. Already-placed sprites
SHALL keep their direction; the eraser SHALL stay direction-independent.

#### Scenario: Multi-view brush offers its directions

- **WHEN** the user picks a sprite whose bundle stores north, east, and west
  views with render passes
- **THEN** the direction control in the Brush section lists N, E, and W with
  east currently placeable, and picking W makes the next placement face west

#### Scenario: Ghost reflects the chosen direction

- **WHEN** the user switches the brush direction while the ghost preview is
  visible
- **THEN** the ghost immediately shows the brush as the newly chosen
  direction's view, occluded as that view would be placed

#### Scenario: E key cycles through available directions

- **WHEN** the user presses `E` with a north/east/west brush active
- **THEN** the brush direction advances N → E → W → N, skipping the absent
  south view, and the Brush section's direction control reflects it

#### Scenario: E key wraps around

- **WHEN** the user presses `E` while the brush faces its last available
  direction
- **THEN** the brush wraps to its first available direction (north when
  provided)

#### Scenario: Single-view brush has no direction choice

- **WHEN** the active brush is a primitive or a single-view sprite and the user
  opens the direction control or presses `E`
- **THEN** the control is disabled (or absent) and pressing `E` changes nothing

#### Scenario: E key does not fight text entry

- **WHEN** the user presses `E` while typing in the placement-height field
- **THEN** the letter is entered into the field and the brush direction is
  unchanged

#### Scenario: Placed sprites keep their direction

- **WHEN** the user changes the brush direction after placing sprites
- **THEN** the already-placed sprites still face their original directions

### Requirement: Properties panel follows the active editor

The properties panel SHALL show controls matching the active tab's editor kind.
For a sprite editor it SHALL show — in order — the preset management section
(save-as-preset, the preset listing, delete, and file import) at the top before
any rendering settings, the document's source information, model scale (when the
source is a model), path-trace bake settings, and the environment controls
(load/rotate/intensity/exposure/saturation). The panel SHALL NOT offer bake or
render actions: the raster g-buffer bake is implicit in the render pass action,
and the render pass action lives in the sprite editor toolbar. For a world
editor it SHALL show a **Brush** section (the active brush's placement height,
grounding-shadow strength, and direction), a **selected-placement** section when
the Select tool holds a selection (the selected sprite's or character's ground
position and height, and for a sprite its grounding-shadow strength; for a
selected point light, the light properties — radius, energy, color, and
position), and the key light controls (azimuth, elevation, intensity, color,
ambient color, dynamic-light switch) and the sun-position controls. The panel
SHALL NOT duplicate the per-editor toolbar's actions (save, place-in-world,
render pass, undo/redo, and placement tool selection live in the toolbar).
Editing a control SHALL update the active document only.

#### Scenario: Sprite tab shows bake properties

- **WHEN** the user activates a sprite editor tab
- **THEN** the properties panel shows the preset management section first,
  followed by the bake settings and environment controls, and no save/export,
  bake, or render buttons

#### Scenario: No AO pass action exists

- **WHEN** the user activates a sprite editor tab
- **THEN** the properties panel offers no ambient-occlusion pass action and
  no AO samples/radius controls

#### Scenario: No raster bake or render buttons in the panel

- **WHEN** the user activates a sprite editor tab
- **THEN** the panel offers no raster bake button and no render pass button;
  the only render action is the sprite editor toolbar's

#### Scenario: World tab shows brush and selected-placement properties

- **WHEN** the user activates a world editor tab and selects a sprite with the
  Select tool
- **THEN** the properties panel shows the Brush section and a section for the
  selected sprite's position, height, and grounding-shadow strength, alongside
  the key light and sun-position controls

#### Scenario: World tab shows light properties

- **WHEN** the user activates a world editor tab and selects a point light
- **THEN** the properties panel shows the light's radius, energy, color, and
  position controls, and no save button or world name field

#### Scenario: Controls are per document

- **WHEN** the user changes the environment rotation in one sprite tab and
  switches to another sprite tab
- **THEN** the second tab's properties show its own environment settings,
  unchanged by the first tab's edit

### Requirement: Unclamped placement height control

The world editor SHALL give the current brush a placement height that the
user adjusts in two ways:

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
