## MODIFIED Requirements

### Requirement: glTF bakes emit standard bundles

A glTF bake SHALL produce the same outputs as a primitive bake — albedo PNG,
g-buffer EXR (rgb = world-space normal, a = linear ray depth against the
global reference plane), manifest with format `isoinfinity-bake/5`, single
zip bundle — readable by the editor's bundle parser without modification.
The g-buffer normals SHALL come from the mesh geometry, not derived from
depth. The g-buffer EXR and albedo PNG SHALL follow exactly the byte-level
conventions of format `/3` and `/4`. When produced, the render and AO passes
SHALL be included as additional bundle entries (`<id>-render.png`, `<id>-ao.png`)
referenced by the manifest's pass table; the manifest SHALL record which
optional passes are present, and the environment/tonemap/renderer settings
used for them. The editor bundle parser SHALL accept both `/4` and `/5`
bundles; a `/4` or `/5` bundle MAY omit the optional passes.

#### Scenario: glTF bundle downloads and validates

- **WHEN** the user bakes a glTF source and downloads the bundle
- **THEN** the zip contains a valid `isoinfinity-bake/5` manifest plus the
  albedo and g-buffer passes, and the editor's bundle parser accepts it

#### Scenario: Curved glTF geometry bakes correct normals

- **WHEN** a glTF mesh contains smooth curved surfaces
- **THEN** the g-buffer stores interpolated per-pixel world-space normals of
  unit length on rendered pixels (not flat depth derivatives), and empty
  pixels remain all-zero

#### Scenario: Bundle with optional passes lists them in the manifest

- **WHEN** the user bakes with render and AO passes produced
- **THEN** the bundle additionally contains `<id>-render.png` and
  `<id>-ao.png` and the manifest's pass table references exactly those
  entries alongside the environment and tonemap settings used

#### Scenario: Bundle without optional passes stays minimal

- **WHEN** the user bakes without the render and AO passes
- **THEN** the bundle contains only manifest, albedo, and g-buffer entries
  and is byte-convention-compatible with a `/4` bundle apart from the
  format string

## ADDED Requirements

### Requirement: Bundles record provenance

An `isoinfinity-bake/5` manifest SHALL record how the sprite was produced:
the bake source (a built-in primitive identified by name, or a glTF model
referenced by its file name within the workspace's `models/` folder together
with the applied uniform scale), the path-trace settings used for the
optional passes (sample count, bounce count, texture size, AO samples and
radius), and the environment used for the render pass (the `.hdr`/`.exr`
file name within the workspace's `hdri/` folder, or a marker for the
built-in procedural environment, plus rotation, intensity, exposure, and
saturation). The provenance SHALL be written on every sprite save and
updated on re-bake.

#### Scenario: Model sprite records its source

- **WHEN** the user bakes `robot.glb` at scale 2 with an HDRI and saves the
  sprite
- **THEN** the saved manifest records the source as model `robot.glb` with
  scale 2, the path-trace settings used, and the HDRI file name with its
  environment settings

#### Scenario: Primitive sprite records its source

- **WHEN** the user bakes the built-in donut with the procedural
  environment and saves the sprite
- **THEN** the saved manifest records the source as the donut primitive and
  the environment as the procedural one

### Requirement: Sprites re-bake from recorded provenance

Opening a `isoinfinity-bake/5` sprite SHALL restore its recorded source,
bake settings, and environment into a sprite document so the user can edit
them and re-bake in place. Re-baking SHALL re-read the referenced model
from the connected workspace's `models/` folder (at the recorded scale) and
the referenced environment from `hdri/`, re-run the selected passes with
the recorded (or edited) settings, and replace the document's passes;
saving SHALL write an updated `/5` bundle. When a referenced model or
environment file is missing — or the workspace is not connected — the
sprite SHALL open view-only (passes visible, save/export available) with a
named status message naming the missing reference.

#### Scenario: Re-bake applies edited settings

- **WHEN** the user opens a `/5` sprite, raises the render sample count,
  and re-bakes
- **THEN** the render pass re-accumulates from the sprite's recorded source
  and environment with the new sample count, and saving writes the new
  settings into the manifest

#### Scenario: Missing model degrades to view-only

- **WHEN** the user opens a `/5` sprite whose referenced model file no
  longer exists in `models/`
- **THEN** the sprite's passes are shown view-only and the status area
  names the missing model file

#### Scenario: Format /4 opens view-only

- **WHEN** the user opens an `isoinfinity-bake/4` bundle
- **THEN** its passes are shown view-only with a status note that it has no
  provenance to re-bake from
