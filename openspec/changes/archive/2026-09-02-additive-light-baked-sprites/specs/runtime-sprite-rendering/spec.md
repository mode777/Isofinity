## MODIFIED Requirements

### Requirement: Sprite display mode switches between baked image and dynamic lighting

The runtime SHALL provide a display mode per placed sprite plus a default
mode for new placements: **baked** and **unlit**. Sprites without a render
pass SHALL always display unlit.

In baked mode the sprite SHALL display its prerendered lit image shaded by
the dynamic lights with classic multiplicative lighting: the sampled
render-pass texel is decoded to linear, multiplied by
`ambient + keyColor × max(dot(N, L), 0)` — with `N` from the baked g-buffer
normal and `L` the shared key-light direction — and the product is encoded
back to sRGB for output. Blending SHALL continue to use the render pass's
alpha. The key light's direction, color, and intensity and the ambient
scalar SHALL remain the shared realtime controls and SHALL affect baked and
unlit sprites alike; ambient acts as the fill term in both modes.

A global control SHALL let the user disable dynamic lighting entirely:
shading SHALL be pinned to identity — unlit-mode sprites SHALL display raw
albedo, and baked-mode sprites SHALL display the pure prerendered image
with no dynamic shading applied.

#### Scenario: Per-sprite toggle

- **WHEN** the user switches one placed sprite to baked mode
- **THEN** that sprite shows its prerendered image shaded by the dynamic
  lights and the other sprites keep their current mode

#### Scenario: New placements use the default mode

- **WHEN** the user changes the default display mode and places a new sprite
- **THEN** the new sprite uses the new default while existing placements
  keep their modes

#### Scenario: Dynamic lighting off

- **WHEN** the user disables dynamic lighting
- **THEN** baked-mode sprites show the pure prerendered image (identical to
  today's baked appearance) and unlit-mode sprites turn unshaded (albedo
  as-is)

#### Scenario: Key light direction affects baked sprites

- **WHEN** the user changes the key light azimuth or elevation while a
  baked-mode sprite is displayed with dynamic lighting enabled
- **THEN** the shading on that sprite shifts to follow the new light
  direction, consistent with the shading of unlit sprites

#### Scenario: Ambient fill applies to baked sprites

- **WHEN** the user changes the ambient slider while dynamic lighting is
  enabled
- **THEN** baked-mode and unlit-mode sprites both respond, the ambient
  scaling the shaded image as the fill term in either mode
