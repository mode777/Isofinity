# world-asset-browser Delta

## Purpose

Lets the world editor pick placement brushes through a visual asset browser
modal — a file-browser listing of the workspace `sprites/` folder with baked
sprite thumbnails, a built-ins group, and a search field across folders —
instead of hunting names in a flat dropdown.

## ADDED Requirements

### Requirement: Opening the asset browser

While a placement (pencil) tool is active, the world editor's brush control
area SHALL show the current brush's name as a label with a "…" picker button
next to it. Activating the picker button SHALL open the asset browser as a
modal dialog over the editor. The browser SHALL close on the backdrop click,
on the Escape key, or on its close button, without changing the active brush.
The browser SHALL also be openable while no brush is chosen yet; in that state
the label SHALL indicate that no brush is selected.

#### Scenario: Picker opens the browser

- **WHEN** the user activates the "…" picker button next to the brush label
- **THEN** the asset browser modal opens over the world editor and the active
  brush is unchanged

#### Scenario: Cancelling the browser keeps the brush

- **WHEN** the browser is open and the user presses Escape, clicks the
  backdrop, or activates the close button
- **THEN** the browser closes, the previously active brush and tool are
  unchanged, and nothing was loaded or placed

#### Scenario: Label names the current brush

- **WHEN** a sprite brush `props/crates/crate1` is the active brush and the
  pencil tool is active
- **THEN** the brush control area's label shows that brush's name, and with
  no brush ever chosen the label shows a no-brush placeholder instead

### Requirement: Browser layout mirrors the save dialog's file browser

The asset browser SHALL reuse the established file-dialog chrome: a modal
backdrop with a dialog panel titled for asset picking, a header row with the
title and close button, a body split into a folder tree on the left and a
file area on the right with a breadcrumb naming the current folder, and a
footer row with a cancel action. The folder tree SHALL show the workspace
`sprites/` convention folder as its root with the sprite subfolders beneath
it, expandable and collapsible like the save dialog's tree. Activating a
subfolder SHALL show that folder's sprites in the file area.

#### Scenario: Tree mirrors the sprites folder

- **WHEN** the workspace `sprites/` folder holds `props/barrel.sprite`,
  `props/crates/crate1.sprite`, and `nature/oak.sprite` and the browser opens
- **THEN** the tree shows an expandable `props/` node containing a `crates/`
  child node and a `nature/` node, matching the save dialog's folder tree

#### Scenario: Entering a subfolder shows its sprites

- **WHEN** the user expands `props/crates/` in the tree
- **THEN** the file area's breadcrumb names the `sprites/props/crates/`
  folder and lists the sprite entries it contains

### Requirement: Sprite entries show baked thumbnails

Each workspace sprite entry in the file area SHALL display the bundle's baked
128×128 thumbnail when the bundle carries one (the `/7` manifest thumbnail
pass), rendered as the entry's visual; sprites whose bundle has no thumbnail
(pre-`/7` or render-less bundles) SHALL show a generic fallback icon instead.
A missing thumbnail SHALL NOT prevent the sprite from being listed, searched,
or placed. Built-in entries (primitives, character) SHALL show a generic
icon, never a thumbnail.

#### Scenario: Bundled sprite shows its thumbnail

- **WHEN** the browser lists a sprite whose bundle carries the `/7`
  thumbnail pass
- **THEN** the entry shows that baked image instead of a generic icon

#### Scenario: Thumbnail-less sprite stays usable

- **WHEN** the browser lists a sprite whose bundle has no thumbnail entry
- **THEN** the entry shows the generic fallback icon and can still be picked
  and placed like any other sprite

### Requirement: Search filters assets across folders

The browser SHALL offer a search field in its dialog's top-right corner.
Typing SHALL filter the offered assets to those whose name (or path relative
to `sprites/`) matches the query case-insensitively as a substring, across
the `sprites/` main folder and all subfolders, and across the built-ins,
regardless of which folder is currently open. Clearing the field SHALL
restore the unfiltered listing. While a query is active the file area SHALL
present the matching entries (with their folder context) even when they live
in folders that are not open in the tree.

#### Scenario: Search reaches into subfolders

- **WHEN** the user types `crate` while the `sprites/` root folder is open
  and `props/crates/crate1.sprite` exists
- **THEN** the file area lists `crate1` with its subfolder context even
  though `props/crates/` is not the open folder

#### Scenario: Search is case-insensitive and covers built-ins

- **WHEN** the user types `CUB` with the character and a `cube` primitive
  available
- **THEN** the `cube` primitive appears among the results

#### Scenario: Clearing the search restores the listing

- **WHEN** the user clears the search field after a filtered search
- **THEN** the file area shows the currently open folder's full listing
  again

### Requirement: Built-ins are offered alongside workspace sprites

The browser SHALL offer a Built-ins group containing the world editor's
placement brushes that are not workspace files — the built-in test
primitives and the character — so every brush the pencil could place before
this change remains placeable through the browser. The Built-ins group SHALL
be usable with no workspace connected; without a connection the sprites
section SHALL be empty and SHALL explain that workspace sprites need a
connection, consistent with the project browser's behavior.

#### Scenario: Built-ins are listed without a workspace

- **WHEN** no workspace is connected and the user opens the asset browser
- **THEN** the Built-ins group lists the primitives and the character and
  they can be picked, while the sprites section explains the missing
  connection instead of listing files

### Requirement: Picking an asset selects it as the placement brush

Activating an asset entry in the browser SHALL acquire it as the placement
brush through the world editor's existing brush-selection semantics: a
brush whose sprite layer the document already holds SHALL be reused without
loading; a workspace sprite SHALL have its bundle loaded into the document
in memory; a built-in primitive SHALL bake into the document in memory; and
acquiring SHALL turn the document dirty exactly as the previous dropdown
selection did. A successful pick SHALL activate the pencil tool with the
picked brush, close the browser, and update the toolbar's brush label; the
failure path SHALL keep the previous tool state, report the failure through
the status bar, and leave the browser open.

#### Scenario: Picking a sprite places with it

- **WHEN** the user picks `nature/oak.sprite` in the browser while connected
- **THEN** the bundle loads into the world document in memory, the pencil
  becomes active with `oak` as the brush, the browser closes, the label
  names `oak`, and the document is dirty

#### Scenario: Picking reuses an existing layer

- **WHEN** the user picks a sprite whose layer the world document already
  holds
- **THEN** the brush activates immediately with no load or bake work

#### Scenario: Failed pick keeps the browser open

- **WHEN** the user picks a sprite whose bundle cannot be read from the
  workspace
- **THEN** the status bar names the failure, the previous brush and tool
  state are unchanged, and the browser stays open for another pick
