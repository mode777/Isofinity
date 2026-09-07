## ADDED Requirements

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

## MODIFIED Requirements

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
