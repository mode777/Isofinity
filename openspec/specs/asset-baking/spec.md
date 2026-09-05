## Purpose

Authoring pipeline for Isofinity world assets: turn geometry sources (built-in
test primitives and glTF model files (GLB or glTF)) into per-pixel baked sprite passes
(world-space normal + linear-ray-depth g-buffer, plus the optional path-traced
lit render pass) packaged as a manifest + zip bundle the runtime consumes.

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
### Requirement: Loaded model coverage respects material alpha

Baked coverage SHALL be 1 only where the fragment is kept. Fragments from
alpha-masked materials whose sampled alpha falls below the material's alpha
cutoff SHALL be discarded at bake time so their pixels read as empty
(background) in every stored pass: an all-zero g-buffer value (zero-length
normal) and alpha 0 in the render pass when present, keeping hit-testing and
occlusion correct. Alpha-blended materials SHALL bake as opaque.

#### Scenario: Masked-out texels bake as empty pixels

- **WHEN** a glTF uses an alpha-mask material and part of its texture is below
  the alpha cutoff
- **THEN** the corresponding sprite pixels have an all-zero g-buffer value
  and, when the render pass is present, alpha 0
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

A glTF bake SHALL produce the same outputs as a primitive bake — g-buffer
EXR (rgb = world-space normal, a = linear ray depth against the global
reference plane), manifest with format `isoinfinity-bake/6`, single zip
bundle — readable by the editor's bundle parser without modification. The
g-buffer normals SHALL come from the mesh geometry, not derived from depth.
The g-buffer EXR SHALL follow exactly the byte-level conventions of format
`/3`, `/4` and `/5`. Each stored view contributes its own pass entries per
the multi-view format requirement; the N view's entries keep the
historical naming (`<id>-gbuffer.exr`, `<id>-render.png`). When produced,
a view's render pass SHALL be included as an additional bundle entry
referenced by that view's record in the manifest; the manifest SHALL
record which optional passes each view carries and the
environment/tonemap/renderer settings used for them. The editor bundle
parser SHALL accept `/4`, `/5` and `/6` bundles, SHALL require only the N
view's g-buffer entry, and SHALL ignore pass entries recorded by older
manifests that it no longer consumes (for example albedo or ao); a `/4`,
`/5` or `/6` bundle MAY omit the optional passes.

#### Scenario: glTF bundle downloads and validates

- **WHEN** the user bakes a glTF source and downloads the bundle
- **THEN** the zip contains a valid `isoinfinity-bake/6` manifest plus the
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
### Requirement: Bake renders a path-traced lit render pass

The bake tool SHALL be able to render the active source through a path-traced
renderer into an additional `render` pass: a fully lit beauty image produced
with the same fixed isometric orthographic camera and the same projected
sprite rectangle as the raster g-buffer pass, so the render pass aligns
pixel-for-pixel with the g-buffer pass. Background pixels (no geometry)
SHALL be transparent (alpha 0) and camera rays that miss the asset SHALL not
contribute any background image or color into the pass. The render pass SHALL
be tone-mapped (ACES filmic) and sRGB-encoded before storage, and the
downloaded PNG SHALL be pixel-identical to the on-screen preview of that
pass. Progressive accumulation SHALL be deterministic for a fixed sample
count and seed.

#### Scenario: Render pass aligns with the raster passes

- **WHEN** the user bakes a source with the render pass enabled
- **THEN** the render pass has the same pixel dimensions as the g-buffer
  pass and object pixels land at the same pixel coordinates in both passes

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
still bake the g-buffer, and simply not produce the render pass.

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
### Requirement: Render stage consumes full PBR materials

The path-traced render stage SHALL consume the complete material description
of each draw group — the base-color texture (when present) multiplied by the
base-color factor, metallic-roughness values/textures, and normal maps where
present — instead of a single flat color, identical for `.glb` and `.gltf`
sources. Materials without a base-color texture SHALL render their
base-color factor as the flat color. Alpha-mask materials SHALL apply their
cutoff in the render pass so masked-out texels read as transparent there,
matching g-buffer emptiness.

#### Scenario: Textured materials render side by side

- **WHEN** a glTF contains two meshes with different base-color textures and
  the render pass is baked
