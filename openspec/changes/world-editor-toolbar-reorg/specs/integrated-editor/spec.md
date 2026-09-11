# integrated-editor Delta

## MODIFIED Requirements

### Requirement: World editor toolbar

A world editor SHALL render a toolbar above its content offering, as icon
buttons (icons instead of text labels), Save, undo, and redo; the active
tool's contextual controls; and a short hint naming the active tool. The
global actions (Save, undo, redo) SHALL be visually separated from the
tool-contextual controls (for example by a divider between the groups).

Save SHALL prompt for a file name, defaulting to the world's saved name or
the next free `world-N`, and SHALL write the world to the workspace's
`worlds/` folder under the chosen name when a workspace is connected;
cancelling SHALL abort without writing or clearing the dirty state. The
undo/redo buttons SHALL undo and redo the document's world edits as
specified by the world-edit-history capability, and SHALL be disabled when
there is nothing to undo (or redo).

The tool-contextual controls are the brush dropdown and the surface-snap
toggle, and they SHALL be visible only while a placement (pencil) tool is
active — including when no brush is chosen yet. With the Select, eraser, or
point-light tool active they SHALL be hidden. Hiding them SHALL NOT change
their stored state: the chosen brush and the snap toggle's on/off state are
per-document in-memory editor state and SHALL apply again when a placement
tool is reactivated.

The pencil tool SHALL be the active placement tool by default; it is
activated from the world viewport's tool bar (see the world-editor tool bar
requirement). The brush it places is chosen from a dropdown grouped into
**Primitives** (the built-in test primitives) and **Sprites** (the
workspace's saved sprite bundles, listed when a workspace is connected).
Clicking or dragging on the world canvas with the pencil places the chosen
brush at the pointed cell; the right mouse button removes placements. The
surface-snap toggle SHALL control whether placements take their height from
the visible surface under the cursor (on) or from the user-adjusted
placement height (off), as specified by the placement-height requirement.
The brush's placement height, grounding-shadow strength, and direction
SHALL be edited in the properties panel's Brush section (see the
properties-panel requirement), not in the toolbar. The toolbar SHALL NOT
host tool selection: the Select, pencil, point-light, and eraser tools live
in the world viewport's tool bar.

#### Scenario: World toolbar offers save, pencil, and brush dropdown

- **WHEN** the user activates a world editor tab with the pencil tool active
- **THEN** the toolbar shows Save, undo, and redo as icon buttons separated
  by a divider from the brush dropdown and surface-snap toggle, the tool bar
  in the viewport marks the pencil active, and the brush dropdown's groups
  list the built-in primitives and the workspace's saved sprites

#### Scenario: Contextual controls appear only in placement mode

- **WHEN** the user switches to the Select, eraser, or point-light tool
- **THEN** the brush dropdown and the surface-snap toggle are hidden from
  the toolbar, and switch back to a placement tool shows them again

#### Scenario: Surface-snap toggle and height field are available

- **WHEN** the user activates a world editor tab with a placement tool
  active
- **THEN** the toolbar shows a surface-snap toggle that can be switched on
  and off and it persists across tab switches within the session, the
  placement-height field lives in the properties panel's Brush section, and
  with the Select, eraser, or point-light tool active the toggle is hidden
  while keeping its state

#### Scenario: Contextual state survives tool switches

- **WHEN** surface snap is on and a brush chosen, the user switches to the
  eraser and back to the pencil tool
- **THEN** surface snap is still on and the same brush is still chosen,
  without the user re-picking either

#### Scenario: Brush properties live in the panel

- **WHEN** the user activates a world editor tab with a brush chosen
- **THEN** the toolbar shows no numeric height field and no direction
  control, and the properties panel's Brush section offers the placement
  height, grounding-shadow strength, and (for a multi-view sprite) the
  direction

#### Scenario: Select tool is available

- **WHEN** the user activates a world editor tab
- **THEN** the viewport's tool bar offers a Select tool alongside the
  pencil, eraser, and point-light tools

#### Scenario: Saving prompts with a sensible default

- **WHEN** the user activates Save in an unsaved world editor
- **THEN** the prompt offers the first free `world-N` name, and accepting
  writes `worlds/<name>.json` when connected

#### Scenario: Pencil places the selected brush

- **WHEN** the user picks a brush and clicks a cell with the pencil active
- **THEN** an instance of that brush appears at the cell and the world tab
  turns dirty

#### Scenario: Eraser remains available

