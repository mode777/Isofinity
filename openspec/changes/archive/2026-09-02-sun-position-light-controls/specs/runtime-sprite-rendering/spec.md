## ADDED Requirements

### Requirement: Ambient light is a per-channel color

The ambient fill term SHALL be a per-channel color set by an ambient color
picker (the picked sRGB color converted to linear RGB per channel). The
runtime SHALL NOT provide a separate ambient scalar/intensity control; the
brightness of the ambient fill comes solely from the picked color.

#### Scenario: Ambient color tints the fill

- **WHEN** the user picks a colored ambient value
- **THEN** the ambient fill on every sprite and the ground takes on that
  hue, converted per channel to linear space

#### Scenario: No ambient scalar remains

- **WHEN** the light panel renders
- **THEN** it shows an ambient color picker and no ambient slider

## MODIFIED Requirements

### Requirement: Every sprite displays the shaded prerendered image

The runtime SHALL display every placed sprite by sampling its prerendered
lit image and shading it with the dynamic key + ambient lights
(multiplicatively, over the baked g-buffer normal), regardless of where the
sprite came from (boot bake or bundle). The ambient term SHALL be the
per-channel ambient color (see ADDED requirement above). The global
Dynamic light switch SHALL pin shading to identity when disabled (pure
prerendered image).

#### Scenario: Boot-baked sprites show rendered images

- **WHEN** the runtime page finishes loading
- **THEN** every test primitive displays as a path-traced, shaded sprite
  and responds to the key light controls

#### Scenario: Key light shading applies uniformly

- **WHEN** the user adjusts the key light or ambient controls
- **THEN** all placed sprites — boot-baked and bundle-loaded alike —
  respond identically to the change
