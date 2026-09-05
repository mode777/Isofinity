## ADDED Requirements

### Requirement: Sprite viewport human-scale reference

The sprite viewport SHALL offer a toggleable human-scale reference figure in
the Realtime 3D view: when enabled, a simple humanoid figure of fixed
reference height **1.8 m** (1 world unit = 1 m) SHALL stand on the ground
plane beside the asset, inside the bake's fixed isometric camera frame, so
the asset's size can be judged against a human. The toggle SHALL live in the
viewport's view controls next to the bounding-box overlay toggle. The figure
SHALL be placed at a fixed position relative to the bake camera frame —
adjacent to the yaw-rotated asset box's camera-facing corner — so it stays
visible in every view slot and does not rotate with the slot's model yaw.

The reference figure SHALL be editor chrome only: it SHALL NOT participate in
any bake, SHALL NOT appear in any baked pass (g-buffer or render), and SHALL
NOT be serialized into sprite bundles or world files. Toggling it SHALL NOT
mark the document dirty. The figure SHALL be drawn from data the document
already holds (source geometry, box extent, fixed camera), so live sources
show it regardless of bake state. The toggle SHALL be available exactly when
the Realtime 3D view is available (the document has source geometry). The
figure SHALL track the view's zoom and pan. The toggle's state SHALL be kept
per sprite document in memory — persisting across view switches and tab
switches, never saved into sprite bundles.

#### Scenario: Toggle shows and hides the figure

- **WHEN** the user activates the human toggle in the view controls while the
  Realtime 3D view is active
- **THEN** a humanoid figure 1.8 m tall appears standing on the ground plane
  beside the asset, and deactivating the toggle removes it

#### Scenario: Figure shows true scale

- **WHEN** a model source is set to a height of 1.8 m via the height-in-meters
  input and the human reference is shown
- **THEN** the model's top edge aligns with the figure's head, both standing
  on the same ground plane

#### Scenario: Figure stays put across slot switches

- **WHEN** the user switches the active view slot from N to E to S to W with
  the reference shown
- **THEN** the figure remains at the same position relative to the camera
  frame, standing beside the yaw-rotated asset box in every slot, and never
  rotates with the model

#### Scenario: Reference never reaches baked output

- **WHEN** the user bakes a slot with the human reference shown and compares
  the resulting passes against a bake made with the reference hidden
- **THEN** the passes are identical, and a bundle saved from the document
  contains no trace of the figure

#### Scenario: Availability matches the Realtime 3D view

- **WHEN** a sprite document has no source geometry (a view-only bundle whose
  model reference does not resolve)
- **THEN** the human toggle is unavailable, same as the Realtime 3D view

#### Scenario: Figure tracks zoom and pan

- **WHEN** the user zooms or pans the Realtime 3D view with the figure shown
- **THEN** the figure scales and moves with the scene, keeping its size
  relative to the asset

#### Scenario: Toggle state is per document and never persisted

- **WHEN** the user enables the reference on one sprite tab, switches to
  another sprite tab and back, then saves the first document
- **THEN** the first tab still shows the reference, the second tab is
  unaffected, and the saved bundle contains no reference-toggle state; the
  document did not turn dirty from toggling
