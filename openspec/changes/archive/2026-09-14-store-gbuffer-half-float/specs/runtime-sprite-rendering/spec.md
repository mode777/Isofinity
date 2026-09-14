## ADDED Requirements

### Requirement: G-buffers load from either EXR precision

The runtime SHALL decode a bundle's g-buffer whether it is stored as a
half-float (`exr-f16-linear`) or a full-float (`exr-f32-linear`) EXR,
producing the same half-float RGBA texture data in either case, so a bundle
baked before the half-float storage change loads without re-baking. A
g-buffer that cannot be decoded SHALL fail with a named error and place no
sprite.

#### Scenario: Half-float g-buffer loads

- **WHEN** the runtime loads a `/7` bundle whose g-buffer is a half-float EXR
- **THEN** the g-buffer decodes to the half-float texture data and the sprite
  places normally

#### Scenario: Full-float g-buffer loads

- **WHEN** the runtime loads a `/4`, `/5` or `/6` bundle whose g-buffer is a
  full-float EXR
- **THEN** the g-buffer decodes to the same half-float texture data as an
  equivalent half-float storage and the sprite places normally

## MODIFIED Requirements

### Requirement: Bundles must carry a rendered pass

The editor's bundle parser SHALL accept `isoinfinity-bake/4` through
`isoinfinity-bake/7` format prefixes (unknown prefixes fail with a named
error), but a bundle SHALL NOT be placed unless it carries its rendered
pass: loading a bundle without `<id>-render.png` SHALL fail with a named
error and place no sprite. A `/4`–`/7` bundle that includes the rendered
pass SHALL load as today: the decoded render pass is uploaded as the
sprite's display layer.

#### Scenario: v3 bundle is rejected

- **WHEN** the user loads an `isoinfinity-bake/3` bundle
- **THEN** loading fails with a named error and no sprite is placed

#### Scenario: v4 bundle without a render pass is rejected

- **WHEN** the user loads a `/4` bundle whose manifest lists no render pass
- **THEN** loading fails with a named error and no sprite is placed

#### Scenario: v4 bundle with a render pass

- **WHEN** the user loads a `/4` bundle that includes `<id>-render.png`
- **THEN** the editor uploads the lit image as the sprite's display layer
  and places it

#### Scenario: v5 bundle with a render pass

- **WHEN** the user loads a `/5` bundle that includes `<id>-render.png`
- **THEN** the editor uploads the lit image as the sprite's display layer,
  places it, and restores the bundle's provenance for editing
