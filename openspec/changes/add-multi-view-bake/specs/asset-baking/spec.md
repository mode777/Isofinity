## MODIFIED Requirements

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
(N/E/S/W) and its camera azimuth. The provenance SHALL be written on every
sprite save and updated on re-bake.

#### Scenario: Model sprite records its source

- **WHEN** the user bakes `robot.glb` at scale 2 with an HDRI into the N
  and E views and saves the sprite
- **THEN** the saved manifest records the source as model `robot.glb` with
  scale 2, the path-trace settings used, the HDRI file name with its
  environment settings, and both views with their slots and camera
  azimuths

#### Scenario: Primitive sprite records its source

- **WHEN** the user bakes the built-in donut with the procedural
  environment and saves the sprite
- **THEN** the saved manifest records the source as the donut primitive,
  the environment as the procedural one, and the stored views with their
  camera azimuths

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

## ADDED Requirements

### Requirement: View slots rotate the bake camera in fixed 90° steps

The bake tool SHALL offer four fixed view slots per sprite document — N, E,
S, W. N SHALL be the default slot and SHALL use the existing fixed
isometric camera unchanged. E, S and W SHALL rotate that camera about the
world's vertical axis through the asset box in successive 90° yaw steps in
one fixed direction; elevation, orthographic projection, framing rules
(padded projected box at the bake's pixels-per-unit) and the asset box
itself SHALL stay identical across slots, so a slot's sprite rect is
derived per slot and MAY differ in pixel dimensions between slots. A
slot's g-buffer and render pass SHALL be baked against the same slot
camera and stay pixel-aligned with each other.

#### Scenario: East view rotates the camera a quarter turn

- **WHEN** the user bakes the same source into the N and E slots
- **THEN** the E slot's passes show the asset as seen from 90° of yaw away
  from the N camera, with identical elevation and projection

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
(N/E/S/W), its camera azimuth, and its sprite rect (pixel dimensions,
origin, pixels-per-unit). A saved bundle with passes SHALL always contain
the N view; E, S and W MAY be absent. The N view's pass entries SHALL keep
the historical entry naming; additional views' entries SHALL be
distinguishable per view. Older `/4` and `/5` bundles SHALL be read as
single-view (N) sprites.

#### Scenario: Bundle with extra views lists each view

- **WHEN** the user saves a document with N and E baked
- **THEN** the bundle contains separate pass entries for each view and the
  manifest records both views with their slots, camera azimuths and sprite
  rects

#### Scenario: Bundle without extra views stays north-only

- **WHEN** the user saves a document where only N is baked
- **THEN** the bundle's view table records only N and its entries use the
  historical naming

#### Scenario: Older formats read as single-view

- **WHEN** the editor opens a `/4` or `/5` bundle
- **THEN** its passes load as the N view and no other slot holds passes
