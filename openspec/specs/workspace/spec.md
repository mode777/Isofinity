# workspace Specification

## Purpose
A persistent browser-bound workspace folder shared by the bake tool and the
runtime editor, with a fixed directory convention, so assets are loaded,
saved, and reused in place instead of going through repeated file-dialog
uploads and browser downloads.

## Requirements

### Requirement: Open a workspace folder

Each tool SHALL offer a workspace control that opens a local folder through
the browser's directory picker on an explicit user action. Connecting SHALL
be allowed to any folder the user picks; on connect the tool SHALL ensure
the convention subfolders exist — `hdri/`, `models/`, `sprites/`, `worlds/`,
`presets/`, `materials/`, creating any that are missing — and SHALL show the
connected state with the folder's name. Canceling the picker SHALL leave the
connection state unchanged.

#### Scenario: Connecting creates the folder convention

- **WHEN** the user picks an empty folder in the directory picker
- **THEN** the tool reports the workspace as connected, shows the folder
  name, and the folder now contains `hdri/`, `models/`, `sprites/`,
  `worlds/`, `presets/`, and `materials/`

#### Scenario: Existing assets are usable immediately

- **WHEN** the user connects to a folder that already holds assets in the
  convention folders
- **THEN** those assets appear in the tools' pickers without any upload
  step

#### Scenario: Canceling the picker changes nothing

- **WHEN** the user dismisses the directory picker without choosing
- **THEN** the tool stays in its previous connection state

### Requirement: Workspace connection persists across sessions

The connection SHALL survive page reloads: the directory handle SHALL be
persisted locally (IndexedDB) and, on a later visit, the tool SHALL offer a
reconnect affordance instead of requiring the folder to be picked again.
Reconnecting SHALL prompt for permission once (it requires a user gesture)
and then restore the connection. A reconnect that is denied, or whose stored
folder no longer exists, SHALL fail with a named status error and leave the
tool disconnected; the stored handle SHALL remain available for another
attempt.

#### Scenario: Reconnect restores the same folder

- **WHEN** the user revisits a page with a previously connected workspace
  and activates the reconnect affordance, then grants permission
- **THEN** the same folder is connected again without a directory picker

#### Scenario: Removed folder fails with a named error

- **WHEN** the stored folder has been deleted or moved and the user tries to
  reconnect
- **THEN** the tool reports a named reconnect error and stays disconnected

#### Scenario: Connection is not silently assumed

- **WHEN** a page with a stored workspace handle loads
- **THEN** the tool shows a reconnect affordance rather than a connected
  state until permission is granted

### Requirement: Convention folders support nested subfolders

The workspace SHALL allow arbitrary nested subfolders inside each convention
folder (`hdri/`, `models/`, `sprites/`, `worlds/`, `presets/`, `materials/`)
to any depth. Listing helpers SHALL return files from subfolders recursively,
with each entry's path relative to the convention folder. Writes SHALL accept
a relative subfolder path and SHALL create missing intermediate directories on
demand. Flat layouts (files directly in the convention folder) SHALL remain
valid; no migration or move is performed. Subfolders created outside the
convention folders or foreign files at the workspace root are out of scope and
SHALL be ignored.

#### Scenario: Nested files are listed recursively

- **WHEN** `sprites/` contains `props/barrel.sprite` and `nature/trees/oak.sprite`
- **THEN** a listing of `sprites/` returns both files with their relative
  paths (`props/barrel.sprite`, `nature/trees/oak.sprite`)

#### Scenario: Saving into a new subfolder creates it

- **WHEN** the user saves a world to `worlds/campaign1/act2/town.json` and no
  `campaign1/` or `act2/` folder exists
- **THEN** the missing subfolders are created and `worlds/campaign1/act2/town.json`
  is written

#### Scenario: Flat layout keeps working

- **WHEN** a workspace holds `worlds/town.json` directly in `worlds/`
- **THEN** the listing includes it and it loads exactly as before

### Requirement: Workspace listings reflect folder contents

