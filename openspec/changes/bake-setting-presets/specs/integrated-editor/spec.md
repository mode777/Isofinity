## ADDED Requirements

### Requirement: Only explicit bake actions bake or render

Editing a properties-panel control SHALL update the active document's state
only: no input other than the explicitly labeled bake buttons (raster bake,
render pass) SHALL trigger a raster bake or a path-traced render pass.
Opening a resource SHALL keep performing its initial bake. When an input
makes an in-flight render pass stale, the pass SHALL be discarded — not
restarted — and the document SHALL stay usable for an explicit re-render.

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
- **THEN** the document's scale value updates and no raster bake runs until
  the user activates the raster bake button

#### Scenario: Changing an input discards an in-flight render

- **WHEN** a render pass is accumulating and the user changes a bake
  setting, environment parameter, HDRI, or preset
- **THEN** the in-flight pass is discarded, the document leaves the busy
  state, and no new pass starts

#### Scenario: Explicit buttons still bake and render

- **WHEN** the user activates the raster bake or the render pass button
- **THEN** the corresponding pass runs with the document's current settings
