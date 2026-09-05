## ADDED Requirements

### Requirement: Sprite viewport human-scale reference

The sprite viewport SHALL offer a toggleable human-scale reference figure in
the Realtime 3D view: when enabled, a humanoid figure of fixed reference
height **1.8 m** (1 world unit = 1 m) SHALL stand on the ground plane beside
the asset, inside the bake's fixed isometric camera frame, so the asset's
size can be judged against a human. The figure SHALL be the editor's bundled
base mesh (`free_base_mesh.glb`), normalized at load — uniform scale to
exactly 1.8 m height, feet on the ground plane, centered over its ground
position. The toggle SHALL live in the viewport's view controls next to the
bounding-box overlay toggle.

The figure SHALL be placed at a fixed default position relative to the bake
camera frame — adjacent to the yaw-rotated asset box's camera-facing corner —
and SHALL be repositionable: with the reference enabled, the user SHALL be
able to drag the figure along the ground plane with the left mouse button.
Dragging the figure SHALL NOT pan the viewport (the drag targets the figure
when the pointer press lands on it, and pans the view otherwise), and the
figure SHALL show pointer feedback when hovered or dragged. The repositioned
ground position SHALL be kept per sprite document in memory — persisting
across view-slot switches and tab switches, never saved into sprite bundles
or world files; a document that was never dragged shows the default spot.

The reference figure SHALL be editor chrome only: it SHALL NOT participate in
any bake, SHALL NOT appear in any baked pass (g-buffer or render), and SHALL
NOT be serialized into sprite bundles or world files. Toggling or moving it
SHALL NOT mark the document dirty. The figure SHALL track the view's zoom and
pan. The toggle SHALL be available exactly when the Realtime 3D view is
available (the document has source geometry). The figure does not rotate with
the slot's model yaw.

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

#### Scenario: Default spot beside the asset

- **WHEN** a document that was never dragged shows the reference
- **THEN** the figure stands just outside the yaw-rotated asset box's
  camera-facing corner, beside the asset in every view slot, and never
  rotates with the model

#### Scenario: Dragging repositions the figure

- **WHEN** the user presses the left mouse button on the figure and drags
  across the viewport
- **THEN** the figure follows the cursor along the ground plane, the viewport
  does not pan during the drag, and releasing drops the figure at that spot

#### Scenario: Pressing beside the figure still pans

- **WHEN** the user presses the left mouse button on the viewport with the
  reference enabled but not on the figure
- **THEN** the drag pans the view exactly as when the reference is hidden

#### Scenario: Dragged position persists per document

- **WHEN** the user drags the figure to a spot, switches the active view slot
  or to another sprite tab and back
- **THEN** the figure stands at the dragged spot in the first document, other
  documents are unaffected, and no bundle or world file contains the position;
  toggling or dragging did not turn the document dirty

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
