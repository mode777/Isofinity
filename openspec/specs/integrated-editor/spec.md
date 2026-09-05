# integrated-editor Specification

## Purpose
The integrated Isofinity editor: one page hosting sprite (bake) and world
editing behind a shared shell — workspace connection, editor tabs over
in-memory documents, a project browser for opening and creating assets, a
context-sensitive properties panel, and a status bar.

## Requirements

### Requirement: Integrated editor shell layout

The editor SHALL render as a single page with five regions: a top bar (host
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

The project browser SHALL list the workspace's convention folders — `sprites/`
(bundles), `models/` (glTF files), and `worlds/` (world JSON) — filtered to the
accepted file types, with a refresh action re-reading the folders. Activating a
listing entry SHALL open it (sprite bundle or world) or start a new sprite
document from it (model). The browser SHALL offer the glTF import file dialog as
the workspace-less path to a new sprite document and a new empty world action.
The browser SHALL NOT list built-in test primitives; primitives reach the
pipeline only as world-editor brushes. When no workspace is connected the
browser SHALL remain usable through the import dialog and explain that
workspace assets need a connection.

#### Scenario: Connected workspace lists its assets

- **WHEN** the user connects a workspace whose `sprites/` and `worlds/`
  folders hold files
- **THEN** those files appear in the project browser, filtered by type

#### Scenario: Model entry starts a sprite document

- **WHEN** the user activates a `.glb` file listed from `models/`
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
### Requirement: Properties panel follows the active editor

The properties panel SHALL show controls matching the active tab's editor
kind. For a sprite editor it SHALL show — in order — the preset management
section (save-as-preset, the preset listing, delete, and file import) at the
top before any rendering settings, the document's source information, model
scale (when the source is a model), path-trace bake settings, and the
environment controls (load/rotate/intensity/exposure/saturation). The panel
SHALL NOT offer bake or render actions: the raster g-buffer bake is implicit
in the render pass action, and the render pass action lives in the sprite
editor toolbar. For a world editor it SHALL show the key light controls
(azimuth, elevation, intensity, color, ambient color, dynamic-light switch)
and the sun-position controls. The panel SHALL NOT duplicate the per-editor
toolbar's actions (save, place-in-world, render pass, and placement tool
selection live in the toolbar). Editing a control SHALL update the active
document only.

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

#### Scenario: World tab shows light properties

- **WHEN** the user activates a world editor tab
- **THEN** the properties panel shows the key light and sun-position
  controls, and no save button or world name field

#### Scenario: Controls are per document

- **WHEN** the user changes the environment rotation in one sprite tab and
  switches to another sprite tab
- **THEN** the second tab's properties show its own environment settings,
  unchanged by the first tab's edit
### Requirement: Place a baked sprite into a world document

From a sprite editor whose document holds baked passes (including a
rendered pass), the user SHALL be able to place the sprite into a world
document: the sprite's passes become a sprite layer of the target world
document in memory — choosing an open world tab or creating a new one —
without writing a bundle file. The placed sprite SHALL become placeable in
that world like any other sprite layer, and the world document SHALL turn
dirty.

#### Scenario: Place into an open world

- **WHEN** the user invokes place-in-world on a baked sprite tab while a
  world tab is open
- **THEN** the sprite becomes a placeable layer in that world document, a
  placement appears, no file is written, and the world tab is dirty

#### Scenario: Place creates a world when none is open

- **WHEN** the user invokes place-in-world with no world tab open
- **THEN** a new world document is created with the sprite as its first
  placeable layer

#### Scenario: Placed sprite persists like any sprite

- **WHEN** the user saves the world after placing an in-memory sprite and
  later reloads that world with the sprite's bundle present in `sprites/`
- **THEN** the placement restores from the bundle by asset id; when the
  bundle is absent the placement is reported as skipped, as with any
  missing sprite asset
### Requirement: Sprite editor toolbar

A sprite editor SHALL render a toolbar above its content offering Save, the
render pass action, Bake All, Remove view, and Place in world. The render
pass action SHALL first bake the raster g-buffer pass (world-space normals
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
downloading the bundle. Place in world SHALL behave as specified by the
placement requirement (target an open world tab or create a new world).

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

#### Scenario: Place in world from the toolbar

- **WHEN** the user activates Place in world on a baked sprite document
- **THEN** the sprite becomes a placeable layer in the active world
  document (or a new world when none is open), with no bundle file written

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
  already holds (for example after a place-in-world handoff)
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
