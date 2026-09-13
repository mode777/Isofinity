# integrated-editor Specification

## Purpose
The integrated Isofinity editor: one page hosting sprite (bake) and world
editing behind a shared shell — workspace connection, editor tabs over
in-memory documents, a project browser for opening and creating assets, a
context-sensitive properties panel, and a status bar.

## Requirements

### Requirement: Integrated editor shell layout

The editor SHALL render as a single page with six regions: a top bar (host
name, version, and the workspace control), a tab bar below it, a project
browser on the left, a properties panel on the right, a center editor area,
and a status bar at the bottom. The editor area SHALL show a per-editor
toolbar at the top of the active editor's content, and the toolbar SHALL
switch with the active tab's editor kind. Status messages from any region
(workspace operations, bake progress, save results, errors) SHALL appear in
the status bar. The version display SHALL show the shared build version.

#### Scenario: All regions are present

- **WHEN** the editor page loads
- **THEN** the top bar, tab bar, project browser, properties panel, editor
  area, and status bar are all visible and the version is shown in the top
  bar

#### Scenario: Bake progress lands in the status bar

- **WHEN** a path-traced render pass accumulates in a sprite editor
- **THEN** progress messages appear in the status bar, not only inside the
  editor area

#### Scenario: Toolbar switches with the active editor

- **WHEN** the user switches from a sprite tab to a world tab
- **THEN** the toolbar above the editor content changes from the sprite
  toolbar to the world toolbar

### Requirement: Opening a resource opens or focuses an editor tab

Opening a sprite resource (built-in primitive, workspace model, or sprite
bundle) SHALL open a sprite editor tab for it; opening a world resource
SHALL open a world editor tab for it. Opening a resource that already has
an open tab SHALL focus that tab instead of duplicating it. The tab bar
SHALL allow many tabs of both kinds open at once and switching between
them.

#### Scenario: Same resource focuses its existing tab

- **WHEN** the user opens `robot.sprite` from the project browser while a
  `robot.sprite` tab is already open
- **THEN** the existing tab becomes active and no second tab is created

#### Scenario: Mixed tab kinds coexist

- **WHEN** the user has a sprite tab and a world tab open and alternates
  between them
- **THEN** both tabs stay open and each activates its own editor

### Requirement: Editor documents persist in memory across tab switches

Each open tab SHALL hold its editor document in memory, independent of any
render context: a sprite document carries its source, bake settings,
environment, and baked passes; a world document carries its sprite layers,
placements, and light state. Switching tabs SHALL preserve every document
without saving; activating a tab again SHALL restore its editor view from
the stored document without re-baking or re-loading the resource. Each
document SHALL track whether it differs from its saved file (dirty state),
the tab SHALL indicate a dirty document, and closing a tab with a dirty
document SHALL ask for confirmation. Unsaved documents SHALL become clean
only when saved to the workspace (or downloaded).

#### Scenario: Unsaved bake work survives a switch

- **WHEN** the user bakes passes in a sprite tab, switches to a world tab,
  and switches back
- **THEN** the sprite tab shows the same baked passes immediately, with no
  new bake run started and no save having been required

#### Scenario: World edits survive a switch

- **WHEN** the user places sprites in a world tab, switches to a sprite
  tab, and switches back
- **THEN** the placements and light state are exactly as left

#### Scenario: Dirty tab warns on close

- **WHEN** the user closes a tab whose document has unsaved changes
- **THEN** the editor asks for confirmation before discarding them

#### Scenario: Saving clears the dirty state

- **WHEN** the user saves a dirty document to the workspace
- **THEN** the tab's dirty indicator clears

### Requirement: Editor contexts are recreated from documents

The editor SHALL keep at most one live render context per editor kind.
Activating a tab SHALL (re)create its kind's editor context from the tab's
document state; switching between tabs of the same kind SHALL replace the
context's contents from the target document. Context teardown and
recreation SHALL not leak GPU resources across switches.

#### Scenario: Same-kind switch swaps the editor contents

- **WHEN** the user switches from one sprite tab to another
- **THEN** the sprite editor now shows the second document's source,
  settings, and passes, and the first document's state is retained in its
  tab

### Requirement: Project browser lists workspace assets

The project browser SHALL present each workspace convention folder it lists —
`sprites/` (bundles), `models/` (glTF files), and `worlds/` (world JSON) — as
a collapsible tree view: nested subfolders appear as expandable nodes and
files appear as leaves at their relative path position, filtered to the
accepted file types. Activating a file entry SHALL open it (sprite bundle or
world) or start a new sprite document from it (model), regardless of the
folder depth it lives at. The browser SHALL offer the glTF import file dialog
as the workspace-less path to a new sprite document, and its new-world
action SHALL open the ground-size dialog as specified by the world-creation
requirement before creating the world. The browser SHALL NOT list built-in
test primitives; primitives reach the pipeline only as world-editor brushes.
When no workspace is connected the browser SHALL remain usable through the
import dialog and explain that workspace assets need a connection.

#### Scenario: Connected workspace lists its assets

- **WHEN** the user connects a workspace whose `sprites/` and `worlds/`
  folders hold files
- **THEN** those files appear in the project browser, filtered by type

#### Scenario: Nested folders form a tree

- **WHEN** `sprites/` contains `props/barrel.sprite`, `props/crates/crate1.sprite`,
  and `nature/oak.sprite`
- **THEN** the `sprites/` section shows expandable `props/` and `nature/`
  nodes, with `props/` containing `crate1.sprite` inside a `crates/` child node

