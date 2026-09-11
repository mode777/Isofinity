## MODIFIED Requirements

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