- **THEN** the rendered image shows pixels sampled from each mesh's own
  texture multiplied by its base-color factor

#### Scenario: Untextured material uses its base color factor

- **WHEN** a glTF material has no base-color texture but a non-white
  base-color factor
- **THEN** the mesh's rendered pixels are a flat color derived from that
  factor

#### Scenario: Metallic materials reflect the environment

- **WHEN** a glTF material declares high metallic value and the render pass
  is baked with an HDRI
- **THEN** the material's pixels mirror environment lighting like a metal
  rather than a flat diffuse color

#### Scenario: Masked texels stay empty in the render pass

- **WHEN** an alpha-mask material is rendered into the render pass
- **THEN** texels below the alpha cutoff are transparent in the render pass
  just as they have an all-zero g-buffer value
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

An `isoinfinity-bake/6` manifest SHALL record how the sprite was produced:
the bake source (a built-in primitive identified by name, or a glTF model
referenced by its file name within the workspace's `models/` folder
together with the applied uniform scale), the path-trace settings used for
the optional render passes (sample count, bounce count, texture size), and
the environment used for them (the `.hdr`/`.exr` file name within the
workspace's `hdri/` folder, or a marker for the built-in procedural
environment, plus rotation, intensity, exposure, and saturation). The
manifest SHALL additionally record the stored views: for each, its slot
(N/E/S/W) and its view azimuth. The provenance SHALL be written on every
sprite save and updated on re-bake.

#### Scenario: Model sprite records its source

- **WHEN** the user bakes `robot.glb` at scale 2 with an HDRI into the N
  and E views and saves the sprite
- **THEN** the saved manifest records the source as model `robot.glb` with
  scale 2, the path-trace settings used, the HDRI file name with its
  environment settings, and both views with their slots and view
  azimuths

#### Scenario: Primitive sprite records its source

- **WHEN** the user bakes the built-in donut with the procedural
  environment and saves the sprite
- **THEN** the saved manifest records the source as the donut primitive,
  the environment as the procedural one, and the stored views with their
  view azimuths
### Requirement: Sprites re-bake from recorded provenance

Opening an `isoinfinity-bake/6` sprite SHALL restore its recorded source,
bake settings, environment, and stored views (each with its passes) into a
sprite document so the user can edit them and re-bake in place.
Re-baking SHALL re-read the referenced model from the connected workspace's
`models/` folder (at the recorded scale) and the referenced environment
from `hdri/`, re-run the selected passes for the selected view with the
recorded (or edited) settings, and replace that view's passes; saving
SHALL write an updated `/6` bundle. A `/5` bundle SHALL open editable as a
single-view (N) sprite. Provenance recorded by older manifests MAY carry
settings the pass set no longer has (for example AO samples and radius);
the editor SHALL ignore those fields. When a referenced model or
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
### Requirement: Height-based proportional scaling of model sources

A sprite document whose source is a loaded glTF model SHALL offer a height
input in meters alongside the uniform scale control. Entering a desired
height SHALL derive the uniform scale as the desired height divided by the
model's native bounding-box Y extent (the model's height in native file
units), so the model's other axes scale proportionally and the baked model
stands the requested height tall in world units. The panel SHALL display
the model's native height (and, where known, native box extent) in file
units next to the input. The height input and the raw scale control SHALL
stay in sync: editing either updates the other's displayed value. The
meters value SHALL NOT be persisted — provenance continues to record the
derived uniform scale — so re-bake from provenance and bundle saves are
unchanged. The height input SHALL appear only while the document holds the
loaded source model (its native extent); it SHALL appear again after a
provenance re-bake reloads the model, showing the height implied by the
recorded scale.

#### Scenario: Desired height derives the scale

- **WHEN** the user enters `2` meters as the height of a model whose native
  Y extent is `1.8` file units and bakes
- **THEN** the bake applies the uniform scale `2 / 1.8`, the baked model's
  box is `2` units tall in Y, and its X and Z extents scale by the same
  factor

#### Scenario: Height and scale rows stay in sync

- **WHEN** the user sets the raw scale to `2` after entering a height
- **THEN** the height row shows the height implied by that scale, and
  editing the height again updates the scale row to match

#### Scenario: Native height is shown in file units

- **WHEN** a model source is loaded into the sprite document
- **THEN** the properties panel shows the model's native height in file
  units, labelled as file units rather than meters

