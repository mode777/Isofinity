## MODIFIED Requirements

### Requirement: Sprite display mode switches between baked image and dynamic lighting

The runtime SHALL provide a display mode per placed sprite plus a default
mode for new placements: **baked** and **unlit**. Sprites without a render
pass SHALL always display unlit.

In baked mode the sprite SHALL display its prerendered lit image with the
current dynamic key light applied **additively**: the sampled render-pass
texel is decoded to linear, the key contribution
`keyColor × max(dot(N, L), 0)` — with `N` from the baked g-buffer normal and
`L` the shared key-light direction — is added in linear space, and the sum
is encoded back to sRGB for output. Blending SHALL continue to use the
render pass's alpha. Baked sprites SHALL NOT receive an ambient term. The
key light's direction, color, and intensity SHALL remain the shared
realtime controls and SHALL affect baked and unlit sprites alike.

A global control SHALL let the user disable dynamic lighting entirely:
unlit-mode sprites SHALL receive no key or ambient light (albedo as-is),
and baked-mode sprites SHALL display the pure prerendered image with no
additive contribution.

#### Scenario: Per-sprite toggle

- **WHEN** the user switches one placed sprite to baked mode
- **THEN** that sprite shows its prerendered image with the additive key
  light and the other sprites keep their current mode

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
- **THEN** the additive highlight on that sprite shifts to follow the new
  light direction, consistent with the shading of unlit sprites

#### Scenario: Ambient does not brighten baked sprites

- **WHEN** the user changes the ambient slider while a baked-mode sprite is
  displayed with dynamic lighting enabled
- **THEN** the baked sprite's appearance does not change; the ambient
  control keeps affecting unlit sprites only