#### Scenario: Folder expansion state is collapsible

- **WHEN** the user collapses an expanded folder node
- **THEN** its contents are hidden and sibling nodes are unaffected

#### Scenario: Model entry starts a sprite document

- **WHEN** the user activates a `.glb` file listed from `models/` (at any depth)
- **THEN** a new sprite editor tab opens with that model as its bake source

#### Scenario: Refresh picks up external changes

- **WHEN** a file is copied into `worlds/` from the operating system and
  the user refreshes the project browser
- **THEN** the new file appears in the listing

#### Scenario: No primitives are listed

- **WHEN** the user inspects the project browser, with or without a workspace
  connected
- **THEN** no built-in primitives appear and no sprite document can be started
  from a primitive in the browser

#### Scenario: Import dialog starts sprite documents without a workspace

- **WHEN** no workspace is connected and the user imports a glTF through the
  browser's import dialog
- **THEN** a sprite editor tab opens with that model as its bake source

#### Scenario: New world asks for a size

- **WHEN** the user activates the browser's new-world action
- **THEN** the ground-size dialog opens first, and accepting it creates the
  world at the chosen size


### Requirement: Resizing the ground plane from the properties panel

While a world document is active, the properties panel's Ground section
SHALL offer the ground plane's width and depth as editable world-unit
fields reflecting the document's current size. Committing values SHALL
resize the ground plane in place: the ground keeps its (0, 0) origin corner
(growing and shrinking extend toward +x/+z), the checkerboard or
ground-material quad and the fit view SHALL reflect the new size
immediately, and the document SHALL turn dirty. Resizing SHALL NOT remove
or move any placement: placements that end up outside the new bounds stay
in the scene at their positions and can be dragged back. Resizing SHALL NOT
be an undoable command (like the other ground-state edits — material and
tile scale). Input SHALL follow the panel's precise-input conventions:
commit on Enter/blur, invalid input reverts, Escape cancels. Whole units in
the range 1–128 per axis are accepted; out-of-range values clamp on commit.

#### Scenario: Growing the ground keeps placements

- **WHEN** the user changes a 12 × 12 world's width to 24
- **THEN** the ground plane extends toward +x, every existing placement
  stands at its former ground position, and the document is dirty

#### Scenario: Shrinking keeps out-of-bounds placements

- **WHEN** the user resizes a world so that placed sprites and lights lie
  outside the new ground bounds
- **THEN** those placements remain in the scene, render where they are, and
  can be selected and dragged back onto the ground

#### Scenario: Resize is immediate and not undoable

- **WHEN** the user commits a new depth and then activates Undo
- **THEN** the ground keeps the new size (undo steps back the last
  placement-level command instead), consistent with ground material and
  tile-scale edits

#### Scenario: Invalid size input reverts

- **WHEN** the user types a non-numeric value into the width field and
  commits it
- **THEN** the field reverts to the document's current width and the ground
  is unchanged
### Requirement: Creating a world at a chosen ground size

Activating the project browser's new-world action SHALL open a small dialog
before any world document is created. The dialog SHALL offer the ground
plane's width and depth as separate world-unit fields, defaulting to
12 × 12, and accept whole units in the range 1–128 per axis (out-of-range
or non-numeric values SHALL clamp to the range on accept). Accepting the
dialog SHALL create the world document with a ground plane of exactly that
size; cancelling or closing it SHALL create nothing. The chosen size SHALL
be part of the world's persisted state, not editor chrome.

#### Scenario: Dialog defaults and clamps

- **WHEN** the user opens the new-world dialog, clears the depth field,
  enters `300` for the width, and accepts
- **THEN** a world is created with a 128 × 12 ground plane (clamped to the
  range, empty depth restored to its default 12)

#### Scenario: Cancel creates nothing

- **WHEN** the user opens the new-world dialog and cancels it
- **THEN** no world tab is created and the tab bar is unchanged

#### Scenario: Created ground matches the chosen size

- **WHEN** the user accepts the dialog with width 20 and depth 8
- **THEN** the new world's ground plane spans 20 × 8 world units from its
  origin corner, and the fit view shows the whole plane
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
### Requirement: Sprite editor toolbar

A sprite editor SHALL render a toolbar above its content offering Save, the
render pass action, Bake All, and Remove view. The render pass action SHALL
first bake the raster g-buffer pass (world-space normals
+ linear ray depth) from the document's current source and settings, then
accumulate the path-traced render pass against that g-buffer, so the two
passes stay pixel-aligned and current without a separate bake action; both
passes are produced for the view slot currently selected in the viewport
(N by default), as specified by the asset-baking capability. Bake All
SHALL batch-bake all four view slots in N, E, S, W order as specified by
the asset-baking capability, switching the viewport to each slot as its
passes are produced, and SHALL be disabled for view-only documents and
while a pass accumulates. Remove view SHALL discard the baked passes of
the selected slot and SHALL be unavailable for the N slot, for slots
without baked passes, for view-only documents, and while a pass
accumulates. The render pass action SHALL be disabled for view-only
documents and while a render pass is accumulating, and its label SHALL
reflect state (Render pass, Re-render pass once a rendered pass exists,
Rendering… while busy). Progress and completion SHALL be reported through
the status bar. Save SHALL prompt for a file name, offering the document's
current name as the default; cancelling the prompt SHALL abort the save
without writing a file or clearing the dirty state. With a workspace
connected, Save SHALL write the bundle to the workspace's `sprites/`
folder under the chosen name; without a connection it SHALL fall back to
downloading the bundle.

