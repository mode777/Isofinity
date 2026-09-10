## MODIFIED Requirements

### Requirement: Workspace-backed source pickers in the bake tool

While a workspace is connected, the bake tool's model and HDRI pickers
SHALL additionally list the contents of the workspace's `models/` and
`hdri/` folders (filtered to accepted types, including nested subfolders,
identified by their slash-relative paths) and loading an entry SHALL
produce exactly the same result as loading the equivalent file through the
existing dialogs. A model entry SHALL be resolved by its relative path
within `models/`, so models stored in nested subfolders load exactly like
models at the folder's top level. Picking a `.gltf` from the `models/`
listing SHALL resolve its external resource references (`.bin` buffers,
texture images) against the current contents of the `models/` folder,
preferring files that sit in the `.gltf`'s own folder or subfolder of it.
The existing file dialogs and drag-drop SHALL remain fully functional,
with and without a workspace.

#### Scenario: Model loaded from the workspace listing

- **WHEN** the user picks a `.glb` from the `models/` listing
- **THEN** it becomes the active bake source exactly as if it had been
  picked through the file dialog

#### Scenario: Model in a nested subfolder loads by relative path

- **WHEN** the user picks `tripo/ancient+mosaic+3d+model.glb` from the
  `models/` listing
- **THEN** the model loads and becomes the active bake source — no
  "no longer in the models/ folder" error

#### Scenario: Multi-file .gltf resolves against the models folder

- **WHEN** the user picks a `.gltf` from the `models/` listing whose
  `.bin` and texture files sit alongside it in `models/`
- **THEN** every external resource reference resolves against the folder
  contents and the model becomes the active source

#### Scenario: Multi-file .gltf resources resolve from the model's own subfolder

- **WHEN** the user picks `tripo/mosaic.gltf` whose `.bin` and texture
  files sit in `tripo/` next to it
- **THEN** every external resource reference resolves and the model
  becomes the active source

#### Scenario: Missing nested model still reports a named error

- **WHEN** the user tries to load a relative path that does not exist
  anywhere under `models/`
- **THEN** loading fails with a named error identifying the missing file

#### Scenario: HDRI loaded from the workspace listing

- **WHEN** the user picks a `.hdr` from the `hdri/` listing
- **THEN** it becomes the active environment for the render pass, identical
  to loading it through the file dialog

#### Scenario: File dialogs keep working alongside the workspace

- **WHEN** a workspace is connected and the user loads a model through the
  existing file dialog instead
- **THEN** it behaves exactly as before this change

### Requirement: Sprites re-bake from recorded provenance

Opening an `isoinfinity-bake/6` sprite SHALL restore its recorded source,
bake settings, environment, origin anchor, and stored views (each with its
passes) into a sprite document so the user can edit them and re-bake in
place. Re-baking SHALL re-read the referenced model from the connected
workspace's `models/` folder by its recorded relative path (at the recorded
scale) and the referenced environment from `hdri/`, re-run the selected
passes for the selected view with the recorded (or edited) settings, and
replace that view's passes; saving SHALL write an updated `/6` bundle. A
restored custom origin SHALL apply to re-bakes: every re-baked view anchors
at the derived point for its slot. A `/5` bundle SHALL open editable as a
single-view (N) sprite. Provenance recorded by older manifests MAY carry
settings the pass set no longer has (for example AO samples and radius);
the editor SHALL ignore those fields. Provenance without an origin field
SHALL restore the default box-min-corner anchor. When a referenced model or
environment file is missing — or the workspace is not connected — the
sprite SHALL open view-only (the passes of every stored view visible,
save/export available) with a named status message naming the missing
reference.

#### Scenario: Re-bake applies edited settings

- **WHEN** the user opens a `/6` sprite, raises the render sample count,
  and re-bakes its selected view
- **THEN** that view's render pass re-accumulates from the sprite's
  recorded source and environment with the new sample count, and saving
  writes the new settings into the manifest

#### Scenario: Provenance with legacy AO settings opens editable

- **WHEN** the user opens a `/6` sprite whose provenance records AO
  samples and radius
- **THEN** the sprite opens editable with the remaining settings restored
  and the legacy AO fields ignored

#### Scenario: Custom origin survives open and re-bake

- **WHEN** the user opens a sprite whose provenance records a custom origin
  and re-bakes a view
- **THEN** the origin is restored into the editor, the re-baked view
  anchors at that point (rotated for its slot), and the panel shows the
  restored value

#### Scenario: Sprite from a nested model re-bakes

- **WHEN** the user opens a `/6` sprite whose provenance records the model
  as `tripo/ancient+mosaic+3d+model.glb` and re-bakes a view
- **THEN** the model is re-read from that path under `models/` and the
  view re-bakes instead of the sprite degrading to view-only

#### Scenario: Missing model degrades to view-only

- **WHEN** the user opens a `/6` sprite whose referenced model file no
  longer exists in `models/`
- **THEN** every stored view's passes are shown view-only and the status
  area names the missing model file

#### Scenario: Format /4 opens view-only

- **WHEN** the user opens an `isoinfinity-bake/4` bundle
- **THEN** its passes are shown view-only with a status note that it has
  no provenance to re-bake from

#### Scenario: Format /5 opens as a single-view sprite

- **WHEN** the user opens an `isoinfinity-bake/5` bundle with provenance
- **THEN** it opens editable with its passes stored as the N view and no
  other slot holding passes
