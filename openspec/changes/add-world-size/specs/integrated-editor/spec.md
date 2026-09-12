## ADDED Requirements

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

## MODIFIED Requirements

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

#### Scenario: Place in world from the toolbar

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

## REMOVED Requirements

### Requirement: Place a baked sprite into a world document

**Reason**: The in-memory sprite→world handoff is the only implicit world
creation path, which conflicts with worlds always being created
deliberately at a chosen size; and its placement is never reachable again
after a reload unless the sprite is saved to `sprites/` anyway — the
bundle-brush path covers the workflow without duplicating layer
acquisition.

**Migration**: Save the sprite bundle to the workspace's `sprites/` folder
(sprite editor Save), then pick it as a brush in the world editor — the
bundle loads as a placeable layer exactly as the removed handoff placed
it.