#### Scenario: Save prompts with the current name

- **WHEN** the user activates Save in a sprite editor whose document was
  opened from `robot.sprite`
- **THEN** the prompt is prefilled with `robot` (or `robot.sprite`), and
  accepting it writes the bundle to `sprites/` under that name when a
  workspace is connected

#### Scenario: Cancelling the save prompt saves nothing

- **WHEN** the user cancels the file-name prompt
- **THEN** no file is written or downloaded and the document stays dirty

#### Scenario: Save falls back to download without a workspace

- **WHEN** the user saves a sprite document with no workspace connected
- **THEN** the bundle downloads as a `.sprite` file instead of failing

#### Scenario: No place-in-world handoff

- **WHEN** the user looks for the removed place-in-world handoff on a
  baked sprite document's toolbar
- **THEN** no Place-in-world action exists; a baked sprite reaches a world
  by saving its bundle to `sprites/` and picking it as a world brush

#### Scenario: Render action bakes the g-buffer first

- **WHEN** the user changes a model source's uniform scale and activates
  the render pass action
- **THEN** the g-buffer is re-baked at the new scale and the render pass
  accumulates against it, with both passes pixel-aligned and no separate
  bake button used

#### Scenario: Render action bakes the selected slot

- **WHEN** the user selects the E slot in the viewport and activates the
  render pass action
- **THEN** the E slot's g-buffer and render pass are produced and the
  other slots' passes are untouched

#### Scenario: Render action reflects its state

- **WHEN** a render pass is accumulating
- **THEN** the toolbar action reads "Rendering…" and is disabled until the
  pass finishes, and progress appears in the status bar

#### Scenario: View-only documents cannot render

- **WHEN** a view-only sprite tab is active
- **THEN** the toolbar's render pass action is disabled

#### Scenario: Bake All works through every slot

- **WHEN** the user activates Bake All on a document where only N is baked
- **THEN** the viewport shows each slot in turn as its passes are produced
  (N, E, S, W) and all four slots hold baked passes afterwards

#### Scenario: Remove view is unavailable for north and empty slots

- **WHEN** the N slot is selected, or the selected slot holds no baked
  passes
- **THEN** Remove view is disabled; selecting a non-N slot with baked
  passes enables it and activating it discards that slot's passes
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

### Requirement: Selecting a brush makes it placeable in the world

Selecting a brush in a world editor SHALL make that brush placeable in that
world document without leaving the editor. If the world document already
holds a matching sprite layer it SHALL be reused. A saved-sprite brush
SHALL load the sprite's bundle from the workspace into a new layer of the
world document in memory; a primitive brush SHALL bake the primitive into a
new layer with default bake settings, writing no file. Acquisition SHALL
report progress or failure through the status bar; on failure the previous
tool state SHALL be kept and nothing is placed. Acquiring a new layer SHALL
turn the world document dirty.

#### Scenario: Brush reuses an existing layer

- **WHEN** the user picks a brush whose sprite layer the world document
  already holds
- **THEN** the pencil places that layer immediately with no load or bake
  work

#### Scenario: Saved-sprite brush loads in memory

- **WHEN** the user picks a saved sprite from the Sprites group while
  connected
- **THEN** the sprite's bundle loads into the world document as a layer and
  the pencil can place it without writing any file

#### Scenario: Primitive brush bakes on demand

- **WHEN** the user picks a primitive from the Primitives group
- **THEN** the primitive bakes with default settings into the world
  document as a layer and the pencil can place it, with no bundle file
  written

#### Scenario: Missing sprite bundle is reported

- **WHEN** the user picks a saved sprite whose bundle cannot be read from
  the workspace
- **THEN** the status bar names the failure, the tool state is unchanged,
  and no placement occurs
### Requirement: Slider rows accept precise numeric input

Every numeric slider in the properties panel (world key-light and
sun-position controls, sprite bake settings and environment controls) SHALL
pair its range control with an editable numeric value field. Activating the
field SHALL show the raw numeric value for editing; committing (Enter or
focus loss) SHALL apply the entered number to the document exactly as a
slider drag would. Typing SHALL NOT be re-snapped to the slider's step grid —
typed values are precise — but committed values SHALL be clamped to the
slider's range (values below the minimum become the minimum, values above the
maximum become the maximum). Input that is empty or not a valid number SHALL
be rejected on commit: the document is unchanged and the field reverts to the
current value. Escape SHALL cancel editing, restoring the current value
without applying it. When not being edited the field SHALL show the slider's
formatted display (degrees, fixed decimals, or clock time as each slider
defines). A disabled slider SHALL disable its value field.

#### Scenario: Typing an exact value applies it

- **WHEN** the user activates the intensity slider's value field in a world
  tab, types `1.35`, and presses Enter
- **THEN** the document's light intensity becomes exactly `1.35` even though
  the slider's step is `0.05`, and the slider thumb moves to the matching
  position

#### Scenario: Out-of-range entry is clamped

- **WHEN** the user types `500` into the day-of-year field (range 1–365) and
  commits
- **THEN** the applied value is `365` and the field shows it

#### Scenario: Invalid entry is rejected

- **WHEN** the user clears the elevation field or types non-numeric text and
  commits
- **THEN** the document is unchanged and the field reverts to the current
  value

#### Scenario: Escape cancels editing

