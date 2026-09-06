## MODIFIED Requirements

### Requirement: View slots rotate the view in fixed 90° steps

The bake tool SHALL offer four fixed view slots per sprite document — N, E,
S, W. N SHALL be the default slot and SHALL show the asset unrotated. E, S
and W SHALL present the asset rotated about the world's vertical axis
through the asset box in successive 90° yaw steps in one fixed direction.
Every slot SHALL render from the existing fixed isometric camera:
elevation, orthographic projection and framing rules (padded projected box
at the bake's pixels-per-unit) stay unchanged, with each slot's sprite rect
derived from its rotated box and MAY therefore differ in pixel dimensions
between slots. Each slot's origin anchor SHALL be the document's origin
point expressed in that slot's rotated asset frame: the N slot anchors at
the authored origin point, and every other slot SHALL derive its anchor
automatically as the same physical point of the asset rotated by the slot's
yaw — so all slots anchor the same spot of the asset and none is authored
directly. The passes of every slot SHALL store the rotated asset's
world-space data — g-buffer normals and depth as if the asset stood rotated
in the world, and the render pass lit by the environment as placed — so a
view can be used facing its direction without per-placement rotation. A
slot's g-buffer and render pass SHALL be baked against the same slot
presentation and stay pixel-aligned with each other.

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

#### Scenario: Derived slots anchor the same asset point

- **WHEN** the user authors a custom origin in the N view and bakes the N
  and E slots
- **THEN** each slot's recorded origin marks the same physical point of the
  asset — the E slot's anchor being the authored point rotated by the
  slot's yaw into the rotated asset's frame — without the user setting
  anything for E

### Requirement: Bundles record provenance

An `isoinfinity-bake/6` manifest SHALL record how the sprite was produced:
the bake source (a built-in primitive identified by name, or a glTF model
referenced by its file name within the workspace's `models/` folder
together with the applied uniform scale), the path-trace settings used for
the optional render passes (sample count, bounce count, texture size, tile
grid), and the environment used for them (the `.hdr`/`.exr` file name within the
workspace's `hdri/` folder, or a marker for the built-in procedural
environment, plus rotation, intensity, exposure, and saturation). The
provenance SHALL additionally record the sprite's origin anchor point — a
3D coordinate in the N view's asset space relative to the box min corner —
whenever it differs from the default box min corner; a sprite anchored at
the default MAY omit it. The manifest SHALL additionally record the stored
views: for each, its slot (N/E/S/W) and its view azimuth. The provenance
SHALL be written on every sprite save and updated on re-bake.

#### Scenario: Model sprite records its source

- **WHEN** the user bakes `robot.glb` at scale 2 with an HDRI into the N
  and E views and saves the sprite
- **THEN** the saved manifest records the source as model `robot.glb` with
  scale 2, the path-trace settings used (including the tile grid), the HDRI
  file name with its environment settings, and both views with their slots
  and view azimuths

#### Scenario: Primitive sprite records its source

- **WHEN** the user bakes the built-in donut with the procedural
  environment and saves the sprite
- **THEN** the saved manifest records the source as the donut primitive,
  the environment as the procedural one, and the stored views with their
  view azimuths

#### Scenario: Provenance without a tile grid still opens

- **WHEN** the user opens a sprite whose provenance predates the tile grid
  field
- **THEN** the sprite opens editable with its recorded settings restored
  and re-baking derives the tile grid from the frame size

#### Scenario: Custom anchor persists in the manifest

- **WHEN** the user sets a custom origin, bakes, and saves the sprite
- **THEN** the saved manifest's provenance records the origin point as a 3D
  coordinate in the N view's asset space

#### Scenario: Default anchor omits the field

- **WHEN** the user saves a sprite whose origin is the box min corner
- **THEN** the manifest's provenance carries no origin field and the bundle
  is byte-compatible with a pre-existing save of the same passes

### Requirement: Sprites re-bake from recorded provenance

Opening an `isoinfinity-bake/6` sprite SHALL restore its recorded source,
bake settings, environment, origin anchor, and stored views (each with its
passes) into a sprite document so the user can edit them and re-bake in
place. Re-baking SHALL re-read the referenced model from the connected
workspace's `models/` folder (at the recorded scale) and the referenced
environment from `hdri/`, re-run the selected passes for the selected view
with the recorded (or edited) settings, and replace that view's passes;
saving SHALL write an updated `/6` bundle. A restored custom origin SHALL
apply to re-bakes: every re-baked view anchors at the derived point for its
slot. A `/5` bundle SHALL open editable as a single-view (N) sprite.
Provenance recorded by older manifests MAY carry settings the pass set no
longer has (for example AO samples and radius); the editor SHALL ignore
those fields. Provenance without an origin field SHALL restore the default
box-min-corner anchor. When a referenced model or environment file is
missing — or the workspace is not connected — the sprite SHALL open
view-only (the passes of every stored view visible, save/export available)
with a named status message naming the missing reference.

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

### Requirement: The sprite origin anchor is settable in the north view

The sprite editor's properties panel SHALL offer an origin control for the
document: three numeric inputs (X/Y/Z, in asset-space world units measured
from the box min corner of the source's unrotated box) and a convenience
button that sets the origin to the center of the ground plane — half the
box's X and Z extent at ground level (Y = 0). The inputs SHALL be editable
only while the N slot is active; other slots SHALL present the value
non-editably with a hint that the origin is set in the north view.
Non-finite input SHALL be rejected and values SHALL clamp into the box
extent per axis, so the anchor stays on the asset. Editing the origin SHALL
update every baked view's recorded origin immediately — without requiring a
re-bake, since the passes do not depend on the anchor — and SHALL mark the
document dirty. A new document SHALL default to the box min corner, and
changing the uniform scale of a model source SHALL rescale the origin
proportionally so it keeps marking the same relative spot of the asset. The
viewport's bounding-box overlay SHALL mark the current origin point with
its origin cross.

#### Scenario: Ground-center button

- **WHEN** the user presses the ground-center button on a document whose
  source box is 2×1×0.5 (after scale)
- **THEN** the origin inputs show (1, 0, 0.25)

#### Scenario: Inputs clamp into the box

- **WHEN** the user enters an X beyond the box extent, or non-numeric text
- **THEN** the value clamps to the box extent in that axis, or is rejected,
  and the stored origin stays finite and inside the box

#### Scenario: Origin edit takes effect without a re-bake

- **WHEN** the user edits the origin on a fully baked document and saves
  the bundle without re-baking
- **THEN** the saved bundle's per-view origins reflect the new anchor and
  the stored passes are pixel-identical to before the edit

#### Scenario: Origin editing is north-only

- **WHEN** the user selects the E slot
- **THEN** the origin inputs are not editable and point to the north view
  for editing

#### Scenario: Scale change keeps the relative anchor

- **WHEN** the user doubles the uniform scale of a model document that has
  a custom origin
- **THEN** the origin doubles with the box so it keeps marking the same
  relative spot of the asset

#### Scenario: Overlay cross marks the anchor

- **WHEN** the bounding-box overlay is shown for a document with a custom
  origin
- **THEN** the overlay's origin cross sits at the projected origin point
  rather than at the box corner
