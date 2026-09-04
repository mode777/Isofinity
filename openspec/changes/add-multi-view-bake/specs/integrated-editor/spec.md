## MODIFIED Requirements

### Requirement: Sprite editor toolbar

A sprite editor SHALL render a toolbar above its content offering Save, the
render pass action, Bake All, Remove view, and Place in world. The render
pass action SHALL first bake the raster g-buffer pass (world-space normals
+ linear ray depth) from the document's current source and settings, then
accumulate the path-traced render pass against that g-buffer, so the two
passes stay pixel-aligned and current without a separate bake action; both
passes are produced for the view slot currently selected in the viewport
(N by default), as specified by the asset-baking capability. Bake All
SHALL batch-bake all four view slots in N, E, S, W order as specified by
the asset-baking capability, switching the viewport to each slot as its
passes are produced, and SHALL be disabled for view-only documents and
while a pass accumulates. Remove view SHALL discard the baked passes of
the selected slot and SHALL be unavailable for the N slot, for slots
without baked passes, for view-only documents, and while a pass
accumulates. The render pass action SHALL be disabled for view-only
documents and while a render pass is accumulating, and its label SHALL
reflect state (Render pass, Re-render pass once a rendered pass exists,
Rendering… while busy). Progress and completion SHALL be reported through
the status bar. Save SHALL prompt for a file name, offering the document's
current name as the default; cancelling the prompt SHALL abort the save
without writing a file or clearing the dirty state. With a workspace
connected, Save SHALL write the bundle to the workspace's `sprites/`
folder under the chosen name; without a connection it SHALL fall back to
downloading the bundle. Place in world SHALL behave as specified by the
placement requirement (target an open world tab or create a new world).

#### Scenario: Save prompts with the current name

- **WHEN** the user activates Save in a sprite editor whose document was
  opened from `robot.sprite`
- **THEN** the prompt is prefilled with `robot` (or `robot.sprite`), and
  accepting it writes the bundle to `sprites/` under that name when a
  workspace is connected

#### Scenario: Cancelling the save prompt saves nothing

- **WHEN** the user cancels the file-name prompt
- **THEN** no file is written or downloaded and the document stays dirty

#### Scenario: Save falls back to download without a workspace

- **WHEN** the user saves a sprite document with no workspace connected
- **THEN** the bundle downloads as a `.sprite` file instead of failing

#### Scenario: Place in world from the toolbar

- **WHEN** the user activates Place in world on a baked sprite document
- **THEN** the sprite becomes a placeable layer in the active world
  document (or a new world when none is open), with no bundle file written

#### Scenario: Render action bakes the g-buffer first

- **WHEN** the user changes a model source's uniform scale and activates
  the render pass action
- **THEN** the g-buffer is re-baked at the new scale and the render pass
  accumulates against it, with both passes pixel-aligned and no separate
  bake button used

#### Scenario: Render action bakes the selected slot

- **WHEN** the user selects the E slot in the viewport and activates the
  render pass action
- **THEN** the E slot's g-buffer and render pass are produced and the
  other slots' passes are untouched

#### Scenario: Render action reflects its state

- **WHEN** a render pass is accumulating
- **THEN** the toolbar action reads "Rendering…" and is disabled until the
  pass finishes, and progress appears in the status bar

#### Scenario: View-only documents cannot render

- **WHEN** a view-only sprite tab is active
- **THEN** the toolbar's render pass action is disabled

#### Scenario: Bake All works through every slot

- **WHEN** the user activates Bake All on a document where only N is baked
- **THEN** the viewport shows each slot in turn as its passes are produced
  (N, E, S, W) and all four slots hold baked passes afterwards

#### Scenario: Remove view is unavailable for north and empty slots

- **WHEN** the N slot is selected, or the selected slot holds no baked
  passes
- **THEN** Remove view is disabled; selecting a non-N slot with baked
  passes enables it and activating it discards that slot's passes

### Requirement: Only explicit bake actions bake or render

Editing a properties-panel control SHALL update the active document's
state only: no input other than the sprite editor toolbar's render pass
and Bake All actions SHALL trigger a raster bake or a path-traced render
pass. The render pass action includes its implicit raster g-buffer bake as
specified by the sprite editor toolbar requirement. Opening a resource
SHALL keep performing its initial bake. When an input makes an in-flight
render pass stale, the pass SHALL be discarded — not restarted — and the
document SHALL stay usable for an explicit re-render.

#### Scenario: Environment slider change does not render

- **WHEN** the user changes the rotation, intensity, exposure, or
  saturation on a sprite tab whose document already has a rendered pass
- **THEN** the value is stored in the document and no render pass starts

#### Scenario: HDRI load does not render

- **WHEN** the user loads an HDRI file or picks one from the workspace's
  `hdri/` listing
- **THEN** it becomes the document's active environment and no render pass
  starts

#### Scenario: Model scale change does not bake

- **WHEN** the user changes a model source's uniform scale
- **THEN** the document's scale value updates and no bake runs until the
  next render pass action, which re-bakes the g-buffer implicitly

#### Scenario: Changing an input discards an in-flight render

- **WHEN** a render pass is accumulating and the user changes a bake
  setting, environment parameter, HDRI, or preset
- **THEN** the in-flight pass is discarded, the document leaves the busy
  state, and no new pass starts

#### Scenario: Explicit buttons still bake and render

- **WHEN** the user activates the render pass action or Bake All in the
  sprite toolbar
- **THEN** the g-buffer re-bakes from the document's current source and
  settings and the path-traced render pass runs against it

## ADDED Requirements

### Requirement: Sprite viewport view-slot switcher

The sprite viewport SHALL show a view-slot switcher in its top-right
corner: one icon per view slot in fixed N, E, S, W order, labelled with
the slot's direction. Each icon SHALL be color-coded to show whether that
slot currently holds baked passes. Activating an icon SHALL select that
slot; the viewport SHALL then display the selected slot's stored passes in
whichever view mode (realtime/normals/depth/render) is active, and the
toolbar's per-slot actions SHALL apply to it. On editable documents an
empty slot SHALL be selectable so it can be baked; on view-only documents
only slots holding stored passes SHALL be selectable.

#### Scenario: Icon color reflects baked state

- **WHEN** a document has N and W baked and E, S empty
- **THEN** the N and W icons show the baked color and the E and S icons
  show the empty color

#### Scenario: Switching slots swaps the displayed passes

- **WHEN** the user activates the E icon on a document with baked N and E
  views while the render view mode is active
- **THEN** the viewport displays the E view's render pass without changing
  the view mode

#### Scenario: Switching marks the selection for bake actions

- **WHEN** the user activates the S icon and then the toolbar's render
  pass action
- **THEN** the S slot is baked

#### Scenario: View-only documents show stored views only

- **WHEN** a view-only document stores N and E views
- **THEN** the N and E icons are selectable and show their passes, while
  the S and W icons are not selectable