- **WHEN** the user changes the text in the azimuth field and presses Escape
- **THEN** the document is unchanged and the field shows the current azimuth
  again

#### Scenario: Formatted display when idle

- **WHEN** a time-of-day slider holds `13.5` and is not being edited
- **THEN** its field shows the formatted clock time (`13:30`), not the raw
  number

#### Scenario: Disabled sliders disable the field

- **WHEN** a view-only sprite tab shows the environment sliders
- **THEN** the value fields cannot be edited, same as the sliders

### Requirement: Only explicit bake actions bake or render

Editing a properties-panel control SHALL update the active document's
state only: no input other than the sprite editor toolbar's render pass
and Bake All actions SHALL trigger a raster bake or a path-traced render
pass. The render pass action includes its implicit raster g-buffer bake as
specified by the sprite editor toolbar requirement. Opening a resource
SHALL keep performing its initial bake. When an input makes an in-flight
render pass stale, the pass SHALL be discarded — not restarted — and the
document SHALL stay usable for an explicit re-render.

#### Scenario: Environment slider change does not render

- **WHEN** the user changes the rotation, intensity, exposure, or
  saturation on a sprite tab whose document already has a rendered pass
- **THEN** the value is stored in the document and no render pass starts

#### Scenario: HDRI load does not render

- **WHEN** the user loads an HDRI file or picks one from the workspace's
  `hdri/` listing
- **THEN** it becomes the document's active environment and no render pass
  starts

#### Scenario: Model scale change does not bake

- **WHEN** the user changes a model source's uniform scale
- **THEN** the document's scale value updates and no bake runs until the
  next render pass action, which re-bakes the g-buffer implicitly

#### Scenario: Changing an input discards an in-flight render

- **WHEN** a render pass is accumulating and the user changes a bake
  setting, environment parameter, HDRI, or preset
- **THEN** the in-flight pass is discarded, the document leaves the busy
  state, and no new pass starts

#### Scenario: Explicit buttons still bake and render

- **WHEN** the user activates the render pass action or Bake All in the
  sprite toolbar
- **THEN** the g-buffer re-bakes from the document's current source and
  settings and the path-traced render pass runs against it

### Requirement: Sprite editor viewport shows one view at a time

The sprite editor's content area SHALL be a single viewport panel that
fills the remaining editor space between the toolbar and the status bar
(within the center editor region), replacing the side-by-side pass figures.
A view-mode switcher SHALL overlay the viewport's top-right corner
offering the four views — Realtime 3D, Normals, Depth, Render — with the
active view marked; a view whose required data is unavailable SHALL be
disabled and explain why on hover. The viewport SHALL display exactly one
of the four views at a time, selected by that switcher:

- **Realtime 3D** — a real-time 3D render of the document's source
  geometry (its primitive or loaded model mesh) lit by a fixed default
  light, drawn from the bake's fixed isometric camera. It SHALL NOT be a
  shading of the baked render pass. It is available when the document has a
  bake source with resolvable geometry.
- **Normals** — the g-buffer world-normal visualization (available when a
  raster bake exists).
- **Depth** — the g-buffer ray-depth visualization (available when a raster
  bake exists).
- **Render** — the path-traced baked render pass (available when a render
  pass exists).

When the active view's data is unavailable (for example after opening a
bundle without provenance or before the first bake), the viewport SHALL
show a placeholder naming what is needed instead of a blank area. When a
render pass completes, the viewport SHALL switch to the Render view so the
fresh result is shown. View-only documents SHALL still display their baked
passes (Normals, Depth, Render).

#### Scenario: Only one view is displayed

- **WHEN** the user switches a sprite viewport from Normals to Render
- **THEN** only the baked render is displayed — the normals image is not
  shown anywhere in the editor

#### Scenario: View-mode switcher marks the active view

- **WHEN** the user activates Depth in the viewport's view switcher
- **THEN** Depth is marked active in the switcher, the viewport shows the
  depth view only, and the previously active view is no longer shown

#### Scenario: Unavailable views are disabled

- **WHEN** a sprite document has no render pass yet
- **THEN** the Render view button in the switcher is disabled with a
  tooltip explaining that the render pass must be baked first, and the
  switcher offers no bake or render action — those live in the properties
  panel

#### Scenario: Realtime 3D shows live geometry

- **WHEN** the user selects Realtime 3D on a sprite document whose source
  is a primitive or a loaded model
- **THEN** the viewport renders that source's actual mesh in real time
  under a fixed default light from the isometric bake camera, independent
  of any baked pass

#### Scenario: Render completion selects the Render view

- **WHEN** a sprite document's render pass finishes while the viewport is
  on another view (for example Realtime 3D)
- **THEN** the viewport switches to the Render view and displays the fresh
  render, without changing that view's zoom or pan

#### Scenario: Views before the first bake

- **WHEN** a new sprite document opens and its raster bake has not finished
- **THEN** the viewport shows a placeholder explaining the bake is
  required, and Realtime 3D becomes selectable as soon as the source
  geometry is available

#### Scenario: View-only bundle shows its passes

- **WHEN** the user opens a `.sprite` bundle without provenance
- **THEN** Normals, Depth, and Render remain selectable and display the
  bundle's baked passes, while Realtime 3D is disabled for lack of source
  geometry

### Requirement: Viewport pan and zoom with corner zoom controls

