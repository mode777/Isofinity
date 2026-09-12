## MODIFIED Requirements

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
switch) and the sun-position controls. While the terrain paint tool is active
the panel SHALL show a **Paint** section with the brush radius, the brush
hardness, and the four material slots (each slot offering the workspace's
`.material` zips, plus the active slot the brush paints). The panel SHALL NOT
duplicate the per-editor toolbar's actions (save, place-in-world, and render
pass live in the sprite editor toolbar; save, undo, and redo live in the world
editor toolbar; placement tool selection lives in the world viewport's tool
bar). Editing a control SHALL update the active document only.

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

#### Scenario: Paint section appears only with the paint tool

- **WHEN** the user activates the terrain paint tool in a world editor tab
- **THEN** the properties panel shows the Paint section (brush radius, brush
  hardness, and the material slots with the active one marked), and switching
  to another tool hides it

#### Scenario: Controls are per document

- **WHEN** the user changes the environment rotation in one sprite tab and
  switches to another sprite tab
- **THEN** the second tab's properties show its own environment settings,
  unchanged by the first tab's edit

### Requirement: World editor viewport tool bar

A world editor SHALL render a thin vertical tool bar docked inside the world
viewport, Photoshop-style, offering one button per tool: Select, pencil
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
- **THEN** a thin vertical bar inside the viewport shows the Select, pencil,
  point-light, terrain-paint, and eraser tools as icon buttons, with the active
  tool highlighted and each button's tooltip naming its tool

#### Scenario: Activating a tool

- **WHEN** the user clicks the eraser button in the tool bar
- **THEN** the eraser becomes the active tool (clicks remove the picked
  placement), the highlight moves to the eraser button, and no dialog or
  mode other than the tool switch occurs

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
