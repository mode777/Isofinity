## MODIFIED Requirements

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

## ADDED Requirements

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