The sprite viewport SHALL support panning and zooming the displayed view.
Zoom controls SHALL overlay the viewport's bottom-right corner offering
zoom out, a zoom percentage readout, zoom in, and a fit action (for
example `− 75% + Fit`). The zoom percentage SHALL be relative to the
image's native pixel size (100% = one image pixel per screen pixel) and
SHALL update as zoom changes. Mouse-wheel zooming SHALL zoom around the
cursor position; dragging SHALL pan; zoom SHALL be clamped to a finite
range. The fit action SHALL restore a zoom and pan that shows the whole
image. In the Realtime 3D view the same controls SHALL zoom and pan the 3D
camera's view of the mesh.

#### Scenario: Corner controls adjust zoom

- **WHEN** the user activates zoom out until the readout shows `75%`
- **THEN** the displayed image shrinks to 75% of its native pixel size and
  the readout shows `75%`

#### Scenario: Wheel zoom centers on the cursor

- **WHEN** the user wheel-zooms in with the cursor over a detail of the
  image
- **THEN** the zoom increases and the point under the cursor stays under
  the cursor

#### Scenario: Dragging pans

- **WHEN** the user drags inside the viewport
- **THEN** the displayed view follows the drag, including beyond the panel
  edges

#### Scenario: Fit restores the whole image

- **WHEN** the user has zoomed and panned away from the image and activates
  fit
- **THEN** the whole image is visible inside the viewport again

#### Scenario: Realtime view zooms its camera

- **WHEN** the user zooms or pans while the Realtime 3D view is active
- **THEN** the mesh's rendered view zooms and pans accordingly, and the
  isometric viewing direction is unchanged

### Requirement: Sprite viewport state is per-document in-memory

The sprite viewport's view mode and zoom/pan SHALL be held per sprite
document in memory, with each view keeping its own zoom/pan — the views
use different zoom baselines (the 2D views: 100% = image-native pixels;
Realtime 3D: 100% = the framed mesh), so one shared transform would move
the framing on every switch. Switching to another tab and back SHALL
restore the view exactly as left, without re-baking. This state SHALL NOT
be written into saved bundles; reopening a sprite SHALL start at the
default view (fit zoom, first available view).

#### Scenario: View survives a tab round trip

- **WHEN** the user sets a sprite tab to the Depth view at 150% zoom,
  switches to a world tab, and switches back
- **THEN** the sprite tab shows the Depth view at 150% zoom immediately,
  with no new bake run

#### Scenario: Each view keeps its own framing

- **WHEN** the user zooms the Realtime 3D view, switches to the Normals
  view (which fits the panel), and switches back to Realtime 3D
- **THEN** the Realtime 3D view resumes exactly its previous zoom and pan,
  not the Normals view's transform

#### Scenario: View state is not saved into bundles

- **WHEN** the user saves a sprite document viewed at 400% zoom and reopens
  it later
- **THEN** the reopened sprite starts at the default view, not 400%

### Requirement: Sprite viewport bounding-box overlay

The sprite viewport SHALL offer a toggleable bounding-box overlay that
draws, on top of the active view:

- the projected edges of the asset box — the bake box the sprite was
  framed from, from the world origin `(0,0,0)` to the baked box extent;
- the world-origin marker at the sprite pixel the world origin projects
  to (the anchor world placement uses);
- the three world-axis lines (X, Y, Z) emanating from the origin, each
  distinguishable by axis.

The overlay SHALL be available in all four views — Realtime 3D, Normals,
Depth, and Render — drawing the same box semantics from the same document
data, so the box lines up with the baked passes' fixed isometric frame. It
SHALL be drawn from data the document already holds (baked box extent,
pixels-per-unit, origin pixel, fixed camera), so live bakes and opened
bundles — including view-only bundles — show it alike. The overlay SHALL
track the view's zoom and pan (it is anchored to image pixels, not the
panel). The toggle SHALL be a control in the viewport's view controls,
its state kept per sprite document in memory — persisting across view
switches and tab switches, not saved into sprite bundles.

#### Scenario: Toggle shows and hides the overlay

- **WHEN** the user activates the box toggle in the view controls
- **THEN** the box edges, origin marker, and axis lines appear over the
  active view, and deactivating the toggle removes them

#### Scenario: Overlay is consistent across views

- **WHEN** the user toggles the overlay on and switches from Render to
  Realtime 3D to Depth
- **THEN** every view shows the same projected box, origin marker, and
  axes aligned with the isometric frame, with no re-toggling needed

#### Scenario: Overlay on an opened view-only bundle

- **WHEN** the user opens a sprite bundle without provenance (view-only)
  and toggles the overlay on
- **THEN** the box, origin marker, and axes are drawn from the bundle's
  recorded box and origin pixel, aligned with its baked passes

#### Scenario: Overlay tracks zoom and pan

- **WHEN** the user zooms or pans the viewport with the overlay shown
- **THEN** the overlay stays anchored to the same image pixels, moving and
  scaling with the image

#### Scenario: Toggle state is per document

- **WHEN** the user enables the overlay on one sprite tab and switches to
  another sprite tab
- **THEN** each tab's viewport reflects its own overlay state, and
  switching back restores the first tab's enabled overlay

### Requirement: Sprite viewport human-scale reference

The sprite viewport SHALL offer a toggleable human-scale reference figure in
the Realtime 3D view: when enabled, a humanoid figure of fixed reference
height **1.8 m** (1 world unit = 1 m) SHALL stand on the ground plane beside
the asset, inside the bake's fixed isometric camera frame, so the asset's
size can be judged against a human. The figure SHALL be the editor's bundled
base mesh (`free_base_mesh.glb`), normalized at load — uniform scale to
exactly 1.8 m height, feet on the ground plane, centered over its ground
position. The toggle SHALL live in the viewport's view controls next to the
bounding-box overlay toggle.