- **WHEN** the user activates the eraser from the tool bar and clicks a
  placed sprite, or right-clicks a placed sprite with any tool active
- **THEN** that placement is removed

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
grounding-shadow strength, and direction) only while the placement brush tool is
active, a **selected-placement** section only while the Select tool is active
with a selection (the selected sprite's or character's ground position and
height, and for a sprite its grounding-shadow strength and, when the asset has
more than one placeable direction, a facing control; for a selected point light,
the light properties — radius, energy, color, and position), and the key light
controls (azimuth, elevation, intensity, color, ambient color, dynamic-light
switch) and the sun-position controls. The panel SHALL NOT duplicate the
per-editor toolbar's actions (save, place-in-world, and render pass live in the
sprite editor toolbar; save, undo, and redo live in the world editor toolbar;
placement tool selection lives in the world viewport's tool bar). Editing a
control SHALL update the active document only.

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

#### Scenario: Brush section appears only with the brush tool

- **WHEN** the user activates a world editor tab and picks a placement brush
- **THEN** the properties panel shows the Brush section (height, shadow, and
  direction), and switching to the Select, eraser, or point-light tool hides it

#### Scenario: Selected sprite controls appear only with the Select tool

- **WHEN** the user selects a sprite with the Select tool
- **THEN** the panel shows that sprite's position, height, grounding-shadow
  strength, and (for a multi-view asset) its facing control, and switching to
  another tool hides the sprite section while keeping the selection

#### Scenario: World tab shows light properties

- **WHEN** the user activates a world editor tab and selects a point light
- **THEN** the properties panel shows the light's radius, energy, color, and
  position controls, and no save button or world name field

#### Scenario: Controls are per document

- **WHEN** the user changes the environment rotation in one sprite tab and
  switches to another sprite tab
- **THEN** the second tab's properties show its own environment settings,
  unchanged by the first tab's edit

## ADDED Requirements

### Requirement: World editor viewport tool bar

A world editor SHALL render a thin vertical tool bar docked inside the world
viewport, Photoshop-style, offering one button per tool: Select, pencil
(placement), point light, and eraser. Each button SHALL show an icon instead
of a text label, with a tooltip naming the tool (and its behavior hint), and
the active tool's button SHALL be visually highlighted. Activating a tool
button SHALL switch the editor to that tool with the same semantics the
previous toolbar text buttons had (the pencil restores the last chosen
brush). The tool bar SHALL overlay the viewport without affecting the view
transform: hovering or clicking it SHALL NOT pan, zoom, place, erase, or
pick, and canvas interaction outside the bar SHALL behave exactly as before.
The active tool SHALL be per-document in-memory editor state — it SHALL
never be serialized into world files.

#### Scenario: Tools are offered as icons

- **WHEN** the user activates a world editor tab
- **THEN** a thin vertical bar inside the viewport shows the Select, pencil,
  point-light, and eraser tools as icon buttons, with the active tool
  highlighted and each button's tooltip naming its tool

#### Scenario: Activating a tool

- **WHEN** the user clicks the eraser button in the tool bar
- **THEN** the eraser becomes the active tool (clicks remove the picked
  placement), the highlight moves to the eraser button, and no dialog or
  mode other than the tool switch occurs

#### Scenario: Pencil restores the last brush

- **WHEN** the user had a sprite brush chosen, switches to the Select tool,
  and then clicks the pencil button in the tool bar
- **THEN** the pencil tool is active again with that same brush chosen

#### Scenario: The tool bar does not eat canvas input

- **WHEN** the user clicks or drags on the viewport outside the tool bar
- **THEN** the tool bar neither places nor erases nor pans, and the click
  behaves exactly as it would with the bar hidden

### Requirement: Compact world editor chrome

The world editor SHALL use the center area's full extent for its content:
a world tab's editor SHALL fill the center region without the generic
center-area padding (as a sprite tab already does), and the editor's own
chrome spacing — the editor's padding, the toolbar's margins, and the gaps
between toolbar, viewport, and hint line — SHALL stay small so the world
viewport remains the dominant surface of the panel.

#### Scenario: World editor is full-bleed

- **WHEN** a world tab is active
- **THEN** the world editor's content spans the center region edge-to-edge
  with only a thin inset, rather than sitting inside the generic
  document padding

#### Scenario: Sprite and world tabs use comparable space

- **WHEN** the user switches between a sprite tab and a world tab
- **THEN** both editors present their viewport with the same full-bleed
  treatment, and neither loses space to extra chrome margins