When connected, the integrated editor SHALL list the contents of the
convention folders through its project browser, filtered to the accepted
file types per folder (`models/`: glTF files; `hdri/`: `.hdr`/`.exr`;
`sprites/`: `.sprite`/`.zip` bundles; `worlds/`: `.json`; `materials/`:
`.material`/`.zip` files), including files in nested subfolders with their
relative paths. Listings SHALL be re-read on demand — a refresh action SHALL
be available in the project browser, and opening a listing SHALL not serve a
stale cache after external changes.

#### Scenario: Listings filter by accepted types

- **WHEN** `models/` contains `.glb`, `.gltf`, and `.txt` files
- **THEN** the project browser lists only the `.glb` and `.gltf` files

#### Scenario: Materials folder is listed

- **WHEN** `materials/` contains `stone.material` and `notes.txt`
- **THEN** the project browser lists only `stone.material`

#### Scenario: Refresh picks up external changes

- **WHEN** a file is copied into `sprites/` from the operating system and
  the user refreshes the project browser
- **THEN** the new file appears in the listing

#### Scenario: Nested files are filtered too

- **WHEN** `models/chars/hero.glb` and `models/notes.txt` exist
- **THEN** the listing includes `chars/hero.glb` and excludes `notes.txt`

### Requirement: Saves write into the workspace

While connected, tool outputs SHALL be written into the convention folders:
sprite bundles to `sprites/<relative-path>/<id>.sprite` and world scenes to
`worlds/<relative-path>/<name>.json`, where the relative path MAY contain
subfolders that are created on demand. Saving to a name that already exists
SHALL overwrite that file. A write failure (permission lost, disk error)
SHALL be reported in the status area and leave the tool usable.

#### Scenario: Saved bundle appears in the workspace

- **WHEN** the user saves a baked bundle while connected
- **THEN** `sprites/<id>.sprite` exists in the workspace and the status
  area reports the save

#### Scenario: Overwrite replaces the old file

- **WHEN** the user saves with a name that already exists in the target
  folder
- **THEN** the file is replaced and no duplicate is created

#### Scenario: Write failure is reported

- **WHEN** writing to the workspace fails (e.g. permission revoked)
- **THEN** the status area names the failure and the tool remains usable

### Requirement: Sprite bundles use the .sprite file extension

Sprite bundles SHALL be named `<id>.sprite` wherever they are produced —
workspace saves and fallback browser downloads alike. The bytes SHALL
remain exactly the standard zip bundle (`isoinfinity-bake` manifest +
passes); only the name changes, so browsers and operating systems do not
auto-extract them. Both tools SHALL accept `.sprite` and `.zip` files
wherever bundles are read: file-dialog filters, drag-drop, and workspace
listings. Legacy `<id>-bake.zip` files SHALL keep loading unchanged.

#### Scenario: A saved .sprite loads in the runtime

- **WHEN** the runtime loads a `.sprite` file saved by the bake tool
- **THEN** it parses as a standard `isoinfinity-bake` bundle and places the
  sprite

#### Scenario: Legacy zip bundles keep working

- **WHEN** the runtime or bake tooling is handed a legacy
  `<id>-bake.zip` bundle
- **THEN** it loads identically to before

#### Scenario: Fallback downloads are named .sprite

- **WHEN** the user downloads a bundle with no workspace connected
- **THEN** the downloaded file is named `<id>.sprite`

### Requirement: Tools degrade gracefully without File System Access

In browsers that lack the File System Access directory-picker API, the
workspace controls SHALL be disabled (or hidden) with the reason shown in
the status area, and every workflow SHALL remain available through the
existing file dialogs, drag-drop, and downloads. With no workspace
connected — in any browser — both tools SHALL behave exactly as they do
today.

#### Scenario: Unsupported browser keeps today's workflow

- **WHEN** a tool is opened in a browser without the directory-picker API
- **THEN** asset loading via file dialogs, drag-drop, and bundle download
  all still work, and the workspace control explains that it is
  unavailable
