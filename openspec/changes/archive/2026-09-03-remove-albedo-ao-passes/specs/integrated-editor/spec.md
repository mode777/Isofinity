## MODIFIED Requirements

### Requirement: Properties panel follows the active editor

The properties panel SHALL show controls matching the active tab's editor
kind. For a sprite editor it SHALL show the document's source information,
model scale (when the source is a model), path-trace bake settings, the
environment controls (load/rotate/intensity/exposure/saturation), and the
pass actions (raster bake, render pass). For a world editor it SHALL show
the key light controls (azimuth, elevation, intensity, color, ambient color,
dynamic-light switch) and the sun-position controls. The panel SHALL NOT
duplicate the per-editor toolbar's actions (save, place-in-world, and
placement tool selection live in the toolbar). Editing a control SHALL
update the active document only.

#### Scenario: Sprite tab shows bake properties

- **WHEN** the user activates a sprite editor tab
- **THEN** the properties panel shows the bake settings, environment
  controls, and pass actions, and no save/export buttons

#### Scenario: No AO pass action exists

- **WHEN** the user activates a sprite editor tab
- **THEN** the properties panel offers no ambient-occlusion pass action and
  no AO samples/radius controls

#### Scenario: World tab shows light properties

- **WHEN** the user activates a world editor tab
- **THEN** the properties panel shows the key light and sun-position
  controls, and no save button or world name field

#### Scenario: Controls are per document

- **WHEN** the user changes the environment rotation in one sprite tab and
  switches to another sprite tab
- **THEN** the second tab's properties show its own environment settings,
  unchanged by the first tab's edit
