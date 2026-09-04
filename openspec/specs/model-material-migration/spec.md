## Purpose

Lets users repair workspace models whose materials use the deprecated
`KHR_materials_pbrSpecularGlossiness` glTF workflow, converting the file in
place to metallic-roughness so loads and bakes are material-correct.

## Requirements

### Requirement: Opening a workspace model with deprecated materials offers a fix

When a model is opened from the workspace's `models/` folder and its glTF
container declares `KHR_materials_pbrSpecularGlossiness`, the editor SHALL
offer to fix the file before loading it, via a confirm dialog that names the
file and the number of affected materials. The offer SHALL apply only to
`.glb` files opened from the workspace. Declining the offer SHALL load the
model unchanged, exactly as the editor does today.

#### Scenario: Offer names the file and material count

- **WHEN** a user opens `knight.glb` from the workspace project browser and
  the file's materials use specular-glossiness
- **THEN** a confirm dialog offers to convert it, naming `knight.glb` and
  the count of affected materials

#### Scenario: Declining loads the model as-is

- **WHEN** the user declines the fix offer
- **THEN** the model opens and bakes as it does today (including its
  material-correctness problems), with no file written

#### Scenario: Spec-free models are not offered anything

- **WHEN** a user opens a workspace `.glb` whose materials do not use
  specular-glossiness
- **THEN** it opens directly with no dialog

#### Scenario: Non-workspace opens get no offer

- **WHEN** a user opens a specular-glossiness `.glb` via the file picker or
  a drag-and-drop
- **THEN** no fix is offered and the model loads as it does today

#### Scenario: Multi-file .gltf sets get no offer

- **WHEN** a user opens a `.gltf` file set from the workspace whose JSON
  declares specular-glossiness
- **THEN** no fix is offered and the model loads as it does today

### Requirement: Accepting the fix converts the file in place and loads it

Accepting the offer SHALL convert the `.glb` to the metallic-roughness
workflow (removing `KHR_materials_pbrSpecularGlossiness`, translating the
materials, and re-encoding their textures), overwrite the original file in
`models/` under the same name without keeping a backup, and then open the
sprite document from the converted bytes as if the fixed file had been
opened normally.

#### Scenario: Fixed file is converted on disk

- **WHEN** the user accepts the fix for `knight.glb`
- **THEN** `models/knight.glb` is overwritten with the converted file, no
  longer declares the specular-glossiness extension, and no backup file is
  created

#### Scenario: Converted model opens normally

- **WHEN** the conversion and save succeed
- **THEN** a sprite document opens for `knight.glb` built from the
  converted bytes, and its materials bake with translated colors rather
  than loader defaults

#### Scenario: Reopening a fixed file does not re-offer

- **WHEN** the user later reopens the same `knight.glb` from the workspace
- **THEN** no fix is offered because the file no longer declares the
  deprecated extension

#### Scenario: Open document is refreshed after a fix

- **WHEN** the user accepts the fix for a `.glb` whose sprite document is
  already open in a tab
- **THEN** that tab reloads from the converted bytes instead of continuing
  to show the stale pre-fix model

### Requirement: A failed fix leaves the file and the session untouched

If the conversion or the overwrite fails, the editor SHALL report the
failure in the status bar, leave the original file byte-identical on disk,
and open no sprite document. The fix offer SHALL reappear the next time the
file is opened.

#### Scenario: Conversion error keeps the original file

- **WHEN** the in-browser conversion of `knight.glb` throws
- **THEN** the status bar reports the failure, `models/knight.glb` is
  unchanged, and no sprite document opens

#### Scenario: Write error keeps the original file

- **WHEN** the converted output cannot be written to `models/knight.glb`
- **THEN** the status bar reports the failure, the original file is
  unchanged, and no sprite document opens

#### Scenario: Offer reappears after a failed fix

- **WHEN** the user reopens `knight.glb` after a failed fix
- **THEN** the fix offer is shown again
