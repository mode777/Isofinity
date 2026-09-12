# workspace-file-dialog Specification

## Purpose

A custom modal save/load dialog for workspace files that mirrors native
operating-system file dialogs: a folder tree on the left, a filtered file
list on the right, so users navigate nested folders when saving and loading
editor assets.

## Requirements

### Requirement: Save and load use a workspace file dialog modal

When a workspace is connected, save and load affordances for workspace
assets (sprite bundles, world scenes, and other convention-folder assets)
SHALL open a custom modal dialog instead of writing/reading a bare root-level
name — except for the plain save of a document that is already backed by a
workspace file (see below). The modal SHALL show a folder view on the left
(the convention folders of the relevant kind and their nested subfolders,
expandable) and a file view on the right (the files in the currently selected
folder, filtered to the accepted types for that kind). In save mode the modal
SHALL also provide a name field pre-filled with the current name; accepting
SHALL write to the selected folder. In load mode, selecting a file and
accepting SHALL open it. Canceling SHALL leave the document unchanged.

A document that already has a workspace file backing (from a prior save or
from being opened through the project browser) SHALL save without the modal:
its plain save affordance SHALL write directly to the backing file, updating
the file in place. A separate Save As affordance SHALL open the modal with
the backing file's name pre-filled, letting the user pick a different
name/folder; accepting re-points the document at the chosen file. Without a
connected workspace the plain save and Save As SHALL both fall back to the
existing non-modal behavior (name prompt and download), unchanged.

#### Scenario: Save modal navigates into a subfolder

- **WHEN** the user opens the save modal, expands `worlds/`, selects the
  `campaign1/` subfolder, and accepts
- **THEN** the world is saved to `worlds/campaign1/<name>.json`

#### Scenario: Load modal lists only accepted types

- **WHEN** the selected folder in the load modal contains `a.sprite` and
  `readme.txt`
- **THEN** the file view lists only `a.sprite`

#### Scenario: Canceling changes nothing

- **WHEN** the user dismisses the save or load modal with cancel
- **THEN** the document and workspace are unchanged

#### Scenario: Saving an already-saved world skips the dialog

- **WHEN** a world document that was previously saved to
  `worlds/campaign1/town.json` is saved again with the plain save
  affordance
- **THEN** the file `worlds/campaign1/town.json` is overwritten in place
  and no modal opens

#### Scenario: Saving an already-saved sprite skips the dialog

- **WHEN** a sprite document backed by `sprites/props/barrel.sprite` is
  saved with the plain save affordance
- **THEN** `sprites/props/barrel.sprite` is overwritten in place under that
  same name and no modal opens

#### Scenario: Save As opens the dialog for a saved document

- **WHEN** the user activates Save As on a document backed by
  `worlds/town.json`
- **THEN** the save modal opens with `town.json` pre-filled as the name,
  and accepting under a new name writes the new file and re-points the
  document at it

#### Scenario: New document still opens the dialog on plain save

- **WHEN** the user activates the plain save affordance on a world or
  sprite document that has never been saved to the workspace
- **THEN** the save modal opens as before

### Requirement: File dialog navigation mirrors native dialogs

The modal SHALL behave like a native file dialog: double-activation (or an
equivalent affordance) on a folder in the file view or tree enters it, an
up/breadcrumb affordance returns to the parent, the current path is visible,
and the accept action is disabled in save mode when the name field is empty.

#### Scenario: Breadcrumb shows the current path

- **WHEN** the user has navigated into `sprites/props/crates/`
- **THEN** the modal shows the current path as `sprites/props/crates/` and
  offers a way back to each ancestor

#### Scenario: Save without a name is not accepted

- **WHEN** the user clears the name field in the save modal and activates
  the accept action
- **THEN** nothing is saved and the accept affordance is unavailable

### Requirement: New folders can be created from the dialog

The save/load dialog SHALL offer a new-folder affordance that creates a
subfolder inside the currently selected folder (on demand, any depth) and
navigates into it. A creation failure (permission lost, invalid name) SHALL
be reported inside the dialog without closing it. Created folders are
immediately usable as save targets.

#### Scenario: Creating a subfolder while saving

- **WHEN** the user activates the new-folder affordance in `worlds/`, enters
  `campaign1`, and confirms
- **THEN** `worlds/campaign1/` exists, the dialog navigates into it, and a
  save there writes `worlds/campaign1/<name>.json`

#### Scenario: Failed creation is reported in the dialog

- **WHEN** folder creation fails (e.g. permission revoked)
- **THEN** the dialog shows the error and stays open with its state intact

### Requirement: Modal without a workspace falls back to current behavior

When no workspace is connected, save and load SHALL behave exactly as they
do today (downloads and file dialogs); the modal SHALL NOT be shown, or
SHALL be shown only in a workspace-less degraded form that does not pretend
to browse the workspace.

#### Scenario: No workspace connected uses existing dialogs

- **WHEN** the user saves a bundle with no workspace connected
- **THEN** the bundle is offered as a browser download named `<id>.sprite`,
  as before
