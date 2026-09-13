## ADDED Requirements

### Requirement: The deferred light pass consumes the reconstructed shadow visibility

The deferred fullscreen light pass SHALL apply a per-pixel shadow visibility
to the key directional term, obtained from the reconstructed world-space
occluder (see the runtime-directional-shadows capability) along the same
world-space key-light direction the pass already shades with. The visibility
SHALL multiply only the key directional term, so the pass evaluates
`albedo·AO × (ambient + key·max(dot(N, L), 0)·visibility + point lights)`.
The world position used by the shadow test SHALL be the same reconstructed
position the point-light attenuation uses, so shading and shadowing agree
per pixel.

#### Scenario: Shadow visibility reaches every surface kind

- **WHEN** a ground pixel, a sprite pixel, and a mesh pixel at the same world
  position share an occluded ray to the key light
- **THEN** all three lose the same key-light contribution through the one
  pass, with no per-kind shader path

#### Scenario: Disabled dynamic light ignores visibility

- **WHEN** the dynamic-light switch pins the factor to identity
- **THEN** the shadow visibility does not affect the output

#### Scenario: Ambient is not shadowed

- **WHEN** a pixel lies in a cast shadow
- **THEN** its ambient term and its baked albedo·AO texel are unchanged, and
  only the key directional contribution is reduced
