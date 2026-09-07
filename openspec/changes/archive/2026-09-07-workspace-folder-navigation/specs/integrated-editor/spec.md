## MODIFIED Requirements

### Requirement: Project browser lists workspace assets

The project browser SHALL present each workspace convention folder it lists —
`sprites/` (bundles), `models/` (glTF files), and `worlds/` (world JSON) — as
a collapsible tree view: nested subfolders appear as expandable nodes and
files appear as leaves at their relative path position, filtered to the
accepted file types. Activating a file entry SHALL open it (sprite bundle or
world) or start a new sprite document from it (model), regardless of the
folder depth it lives at. The browser SHALL offer the glTF import file dialog
as the workspace-less path to a new sprite document and a new empty world
action. The browser SHALL NOT list built-in test primitives; primitives reach
the pipeline only as world-editor brushes. When no workspace is connected the
browser SHALL remain usable through the import dialog and explain that
workspace assets need a connection.

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
