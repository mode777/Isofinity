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

### Requirement: Project browser lists built-ins and workspace assets

The project browser SHALL always list the built-in test primitives as
sprite sources, available without any workspace. When a workspace is
connected it SHALL additionally list the workspace's convention folders —
`sprites/` (bundles), `models/` (glTF files), and `worlds/` (world JSON) —
filtered to the accepted file types, with a refresh action re-reading the
folders. Activating a listing entry SHALL open it (sprite bundle or world)
or start a new sprite document from it (built-in primitive or model).
The browser SHALL offer create actions: a new sprite document from a
chosen source and a new empty world document. When no workspace is
connected the browser SHALL remain usable with the built-ins and explain
that workspace assets need a connection.

#### Scenario: Built-ins work without a workspace

- **WHEN** the editor loads with no workspace connected
- **THEN** the project browser lists the built-in primitives and opening
  one starts a sprite document

#### Scenario: Connected workspace lists its assets

- **WHEN** the user connects a workspace whose `sprites/` and `worlds/`
  folders hold files
- **THEN** those files appear in the project browser, filtered by type

#### Scenario: Model entry starts a sprite document

- **WHEN** the user activates a `.glb` file listed from `models/`
- **THEN** a new sprite editor tab opens with that model as its bake
  source

#### Scenario: Refresh picks up external changes

- **WHEN** a file is copied into `worlds/` from the operating system and
  the user refreshes the project browser
- **THEN** the new file appears in the listing

### Requirement: Properties panel follows the active editor

The properties panel SHALL show controls matching the active tab's editor
kind. For a sprite editor it SHALL show the document's source information,
model scale (when the source is a model), path-trace bake settings, the
environment controls (load/rotate/intensity/exposure/saturation), and the
pass actions (raster bake, render pass, AO pass). For a world editor it
SHALL show the key light controls (azimuth, elevation, intensity, color,
ambient color, dynamic-light switch) and the sun-position controls. The
panel SHALL NOT duplicate the per-editor toolbar's actions (save,
place-in-world, and placement tool selection live in the toolbar). Editing
a control SHALL update the active document only.

#### Scenario: Sprite tab shows bake properties

- **WHEN** the user activates a sprite editor tab
- **THEN** the properties panel shows the bake settings, environment
  controls, and pass actions, and no save/export buttons

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

A sprite editor SHALL render a toolbar above its content offering Save and
Place in world. Save SHALL prompt for a file name, offering the document's
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

### Requirement: World editor toolbar

A world editor SHALL render a toolbar above its content offering Save, a
pencil placement tool, and an eraser toggle. Save SHALL prompt for a file
name, defaulting to the world's saved name or the next free `world-N`, and
SHALL write the world to the workspace's `worlds/` folder under the chosen
name when a workspace is connected; cancelling SHALL abort without writing
or clearing the dirty state. The pencil tool SHALL be the active placement
tool by default; the brush it places is chosen from a dropdown grouped into
**Primitives** (the built-in test primitives) and **Sprites** (the
workspace's saved sprite bundles, listed when a workspace is connected).
Clicking or dragging on the world canvas with the pencil places the chosen
brush at the pointed cell; the eraser toggle (and the right mouse button)
removes placements. The toolbar SHALL replace the previous per-layer tool
strip.

#### Scenario: World toolbar offers save, pencil, and brush dropdown

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar shows Save, a pencil tool marked active, and a brush
  dropdown whose groups list the built-in primitives and the workspace's
  saved sprites

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
