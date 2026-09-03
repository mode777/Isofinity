## Purpose

Authoring pipeline for Isofinity world assets: turn geometry sources (built-in
test primitives and glTF model files (GLB or glTF)) into per-pixel baked sprite passes
(sRGB albedo, world-space normal + linear-ray-depth g-buffer, plus optional
path-traced lit render and ambient-occlusion passes) packaged as a manifest +
zip bundle the runtime consumes.

## Requirements

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

### Requirement: Bake renders a path-traced lit render pass

The bake tool SHALL be able to render the active source through a path-traced
renderer into an additional `render` pass: a fully lit beauty image produced
with the same fixed isometric orthographic camera and the same projected
sprite rectangle as the raster passes, so the render pass aligns pixel-for-
pixel with the albedo and g-buffer passes. Background pixels (no geometry)
SHALL be transparent (alpha 0) and camera rays that miss the asset SHALL not
contribute any background image or color into the pass. The render pass SHALL
be tone-mapped (ACES filmic) and sRGB-encoded before storage, and the
downloaded PNG SHALL be pixel-identical to the on-screen preview of that
pass. Progressive accumulation SHALL be deterministic for a fixed sample
count and seed.

#### Scenario: Render pass aligns with the raster passes

- **WHEN** the user bakes a source with the render pass enabled
- **THEN** the render pass has the same pixel dimensions as the albedo and
  g-buffer passes and object pixels land at the same pixel coordinates in
  all passes

#### Scenario: Background stays transparent

- **WHEN** the render pass is produced with no background image visible
- **THEN** pixels not covered by geometry are fully transparent while lit
  object pixels are opaque

#### Scenario: Export matches the preview

- **WHEN** the user downloads the render pass after inspecting it on screen
- **THEN** the exported PNG equals the tone-mapped, sRGB-encoded image shown
  in the preview

### Requirement: HDRI environment lights the render pass

The bake tool SHALL let the user load equirectangular HDR environment files
(`.hdr`) and use the selected environment as the sole illumination source for
the render pass. The tool SHALL provide controls to rotate the environment,
scale its intensity, and set the exposure applied at tone-mapping; changing
any of them SHALL restart the render pass accumulation. Loading an invalid
environment file SHALL produce a named error in the status area and keep the
previously active environment. Without an active environment the tool SHALL
still bake albedo and g-buffer, and simply not produce render/AO passes.

#### Scenario: Environment illuminates the render

- **WHEN** the user loads an HDRI and enables the render pass
- **THEN** the baked image shows environment lighting and reflections
  consistent with that HDRI

#### Scenario: Controls re-render

- **WHEN** the user rotates the environment or changes intensity or exposure
- **THEN** the render pass restarts accumulation and converges to the new
  lighting

#### Scenario: Invalid HDRI is rejected

- **WHEN** the user selects a file that fails to parse as an equirectangular
  HDR environment
- **THEN** the status area names the error and the previous environment
  stays active

### Requirement: Bake can produce a path-traced ambient occlusion pass

The bake tool SHALL be able to render an additional optional `ao` pass:
monochrome ambient occlusion computed by tracing rays against the asset
geometry, with white meaning unoccluded and black fully occluded. The AO
pass SHALL use the same camera and sprite rectangle as the other passes,
SHALL be controllable by an occlusion radius and sample count, and SHALL
not require an environment. Background pixels SHALL be transparent.

#### Scenario: Crevices bake darker

- **WHEN** an asset with concave features (e.g. the donut) bakes with the
  AO pass enabled
- **THEN** pixels in creases and contact areas are darker than exposed
  pixels, converging with more samples

#### Scenario: AO bakes without an environment

- **WHEN** the user enables the AO pass with no HDRI loaded
- **THEN** the AO pass is produced while the render pass is not

### Requirement: Render stage consumes full PBR materials

The path-traced render and AO stages SHALL consume the complete material
description of each draw group — base-color texture multiplied by base-color
factor, metallic-roughness values/textures, and normal maps where present —
instead of the base-color-only subset the raster passes use. Alpha-mask
materials SHALL apply their cutoff in the render pass so masked-out texels
read as transparent there, matching raster coverage. The raster albedo and
g-buffer passes SHALL remain unchanged by this requirement.

#### Scenario: Metallic materials reflect the environment

- **WHEN** a glTF material declares high metallic value and the render pass
  is baked with an HDRI
- **THEN** the material's pixels mirror environment lighting like a metal
  rather than a flat diffuse color

#### Scenario: Masked texels stay empty in the render pass

- **WHEN** an alpha-mask material is rendered into the render pass
- **THEN** texels below the alpha cutoff are transparent in the render pass
  just as they have zero coverage in the raster passes

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
