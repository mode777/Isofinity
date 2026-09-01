## Purpose

Authoring pipeline for Isofinity world assets: turn geometry sources (built-in
test primitives and glTF model files (GLB or glTF)) into per-pixel baked sprite passes
(sRGB albedo, world-space normal + linear-ray-depth g-buffer) packaged as a
manifest + zip bundle the runtime consumes.

## ADDED Requirements

### Requirement: Load glTF files as a bake source

The bake tool SHALL let the user select a glTF file — a self-contained
binary `.glb`, or a plain `.gltf` JSON with its external resources
(`.bin` buffers, texture images) — as an alternative to the built-in
primitives, parse it, and make it the active bake source shown in the tool.
For a `.gltf`, the user SHALL provide the referenced files together with it
(multi-select or drag-drop), and the tool SHALL resolve external resource
references against that provided file set. Parsed geometry SHALL consist of
all visible static mesh nodes in the file; skins, animation data, and
non-mesh nodes SHALL be ignored. The tool SHALL report skipped unsupported
content, missing external resources, and parse failures in the status area
without changing the previously active source.

#### Scenario: Valid GLB becomes the active source

- **WHEN** the user picks a `.glb` file containing static mesh nodes
- **THEN** the tool parses it, marks the glTF as the active source, and shows
  its name in the UI

#### Scenario: Multi-file .gltf resolves its external resources

- **WHEN** the user selects a `.gltf` together with its `.bin` buffer and
  texture image files
- **THEN** every external resource reference in the `.gltf` resolves against
  the provided files and the model becomes the active source

#### Scenario: Missing external resource is reported

- **WHEN** a selected `.gltf` references a `.bin` buffer or texture file that
  is not among the provided files
- **THEN** the status area names the missing file and the previously active
  source remains active

#### Scenario: Corrupt glTF is rejected without side effects

- **WHEN** the user picks a file that fails to parse as glTF
- **THEN** the status area shows a parse error and the previously active
  source remains active

#### Scenario: Unsupported content is skipped with a note

- **WHEN** the picked glTF contains skinned or animated nodes alongside
  static meshes
- **THEN** only the static meshes are used and the status area notes what was
  skipped

### Requirement: Loaded models bake textured albedo

For glTF sources the albedo pass SHALL be sampled per pixel from each
fragment's material: the base-color texture (when present) multiplied by the
material's base-color factor, in place of a single flat color — identical
for `.glb` and `.gltf` sources. Materials without a base-color texture
SHALL bake their base-color factor as the flat color. The stored albedo
SHALL remain sRGB-encoded, matching the primitive bakes.

#### Scenario: Multiple textured materials bake side by side

- **WHEN** a glTF contains two meshes with different base-color textures
- **THEN** the baked albedo pass shows pixels sampled from each mesh's own
  texture

#### Scenario: Untextured material uses its base color factor

- **WHEN** a glTF material has no base-color texture but a non-white
  base-color factor
- **THEN** the mesh's baked pixels are a flat color equal to that factor

### Requirement: Loaded model coverage respects material alpha

Baked coverage (albedo alpha) SHALL be 1 only where the fragment is kept.
Fragments from alpha-masked materials whose sampled alpha falls below the
material's alpha cutoff SHALL be discarded so their pixels read as empty
(background) in both passes, keeping hit-testing and occlusion correct.
Alpha-blended materials SHALL bake as opaque.

#### Scenario: Masked-out texels bake as empty pixels

- **WHEN** a glTF uses an alpha-mask material and part of its texture is below
  the alpha cutoff
- **THEN** the corresponding sprite pixels have coverage 0 and an all-zero
  g-buffer value

### Requirement: Loaded models are normalized into the asset box

A loaded glTF SHALL be translated so its bounding-box minimum corner sits at
the world origin `(0,0,0)`, with native glTF dimensions preserved. The tool
SHALL offer a uniform scale control; baking SHALL apply the scale around the
box minimum so the model still occupies the box from `(0,0,0)`, and the
manifest `size` SHALL record the scaled box extent.

#### Scenario: Offset model is pulled to the origin

- **WHEN** a glTF's vertices are positioned away from its own origin
- **THEN** the baked asset occupies the box from `(0,0,0)` to the model's
  bounding-box extent

#### Scenario: Scale control resizes the baked asset

- **WHEN** the user sets scale to 2 and bakes
- **THEN** the sprite is twice the linear pixel size and the manifest size
  equals twice the unscaled bounding box

### Requirement: glTF bakes emit standard bundles

A glTF bake SHALL produce the same outputs as a primitive bake — albedo PNG,
g-buffer EXR (rgb = world-space normal, a = linear ray depth against the
global reference plane), manifest with format `isoinfinity-bake/3`, single
zip bundle — readable by the runtime's bundle parser without modification.
The g-buffer normals SHALL come from the mesh geometry, not derived from
depth.

#### Scenario: glTF bundle downloads and validates

- **WHEN** the user bakes a glTF source and downloads the bundle
- **THEN** the zip contains a valid `isoinfinity-bake/3` manifest plus the
  albedo and g-buffer passes, and the runtime bundle parser accepts it

#### Scenario: Curved glTF geometry bakes correct normals

- **WHEN** a glTF mesh contains smooth curved surfaces
- **THEN** the g-buffer stores interpolated per-pixel world-space normals of
  unit length on rendered pixels (not flat depth derivatives), and empty
  pixels remain all-zero
