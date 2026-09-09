# integrated-editor delta

## ADDED Requirements

### Requirement: Point light tool in the world editor

The world editor toolbar SHALL offer a point-light placement tool alongside
the sprite and mesh tools. With the tool selected, the cursor shows a light
ghost (an editor marker sized to the light's radius, projected on the
ground at the cursor's ground position and brush height) and clicking
places a point light at that position; the eraser removes point lights
under the cursor like any placement. The tool SHALL NOT require a selected
brush asset. The light marker is editor chrome: it SHALL be drawn in the
overlay layer and SHALL NOT be serialized into world files as anything but
a point light placement (ADR 0006 — never serialize editor chrome).

#### Scenario: Placing a light from the toolbar

- **WHEN** the user selects the point-light tool and clicks in the world
- **THEN** a point light placement is created at the cursor's ground
  position and brush height, and its light immediately affects the frame

#### Scenario: Light ghost previews the radius

- **WHEN** the point-light tool hovers over the world
- **THEN** a ground-projected marker at the cursor previews the light's
  position and radius before placement

#### Scenario: Eraser removes lights

- **WHEN** the user erases where a point light stands
- **THEN** the light is removed and its contribution disappears

### Requirement: Point light properties panel

With a point light placement selected, the properties panel SHALL offer
radius (world units), energy, color (sRGB color picker, converted to linear
for the deferred pass), and position (ground position and height, with the
same slider/numeric input behavior as other placements). Changes SHALL
apply to the rendered frame immediately.

#### Scenario: Editing light properties updates the frame

- **WHEN** the user changes a selected light's radius, energy, or color
- **THEN** the deferred light pass reflects the new value on the next frame

#### Scenario: Light selection follows placement kinds

- **WHEN** the user clicks a point light with a selection-capable tool
- **THEN** the properties panel shows the light's radius, energy, color,
  and position controls
