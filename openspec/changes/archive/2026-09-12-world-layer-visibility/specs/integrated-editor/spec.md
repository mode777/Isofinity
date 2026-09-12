# integrated-editor Delta

## ADDED Requirements

### Requirement: World editor viewport layer visibility

A world editor SHALL show a layer control docked inside the world viewport's
**top-right** corner — the mirror image of the top-left tool bar — styled
like the other viewport corner panels (the tool bar, the bottom-right zoom
cluster). The control SHALL show a stacked-layers icon button with a tooltip
naming it; activating the button SHALL toggle a dropdown listing one
checkable row per world layer — **Ground**, **Sprites**, **Meshes** — each
row showing the layer's name and its current visibility state, with the
dropdown closing on an outside click, on re-activating the button, or on
Escape.

Activating a row SHALL toggle that layer's visibility with immediate effect
in the viewport. Hiding a layer SHALL remove it from the rendered world:
hiding the ground layer SHALL remove the ground surface and the contact
shadows cast onto it; hiding the sprite layer SHALL remove the sprite
instances and their baked grounding shadows; hiding the mesh layer SHALL
remove mesh draws (the skinned character) and their grounding shadows.
Showing a layer again SHALL restore it unchanged. Point lights and their
icons are not part of these layers and SHALL stay visible regardless of
layer state.

While a layer is hidden, its placements SHALL NOT participate in the world's
interactive surface: hidden placements SHALL supply no surface-snap heights,
so placement height falls back to the remaining visible surface (or to the
manual placement height when no surface is visible under the cursor).

Layer visibility SHALL be per-document in-memory editor state, like the
active tool: it SHALL never be serialized into world files, SHALL NOT mark
the document dirty, SHALL NOT appear on the undo/redo stack, SHALL default
to all layers visible for new and opened worlds, and SHALL survive tab
switches within the session. The control SHALL overlay the viewport without
affecting the view transform: interacting with it SHALL NOT pan, zoom,
place, erase, or pick, and canvas interaction outside it SHALL behave
exactly as before.

#### Scenario: Layer control sits in the top-right corner

- **WHEN** the user activates a world editor tab
- **THEN** the viewport's top-right corner shows a stacked-layers icon
  button styled like the other corner panels, with a tooltip naming it, and
  all three layers start visible

#### Scenario: Dropdown lists the three layers

- **WHEN** the user clicks the layer button
- **THEN** a dropdown opens listing checkable rows for Ground, Sprites, and
  Meshes, each showing its layer's current visibility state

#### Scenario: Toggling a layer takes effect immediately

- **WHEN** the user unchecks the Sprites row
- **THEN** all sprite placements and their baked grounding shadows vanish
  from the viewport at once, without any save, bake, or dialog, and
  re-checking the row restores them exactly as they were

#### Scenario: Hiding the ground removes contact shadows

- **WHEN** the user unchecks the Ground row
- **THEN** the ground surface and the contact shadows cast onto it
  disappear while sprites and meshes remain visible

#### Scenario: Lights stay visible regardless of layers

- **WHEN** the user hides every layer via the dropdown
- **THEN** placed point lights and their clickable icons remain visible and
  functional

#### Scenario: Surface snap ignores hidden layers

- **WHEN** surface snap is on, the sprite layer is hidden, and the user
  places a brush over where a hidden sprite stands
- **THEN** the placement height does not snap to the hidden sprite's
  surface but to the remaining visible surface (or the manual placement
  height when nothing is visible there)

#### Scenario: Visibility is transient in-memory state

- **WHEN** the user hides the mesh layer, switches to another tab and back,
  undoes and redoes a world edit, saves the world, and reopens it
- **THEN** the mesh layer is still hidden after the tab round-trip, the
  undo/redo steps do not touch layer visibility, and the saved world file
  contains no visibility state so the reopened world shows all layers

#### Scenario: The layer control does not eat canvas input

- **WHEN** the user clicks or drags on the viewport outside the layer
  control (including its open dropdown)
- **THEN** the click behaves exactly as it would with the control hidden —
  no pan, zoom, place, erase, pick, or dropdown toggle occurs