#### Scenario: Height is not persisted

- **WHEN** the user sizes a model via the height input, saves the sprite,
  and later re-bakes it from provenance
- **THEN** the provenance records only the derived uniform scale, and the
  re-baked sprite matches the saved one exactly

#### Scenario: Height input without the loaded source

- **WHEN** the user opens a sprite bundle whose model file is missing
  (view-only)
- **THEN** no height input is offered, and after a re-bake that restores
  the source model the height input appears showing the height implied by
  the recorded scale
### Requirement: Height input warns before the sprite pixel cap

The properties panel SHALL show, next to the height input, the sprite pixel
size the current scale bakes to at the bake's fixed pixels-per-unit, and
SHALL warn when that size exceeds the bake's sprite pixel cap — before the
user commits to a bake that fails. Baking an oversized sprite SHALL still
fail with the existing named error if attempted.

#### Scenario: Resulting sprite size is previewed

- **WHEN** the user enters a height that bakes to a sprite within the cap
- **THEN** the panel shows the resulting sprite pixel size and no warning

#### Scenario: Oversized height warns

- **WHEN** the user enters a height whose resulting sprite pixel size
  exceeds the cap
- **THEN** the panel warns that the bake would exceed the sprite pixel cap
  and names the offending pixel size, and the bake fails with its existing
  cap error if run anyway
### Requirement: View slots rotate the view in fixed 90° steps

