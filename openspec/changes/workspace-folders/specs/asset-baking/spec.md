## ADDED Requirements

### Requirement: Workspace-backed source pickers in the bake tool

While a workspace is connected, the bake tool's model and HDRI pickers
SHALL additionally list the contents of the workspace's `models/` and
`hdri/` folders (filtered to accepted types) and loading an entry SHALL
produce exactly the same result as loading the equivalent file through the
existing dialogs. Picking a `.gltf` from the `models/` listing SHALL
resolve its external resource references (`.bin` buffers, texture images)
against the current contents of the `models/` folder. The existing file
dialogs and drag-drop SHALL remain fully functional, with and without a
workspace.

#### Scenario: Model loaded from the workspace listing

- **WHEN** the user picks a `.glb` from the `models/` listing
- **THEN** it becomes the active bake source exactly as if it had been
  picked through the file dialog

#### Scenario: Multi-file .gltf resolves against the models folder

- **WHEN** the user picks a `.gltf` from the `models/` listing whose
  `.bin` and texture files sit alongside it in `models/`
- **THEN** every external resource reference resolves against the folder
  contents and the model becomes the active source

#### Scenario: HDRI loaded from the workspace listing

- **WHEN** the user picks a `.hdr` from the `hdri/` listing
- **THEN** it becomes the active environment for the render pass, identical
  to loading it through the file dialog

#### Scenario: File dialogs keep working alongside the workspace

- **WHEN** a workspace is connected and the user loads a model through the
  existing file dialog instead
- **THEN** it behaves exactly as before this change

### Requirement: Bundle saves into the workspace

While a workspace is connected, the bake tool's bundle save SHALL write the
bundle into the workspace as `sprites/<id>.sprite` and report the save in
the status area; the bytes SHALL be the unchanged `isoinfinity-bake/4` zip
bundle. The browser-download path SHALL remain available as the fallback
(with no workspace connected it is the default), also producing
`<id>.sprite`. The debug position image SHALL keep downloading as a file
and SHALL NOT be written into the convention folders.

#### Scenario: Saving a bake writes the bundle into the workspace

- **WHEN** the user saves a baked bundle while a workspace is connected
- **THEN** `sprites/<id>.sprite` appears in the workspace and the status
  area reports the save

#### Scenario: Fallback download when no workspace is connected

- **WHEN** the user saves a baked bundle with no workspace connected
- **THEN** the bundle is downloaded as `<id>.sprite`, byte-identical to the
  workspace save
