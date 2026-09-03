## Purpose

The integrated Isofinity editor: one page hosting sprite (bake) and world
editing behind a shared shell — workspace connection, editor tabs over
in-memory documents, a project browser for opening and creating assets, a
context-sensitive properties panel, and a status bar.

## ADDED Requirements

### Requirement: Integrated editor shell layout

The editor SHALL render as a single page with five regions: a top bar (host
name, version, and the workspace control), a tab bar below it, a project
browser on the left, a properties panel on the right, a center editor area,
and a status bar at the bottom. Status messages from any region (workspace
operations, bake progress, save results, errors) SHALL appear in the status
bar. The version display SHALL show the shared build version.

#### Scenario: All regions are present

- **WHEN** the editor page loads
- **THEN** the top bar, tab bar, project browser, properties panel, editor
  area, and status bar are all visible and the version is shown in the top
  bar

#### Scenario: Bake progress lands in the status bar

- **WHEN** a path-traced render pass accumulates in a sprite editor
- **THEN** progress messages appear in the status bar, not only inside the
  editor area

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
environment controls (load/rotate/intensity/exposure/saturation), the pass
actions (raster bake, render pass, AO pass), and the save/export actions.
For a world editor it SHALL show the key light controls (azimuth,
elevation, intensity, color, ambient color, dynamic-light switch) and the
sun-position controls. Editing a control SHALL update the active document
only.

#### Scenario: Sprite tab shows bake properties

- **WHEN** the user activates a sprite editor tab
- **THEN** the properties panel shows the bake settings, environment
  controls, pass actions, and save/export actions

#### Scenario: World tab shows light properties

- **WHEN** the user activates a world editor tab
- **THEN** the properties panel shows the key light and sun-position
  controls

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