The figure SHALL be placed at a fixed default position relative to the bake
camera frame — adjacent to the yaw-rotated asset box's camera-facing corner —
and SHALL be repositionable: with the reference enabled, the user SHALL be
able to drag the figure along the ground plane with the left mouse button.
Dragging the figure SHALL NOT pan the viewport (the drag targets the figure
when the pointer press lands on it, and pans the view otherwise), and the
figure SHALL show pointer feedback when hovered or dragged. The repositioned
ground position SHALL be kept per sprite document in memory — persisting
across view-slot switches and tab switches, never saved into sprite bundles
or world files; a document that was never dragged shows the default spot.

The reference figure SHALL be editor chrome only: it SHALL NOT participate in
any bake, SHALL NOT appear in any baked pass (g-buffer or render), and SHALL
NOT be serialized into sprite bundles or world files. Toggling or moving it
SHALL NOT mark the document dirty. The figure SHALL track the view's zoom and
pan. The toggle SHALL be available exactly when the Realtime 3D view is
available (the document has source geometry). The figure does not rotate with
the slot's model yaw.

#### Scenario: Toggle shows and hides the figure

- **WHEN** the user activates the human toggle in the view controls while the
  Realtime 3D view is active
- **THEN** a humanoid figure 1.8 m tall appears standing on the ground plane
  beside the asset, and deactivating the toggle removes it

#### Scenario: Figure shows true scale

- **WHEN** a model source is set to a height of 1.8 m via the height-in-meters
  input and the human reference is shown
- **THEN** the model's top edge aligns with the figure's head, both standing
  on the same ground plane

#### Scenario: Default spot beside the asset

- **WHEN** a document that was never dragged shows the reference
- **THEN** the figure stands just outside the yaw-rotated asset box's
  camera-facing corner, beside the asset in every view slot, and never
  rotates with the model

#### Scenario: Dragging repositions the figure

- **WHEN** the user presses the left mouse button on the figure and drags
  across the viewport
- **THEN** the figure follows the cursor along the ground plane, the viewport
  does not pan during the drag, and releasing drops the figure at that spot

#### Scenario: Pressing beside the figure still pans

- **WHEN** the user presses the left mouse button on the viewport with the
  reference enabled but not on the figure
- **THEN** the drag pans the view exactly as when the reference is hidden

#### Scenario: Dragged position persists per document

- **WHEN** the user drags the figure to a spot, switches the active view slot
  or to another sprite tab and back
- **THEN** the figure stands at the dragged spot in the first document, other
  documents are unaffected, and no bundle or world file contains the position;
  toggling or dragging did not turn the document dirty

#### Scenario: Reference never reaches baked output

- **WHEN** the user bakes a slot with the human reference shown and compares
  the resulting passes against a bake made with the reference hidden
- **THEN** the passes are identical, and a bundle saved from the document
  contains no trace of the figure

#### Scenario: Availability matches the Realtime 3D view

- **WHEN** a sprite document has no source geometry (a view-only bundle whose
  model reference does not resolve)
- **THEN** the human toggle is unavailable, same as the Realtime 3D view

#### Scenario: Figure tracks zoom and pan

- **WHEN** the user zooms or pans the Realtime 3D view with the figure shown
- **THEN** the figure scales and moves with the scene, keeping its size
  relative to the asset

### Requirement: Sprite viewport view-slot switcher

The sprite viewport SHALL show a view-slot switcher in its top-left
corner: one icon per view slot in fixed N, E, S, W order, labelled with
the slot's direction. Each icon SHALL be color-coded to show whether that
slot currently holds baked passes. Activating an icon SHALL select that
slot; the viewport SHALL then display the selected slot's stored passes in
whichever view mode (realtime/normals/depth/render) is active, and the
toolbar's per-slot actions SHALL apply to it. On editable documents an
empty slot SHALL be selectable so it can be baked; on view-only documents
only slots holding stored passes SHALL be selectable.

#### Scenario: Icon color reflects baked state

- **WHEN** a document has N and W baked and E, S empty
- **THEN** the N and W icons show the baked color and the E and S icons
  show the empty color

#### Scenario: Switching slots swaps the displayed passes

- **WHEN** the user activates the E icon on a document with baked N and E
  views while the render view mode is active
- **THEN** the viewport displays the E view's render pass without changing
  the view mode

#### Scenario: Switching marks the selection for bake actions

- **WHEN** the user activates the S icon and then the toolbar's render
  pass action
- **THEN** the S slot is baked

#### Scenario: View-only documents show stored views only

- **WHEN** a view-only document stores N and E views
- **THEN** the N and E icons are selectable and show their passes, while
  the S and W icons are not selectable

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
back to the eraser's hover highlight of the placement under the cursor
(if any) or no highlight.

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
- **THEN** no ghost sprite is drawn; with the eraser the placement under
  the cursor is highlighted with the same outline the Select tool uses
  (or nothing when no placement is under the cursor)

#### Scenario: Ghost is a preview only

- **WHEN** the user moves the mouse across the viewport with a brush
  active
