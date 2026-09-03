## MODIFIED Requirements

### Requirement: Open a workspace folder

Each tool SHALL offer a workspace control that opens a local folder through
the browser's directory picker on an explicit user action. Connecting SHALL
be allowed to any folder the user picks; on connect the tool SHALL ensure
the convention subfolders exist — `hdri/`, `models/`, `sprites/`, `worlds/`,
`presets/`, creating any that are missing — and SHALL show the connected
state with the folder's name. Canceling the picker SHALL leave the
connection state unchanged.

#### Scenario: Connecting creates the folder convention

- **WHEN** the user picks an empty folder in the directory picker
- **THEN** the tool reports the workspace as connected, shows the folder
  name, and the folder now contains `hdri/`, `models/`, `sprites/`,
  `worlds/`, and `presets/`

#### Scenario: Existing assets are usable immediately

- **WHEN** the user connects to a folder that already holds assets in the
  convention folders
- **THEN** those assets appear in the tools' pickers without any upload
  step

#### Scenario: Canceling the picker changes nothing

- **WHEN** the user dismisses the directory picker without choosing
- **THEN** the tool stays in its previous connection state
