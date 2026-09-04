# integrated-editor — delta

## REMOVED Requirements

### Requirement: Project browser lists built-ins and workspace assets

**Reason**: Built-in test primitives leave the project browser (left bar). The
browser becomes a workspace-asset listing plus import/create actions, which is
its remaining purpose.

**Migration**: New sprite documents start from workspace `models/` entries, the
glTF import file dialog (works without a workspace), or sprite bundles from
`sprites/`. Primitives remain available as world-editor brushes through the
world toolbar's brush dropdown, and bundles recorded with primitive provenance
still re-bake from the built-in geometry.

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Sprite editor toolbar

A sprite editor SHALL render a toolbar above its content offering Save, the
render pass action, and Place in world. The render pass action SHALL first
bake the raster g-buffer pass (world-space normals + linear ray depth) from
the document's current source and settings, then accumulate the path-traced
render pass against that g-buffer, so the two passes stay pixel-aligned and
current without a separate bake action. The action SHALL be disabled for
view-only documents and while a render pass is accumulating, and its label
SHALL reflect state (Render pass, Re-render pass once a rendered pass exists,
Rendering… while busy). Progress and completion SHALL be reported through the
status bar. Save SHALL prompt for a file name, offering the document's
current name as the default; cancelling the prompt SHALL abort the save
without writing a file or clearing the dirty state. With a workspace
connected, Save SHALL write the bundle to the workspace's `sprites/` folder
under the chosen name; without a connection it SHALL fall back to
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

- **WHEN** the user changes a model source's uniform scale and activates the
  render pass action
- **THEN** the g-buffer is re-baked at the new scale and the render pass
  accumulates against it, with both passes pixel-aligned and no separate
  bake button used

#### Scenario: Render action reflects its state

- **WHEN** a render pass is accumulating
- **THEN** the toolbar action reads "Rendering…" and is disabled until the
  pass finishes, and progress appears in the status bar

#### Scenario: View-only documents cannot render

- **WHEN** a view-only sprite tab is active
- **THEN** the toolbar's render pass action is disabled

### Requirement: Only explicit bake actions bake or render

Editing a properties-panel control SHALL update the active document's state
only: no input other than the sprite editor toolbar's render pass action
SHALL trigger a raster bake or a path-traced render pass. The render pass
action includes its implicit raster g-buffer bake as specified by the sprite
editor toolbar requirement. Opening a resource SHALL keep performing its
initial bake. When an input makes an in-flight render pass stale, the pass
SHALL be discarded — not restarted — and the document SHALL stay usable for
an explicit re-render.

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

- **WHEN** the user activates the render pass action in the sprite toolbar
- **THEN** the g-buffer re-bakes from the document's current source and
  settings and the path-traced render pass runs against it
