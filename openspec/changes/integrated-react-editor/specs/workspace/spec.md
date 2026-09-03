## MODIFIED Requirements

### Requirement: Workspace listings reflect folder contents

When connected, the integrated editor SHALL list the contents of the
convention folders through its project browser, filtered to the accepted
file types per folder (`models/`: glTF files; `hdri/`: `.hdr`/`.exr`;
`sprites/`: `.sprite`/`.zip` bundles; `worlds/`: `.json`). Listings SHALL be
re-read on demand — a refresh action SHALL be available in the project
browser, and opening a listing SHALL not serve a stale cache after external
changes.

#### Scenario: Listings filter by accepted types

- **WHEN** `models/` contains `.glb`, `.gltf`, and `.txt` files
- **THEN** the project browser lists only the `.glb` and `.gltf` files

#### Scenario: Refresh picks up external changes

- **WHEN** a file is copied into `sprites/` from the operating system and
  the user refreshes the project browser
- **THEN** the new file appears in the listing