The bake tool SHALL offer four fixed view slots per sprite document — N, E,
S, W. N SHALL be the default slot and SHALL show the asset unrotated. E, S
and W SHALL present the asset rotated about the world's vertical axis
through the asset box in successive 90° yaw steps in one fixed direction.
Every slot SHALL render from the existing fixed isometric camera:
elevation, orthographic projection, framing rules (padded projected box at
the bake's pixels-per-unit) and the origin anchor stay unchanged, with each
slot's sprite rect derived from its rotated box and MAY therefore differ in
pixel dimensions between slots. The passes of every slot SHALL store the
rotated asset's world-space data — g-buffer normals and depth as if the
asset stood rotated in the world, and the render pass lit by the
environment as placed — so a view can be used facing its direction without
per-placement rotation. A slot's g-buffer and render pass SHALL be baked
against the same slot presentation and stay pixel-aligned with each other.

#### Scenario: East view presents the model rotated a quarter turn

- **WHEN** the user bakes the same source into the N and E slots
- **THEN** the E slot's passes show the asset as if rotated 90° about the
  vertical axis relative to the N view, and its stored normals are the
  rotated asset's world normals

#### Scenario: Slot framing is derived per slot

- **WHEN** an asset's projected footprint differs between two slots
- **THEN** each slot's sprite rect frames its own projected footprint with
  the same padding rule, and the two slots may have different pixel
  dimensions

#### Scenario: Slot passes stay pixel-aligned

- **WHEN** a slot is baked with both the g-buffer and the render pass
- **THEN** both passes have the slot's pixel dimensions and object pixels
  land at the same coordinates in both
### Requirement: Each view slot bakes individually

The sprite document's bake action SHALL apply to the currently selected
view slot: baking a slot SHALL produce that slot's g-buffer and — when the
document's environment allows it — its path-traced render pass from the
document's current source and settings, replacing any passes previously
stored for that slot. Passes stored in other slots SHALL be left
untouched. A slot that has never been baked SHALL hold no passes; the N
slot behaves exactly as the single-view bake did before this change.

#### Scenario: Baking one slot leaves the others alone

- **WHEN** the user bakes the E slot of a document whose N and W slots
  already hold baked passes
- **THEN** the E slot holds fresh passes and the N and W passes are
  byte-unchanged

#### Scenario: Re-baking a slot replaces only that slot

- **WHEN** the user re-bakes the S slot after changing the render sample
  count
- **THEN** only the S slot's passes are replaced; the other slots keep
  their previously baked passes

#### Scenario: Empty slot holds no passes

- **WHEN** a document's W slot has never been baked
- **THEN** the document stores no passes for W and the slot is reported as
  not baked
### Requirement: Bake All batch-bakes every view slot

The bake tool SHALL offer a batch action that bakes all four view slots in
N, E, S, W order, one after another, each from the document's current
source, settings, and environment: slots without baked passes are created
by the batch and existing slots are re-baked. Each slot's bake SHALL
behave exactly like an individual bake of that slot. If a slot's bake
fails, the batch SHALL stop at that slot with a named error while the
slots already baked keep their passes.

#### Scenario: Batch bakes all four slots in order

- **WHEN** the user runs the batch action on a document where only N is
  baked
- **THEN** E, S and W are baked in that order after N, each with the
  document's current settings, and all four slots hold passes

#### Scenario: Batch re-bakes existing views too

- **WHEN** the user runs the batch action on a document where all four
  slots are baked
- **THEN** every slot's passes are replaced in N, E, S, W order

#### Scenario: Failed slot ends the batch

- **WHEN** a slot's bake fails partway through the batch
- **THEN** the batch stops with a named error, the failed slot holds no
  new passes, and the slots baked before the failure keep theirs
### Requirement: Views can be removed except the default

The bake tool SHALL let the user discard the baked passes of any selected
slot except N. Removing a slot SHALL delete exactly that slot's passes
from the document and from the next bundle save; the N slot SHALL NOT be
removable.

#### Scenario: Removing a slot drops only its passes

- **WHEN** the user removes the E slot of a fully baked document
- **THEN** the E slot holds no passes afterwards while N, S and W keep
  theirs, and the next save omits the E view

#### Scenario: North cannot be removed

- **WHEN** the N slot is selected
- **THEN** the remove action is unavailable for it
### Requirement: Bundle format /6 stores per-view passes and cameras

An `isoinfinity-bake/6` bundle SHALL be a single zip containing the
manifest plus, for every stored view, that view's g-buffer entry and —
when produced — its render entry, each referenced from that view's record
in the manifest. The manifest SHALL record per stored view: its slot
(N/E/S/W), its view azimuth (the slot's 90° step from north), and its
sprite rect (pixel dimensions,
origin, pixels-per-unit). A saved bundle with passes SHALL always contain
the N view; E, S and W MAY be absent. The N view's pass entries SHALL keep
the historical entry naming; additional views' entries SHALL be
distinguishable per view. Older `/4` and `/5` bundles SHALL be read as
single-view (N) sprites.

#### Scenario: Bundle with extra views lists each view

- **WHEN** the user saves a document with N and E baked
- **THEN** the bundle contains separate pass entries for each view and the
  manifest records both views with their slots, view azimuths and sprite
  rects

#### Scenario: Bundle without extra views stays north-only

- **WHEN** the user saves a document where only N is baked
- **THEN** the bundle's view table records only N and its entries use the
  historical naming

#### Scenario: Older formats read as single-view

- **WHEN** the editor opens a `/4` or `/5` bundle
- **THEN** its passes load as the N view and no other slot holds passes
### Requirement: Bake projection's clip volume includes the whole model

The bake's fixed isometric orthographic projection SHALL derive its depth
clip planes from the model's projected extent, so the projection's clip
volume always contains the whole model: every part of the source geometry
that the lateral framing already includes SHALL lie strictly between the
near and far planes, in every view slot. Baked passes SHALL show no geometry
missing due to near- or far-plane clipping, at any model size within the
sprite pixel cap. The clip planes are a projection detail only: lateral
framing (padded projected box at the bake's pixels-per-unit), sprite rect,
origin anchor, camera angles, stored depth definition, and pass alignment
SHALL stay unchanged, so a model that already fit the previous clip volume
SHALL bake byte-identical passes.

#### Scenario: Deep model bakes without near-plane clipping

- **WHEN** the user bakes a model whose depth extent along the view
  direction reaches past the previous fixed clip slab
- **THEN** the baked passes contain every part of the model that the
  lateral framing includes, with no geometry clipped away by the near or
  far plane

#### Scenario: Clip planes scale with the model per view slot

- **WHEN** the same large model is baked into multiple view slots
- **THEN** each slot's projection contains its rotated model's full extent,
  and no slot's passes clip geometry that its lateral framing includes

#### Scenario: Small models bake unchanged

- **WHEN** a model is baked whose extent already fit the previous clip
  volume
- **THEN** the baked passes are identical to those of a bake before this
  requirement, with the same sprite rect, origin and pixel alignment
  between passes
