# workspace delta

## MODIFIED Requirements

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

### Requirement: Workspace listings reflect folder contents

When connected, the integrated editor SHALL list the contents of the
convention folders through its project browser, filtered to the accepted
file types per folder (`models/`: glTF files; `hdri/`: `.hdr`/`.exr`;
`sprites/`: `.sprite`/`.zip` bundles; `worlds/`: `.json`; `materials/`:
`.material`/`.zip` files). Listings SHALL be re-read on demand — a refresh
action SHALL be available in the project browser, and opening a listing
SHALL not serve a stale cache after external changes.

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
