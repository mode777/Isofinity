## ADDED Requirements

### Requirement: Bundle format /7 stores half-float g-buffers and a thumbnail

A saved bake SHALL be an `isoinfinity-bake/7` bundle: a single zip whose
g-buffer pass is a **half-float** EXR (`encoding: exr-f16-linear`, the same
`rgb = world normal`, `a = ray depth` channels), deflated in the bundle as
before, and which — when the bundle
carries a render pass — additionally contains a `128x128` RGBA PNG thumbnail
entry (`<id>-thumb.png`) referenced by a top-level manifest `thumbnail` field
(`file`, `width`, `height`). The thumbnail SHALL be derived from the N view's
render pass, preserving its aspect ratio and filling the remainder
transparently; it SHALL NOT be produced when the bundle has no render pass.
The N view's pass entries SHALL keep the historical naming. Older `/4`–`/6`
bundles SHALL remain readable: their full-float (`exr-f32-linear`) g-buffers
and, for `/6`, their per-view passes load unchanged, and a bundle without a
thumbnail field loads with no thumbnail.

#### Scenario: A /7 bundle is half-float and carries a thumbnail

- **WHEN** the user saves a bake that has a render pass
- **THEN** the bundle's manifest is `/7`, its g-buffer entry is a half-float
  EXR, and it contains a `<id>-thumb.png` entry referenced by the manifest
  `thumbnail` field at 128×128

#### Scenario: The thumbnail comes from the north render

- **WHEN** a bake with N/E/S/W views is saved
- **THEN** the thumbnail is derived from the N view's render pass, and no
  per-view thumbnail entry is written

#### Scenario: A bundle without a render pass has no thumbnail

- **WHEN** the user saves a bake that has no render pass
- **THEN** the bundle is `/7` with a half-float g-buffer and no thumbnail
  entry or manifest `thumbnail` field

#### Scenario: Older full-float bundles load unchanged

- **WHEN** the user opens a `/4`, `/5` or `/6` bundle whose g-buffer is a
  full-float EXR and which has no thumbnail
- **THEN** the bundle loads exactly as before, with no thumbnail and no
  re-bake required

## MODIFIED Requirements

### Requirement: glTF bakes emit standard bundles

A glTF bake SHALL produce the same outputs as a primitive bake — g-buffer
EXR (rgb = world-space normal, a = linear ray depth against the global
reference plane), manifest with format `isoinfinity-bake/7`, single zip
bundle — readable by the editor's bundle parser without modification. The
g-buffer normals SHALL come from the mesh geometry, not derived from depth.
The g-buffer SHALL use the `/7` half-float encoding. Each stored view
contributes its own pass entries per the multi-view format requirement; the
N view's entries keep the historical naming (`<id>-gbuffer.exr`,
`<id>-render.png`). When produced, a view's render pass SHALL be included as
an additional bundle entry referenced by that view's record in the manifest;
the manifest SHALL record which optional passes each view carries and the
environment/tonemap/renderer settings used for them. The editor bundle
parser SHALL accept `/4`–`/7` bundles, SHALL require only the N view's
g-buffer entry, and SHALL ignore pass entries recorded by older manifests
that it no longer consumes (for example albedo or ao); a `/4`–`/6` bundle MAY
omit the optional passes.

#### Scenario: glTF bundle downloads and validates

- **WHEN** the user bakes a glTF source and downloads the bundle
- **THEN** the zip contains a valid `isoinfinity-bake/7` manifest plus the
  N view's g-buffer pass, and the editor's bundle parser accepts it

#### Scenario: Curved glTF geometry bakes correct normals

- **WHEN** a glTF mesh contains smooth curved surfaces
- **THEN** the g-buffer stores interpolated per-pixel world-space normals of
  unit length on rendered pixels (not flat depth derivatives), and empty
  pixels remain all-zero

#### Scenario: Bundle with optional passes lists them in the manifest

- **WHEN** the user bakes with the render pass produced
- **THEN** the view's record additionally references its
  `<id>-render.png` entry alongside the environment and tonemap settings
  used

#### Scenario: Bundle without optional passes stays minimal

- **WHEN** the user bakes without the render pass
- **THEN** the bundle contains only manifest and g-buffer entries and is
  byte-convention-compatible with an albedo-era bundle apart from the
  missing albedo entry

#### Scenario: Legacy bundle with albedo and ao entries still opens

- **WHEN** the user opens a `/4` or `/5` bundle whose manifest still
  records albedo and ao passes
- **THEN** the bundle loads using its g-buffer (and render, when present)
  entries and the legacy entries are ignored

### Requirement: Bundle saves into the workspace

While a workspace is connected, the bake tool's bundle save SHALL write the
bundle into the workspace as `sprites/<id>.sprite` and report the save in
the status area; the bytes SHALL be the current `isoinfinity-bake/7` zip
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