- **THEN** the document stays clean (no dirty mark) and no placement
  exists until an actual click or drag

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
  stored brush height relative to its value at the start of each drag: the
  thumb SHALL rest centered (no offset), dragging SHALL apply the thumb's
  offset on top of that drag-start value continuously, and releasing the
  pointer SHALL recenter the thumb — the next drag re-anchors on the height
  current then, so repeated drags compound. The slider SHALL be a pointer
  shortcut only: it SHALL NOT clamp the stored height, typed values SHALL
  keep applying exactly regardless of the band, and the slider SHALL follow
  the height field's edit-state rules: it never marks the document dirty,
  and while surface snap is on it SHALL be replaced together with the
  numeric field by the read-only snap display.

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

#### Scenario: Slider drag adjusts the brush height relative to its value

- **WHEN** the stored brush height is 6 and the user drags the Brush
  section's height slider to its +2 end
- **THEN** the stored brush height follows the drag to exactly 8 and the
  ghost shows it, without marking the document dirty

#### Scenario: Slider recenters after release

- **WHEN** the user releases a height slider drag
- **THEN** the thumb returns to its center (no offset) and the brush
  height keeps the dragged value

#### Scenario: Repeated drags compound

- **WHEN** the brush height is 6, the user drags the slider to its +2 end
  and releases, then drags to +2 and releases again
- **THEN** the brush height is 10 after the second release

#### Scenario: Typed value outside the slider band stays exact

- **WHEN** the user types `5` into the height field and commits
- **THEN** the brush height is exactly `5`, the field shows `5`, and the
  slider stays centered with no offset

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

### Requirement: Project browser folder rows fit the panel

In the project browser's directory tree, a folder row SHALL lay out its
expand caret and the folder name side by side within the panel width. The
caret SHALL occupy a compact fixed width; it SHALL NOT stretch to the row
width. The folder name SHALL start immediately to the right of the caret,
remain visible, and truncate with an ellipsis only when the available
panel width is genuinely too narrow for the full name. This SHALL hold at
every nesting depth.

#### Scenario: Folder name stays visible next to the caret

- **WHEN** the project browser shows a folder node at any depth
- **THEN** the folder name is visible to the right of a compact caret
  button, not pushed off the panel edge

#### Scenario: Nested folders still fit

- **WHEN** the user expands several nesting levels in a section of the
  project browser
- **THEN** each level's folder names remain readable within the panel,
  indented per level, truncating only when the name exceeds the space
  left of the panel edge

#### Scenario: Other browser buttons keep full width

- **WHEN** the project browser lists a file entry or other row whose
  button is a direct child of a list item
- **THEN** that button still spans the panel width and truncates with an
  ellipsis as before

### Requirement: Point light tool in the world editor

