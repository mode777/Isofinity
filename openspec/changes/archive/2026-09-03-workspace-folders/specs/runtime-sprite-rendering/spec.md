## ADDED Requirements

### Requirement: Sprites load from the workspace listing

While a workspace is connected, the runtime editor's sprite loader SHALL
additionally list the `sprites/` folder's bundles (`.sprite` and `.zip`)
and loading an entry SHALL follow exactly the same path as a dialog-loaded
bundle: same parser, same rules (a bundle without its rendered pass is
still rejected), same unique-id handling when an asset id already exists.
The existing file dialog and drag-drop SHALL remain fully functional, with
and without a workspace.

#### Scenario: Sprite loaded from the workspace listing

- **WHEN** the user picks a `.sprite` bundle from the `sprites/` listing
- **THEN** the sprite loads, appears in the toolbar, and places exactly as
  if loaded through the file dialog

#### Scenario: Same rules apply to workspace loads

- **WHEN** the user picks a bundle that lacks its rendered pass from the
  `sprites/` listing
- **THEN** loading fails with the same named error as the dialog flow and
  no sprite is placed

#### Scenario: Duplicate asset ids stay unique

- **WHEN** a workspace bundle is loaded whose asset id already exists in
  the scene
- **THEN** the loaded copy gets a unique id exactly as the dialog flow does

#### Scenario: Dialog upload keeps working alongside the workspace

- **WHEN** a workspace is connected and the user loads a `.sprite` file
  through the existing file dialog instead
- **THEN** it behaves exactly as the zip dialog flow did before this change