The world editor toolbar SHALL offer a point-light placement tool alongside
the sprite and mesh tools. With the tool selected, the cursor shows a light
ghost (an editor marker sized to the light's radius, projected on the
ground at the cursor's ground position and brush height) and clicking
places a point light at that position; the eraser removes point lights
under the cursor like any placement. The tool SHALL NOT require a selected
brush asset. The light marker is editor chrome: it SHALL be drawn in the
overlay layer and SHALL NOT be serialized into world files as anything but
a point light placement (ADR 0006 — never serialize editor chrome).

#### Scenario: Placing a light from the toolbar

- **WHEN** the user selects the point-light tool and clicks in the world
- **THEN** a point light placement is created at the cursor's ground
  position and brush height, and its light immediately affects the frame

#### Scenario: Light ghost previews the radius

- **WHEN** the point-light tool hovers over the world
- **THEN** a ground-projected marker at the cursor previews the light's
  position and radius before placement

#### Scenario: Eraser removes lights

- **WHEN** the user erases where a point light stands
- **THEN** the light is removed and its contribution disappears

### Requirement: Point light properties panel

With a point light placement selected, the properties panel SHALL offer
radius (world units), energy, color (sRGB color picker, converted to linear
for the deferred pass), and position (ground position and height, with the
same slider/numeric input behavior as other placements). Changes SHALL
apply to the rendered frame immediately.

#### Scenario: Editing light properties updates the frame

- **WHEN** the user changes a selected light's radius, energy, or color
- **THEN** the deferred light pass reflects the new value on the next frame

#### Scenario: Light selection follows placement kinds

- **WHEN** the user clicks a point light with a selection-capable tool
- **THEN** the properties panel shows the light's radius, energy, color,
  and position controls

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

### Requirement: Editor toolbars use icon buttons with tooltips

The bake editor's and world editor's main toolbars SHALL use icon-only
buttons (inline SVG glyphs) with a tooltip describing each action, in a
shared visual style; the bake editor toolbar SHALL NOT use text buttons
for actions that exist as icons. The bake toolbar SHALL offer, as icon
buttons: save, save as, render pass, bake all views, and remove the
active view — each keeping its existing enable/disable conditions and
existing action. The world toolbar SHALL offer save and
save as as icon buttons, and its surface-snap toggle SHALL be an icon
button that keeps the active-state highlight while snap is on and its
existing tooltip. Tooltips remain the discoverable name of every icon
action.

#### Scenario: Bake toolbar shows icons, not text

- **WHEN** a bake editor document is open
- **THEN** its toolbar shows icon buttons for save, save as, render pass,
  bake all, and remove view, each with a tooltip naming the action

#### Scenario: Save As is available in both editors

- **WHEN** the bake editor or world editor toolbar is shown
- **THEN** it contains a save-as icon button next to the plain save
  button, and activating it opens the workspace save dialog (or the
  no-workspace fallback) instead of saving in place

#### Scenario: Snap toggle renders as an icon with active state

- **WHEN** the world editor's placement mode is active and surface snap is
  toggled on
- **THEN** the snap control renders as an icon button in the highlighted
  active state, and toggling it off removes the highlight

#### Scenario: Disabled icon buttons keep their conditions

- **WHEN** a bake document has no baked result
- **THEN** its save and save-as icon buttons are disabled, exactly as the
  previous text buttons were



### Requirement: World editor viewport layer visibility

A world editor SHALL show a layer control docked inside the world viewport's
**top-right** corner — the mirror image of the top-left tool bar — styled
like the other viewport corner panels (the tool bar, the bottom-right zoom
cluster). The control SHALL show a stacked-layers icon button with a tooltip
naming it; activating the button SHALL toggle a dropdown listing one
checkable row per world layer — **Ground**, **Sprites**, **Meshes** — each
row showing the layer's name and its current visibility state, with the
dropdown closing on an outside click, on re-activating the button, or on
Escape.

Activating a row SHALL toggle that layer's visibility with immediate effect
in the viewport. Hiding a layer SHALL remove it from the rendered world:
hiding the ground layer SHALL remove the ground surface and the contact
shadows cast onto it; hiding the sprite layer SHALL remove the sprite
instances and their baked grounding shadows; hiding the mesh layer SHALL
remove mesh draws (the skinned character) and their grounding shadows.
Showing a layer again SHALL restore it unchanged. Point lights and their
icons are not part of these layers and SHALL stay visible regardless of
layer state.

While a layer is hidden, its placements SHALL NOT participate in the world's
interactive surface: hidden placements SHALL supply no surface-snap heights,
so placement height falls back to the remaining visible surface (or to the
manual placement height when no surface is visible under the cursor).

Layer visibility SHALL be per-document in-memory editor state, like the
active tool: it SHALL never be serialized into world files, SHALL NOT mark
the document dirty, SHALL NOT appear on the undo/redo stack, SHALL default
to all layers visible for new and opened worlds, and SHALL survive tab
switches within the session. The control SHALL overlay the viewport without
affecting the view transform: interacting with it SHALL NOT pan, zoom,
place, erase, or pick, and canvas interaction outside it SHALL behave
exactly as before.

#### Scenario: Layer control sits in the top-right corner

- **WHEN** the user activates a world editor tab
- **THEN** the viewport's top-right corner shows a stacked-layers icon
  button styled like the other corner panels, with a tooltip naming it, and
  all three layers start visible

#### Scenario: Dropdown lists the three layers

- **WHEN** the user clicks the layer button
- **THEN** a dropdown opens listing checkable rows for Ground, Sprites, and
  Meshes, each showing its layer's current visibility state

#### Scenario: Toggling a layer takes effect immediately

- **WHEN** the user unchecks the Sprites row
- **THEN** all sprite placements and their baked grounding shadows vanish
  from the viewport at once, without any save, bake, or dialog, and
  re-checking the row restores them exactly as they were

#### Scenario: Hiding the ground removes contact shadows

- **WHEN** the user unchecks the Ground row
- **THEN** the ground surface and the contact shadows cast onto it
  disappear while sprites and meshes remain visible

#### Scenario: Lights stay visible regardless of layers

- **WHEN** the user hides every layer via the dropdown
- **THEN** placed point lights and their clickable icons remain visible and
  functional

#### Scenario: Surface snap ignores hidden layers

- **WHEN** surface snap is on, the sprite layer is hidden, and the user
  places a brush over where a hidden sprite stands
- **THEN** the placement height does not snap to the hidden sprite's
  surface but to the remaining visible surface (or the manual placement
  height when nothing is visible there)

#### Scenario: Visibility is transient in-memory state

- **WHEN** the user hides the mesh layer, switches to another tab and back,
  undoes and redoes a world edit, saves the world, and reopens it
- **THEN** the mesh layer is still hidden after the tab round-trip, the
  undo/redo steps do not touch layer visibility, and the saved world file
  contains no visibility state so the reopened world shows all layers

#### Scenario: The layer control does not eat canvas input

- **WHEN** the user clicks or drags on the viewport outside the layer
  control (including its open dropdown)
- **THEN** the click behaves exactly as it would with the control hidden —
  no pan, zoom, place, erase, pick, or dropdown toggle occurs


### Requirement: Key-light controls are clamped to the allowed shadow domain

The world editor's key-light direction controls (azimuth and elevation) and
the sun-position controls SHALL present and apply only directions inside the
shadow-valid domain defined by the runtime-directional-shadows capability.
Values outside the domain SHALL be clamped to the nearest valid direction
rather than rejected, and the sun-position computation's output SHALL be
clamped by the same rule, so a computed dawn, dusk, or night direction never
leaves the domain. The controls SHALL display the applied (clamped) direction.

#### Scenario: Sun position clamps into the domain

- **WHEN** the computed sun direction for a chosen time, date, and latitude
  falls outside the allowed angle or below the elevation floor
- **THEN** the applied key-light direction is clamped to the nearest valid
  direction and the azimuth/elevation fields display the clamped values

#### Scenario: Typed direction clamps rather than rejects

- **WHEN** the user types an azimuth or elevation value outside the allowed
  domain and commits
- **THEN** the document's light direction is the clamped value and the field
  shows it, consistent with the existing numeric-input clamp behavior

#### Scenario: Valid directions pass through unchanged

- **WHEN** the user sets a direction already inside the domain
- **THEN** the document and the controls use exactly that direction
