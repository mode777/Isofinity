## MODIFIED Requirements

### Requirement: Bundles must carry a rendered pass

The editor's bundle parser SHALL accept `isoinfinity-bake/4` and
`isoinfinity-bake/5` format prefixes (unknown prefixes fail with a named
error), but a bundle SHALL NOT be placed unless it carries its rendered
pass: loading a bundle without `<id>-render.png` SHALL fail with a named
error and place no sprite. A `/4` or `/5` bundle that includes the rendered
pass SHALL load as today: the lit image is uploaded as the sprite's display
layer.

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

### Requirement: Runtime bakes rendered passes at boot with a procedural environment

The integrated editor SHALL make the built-in test primitives available as
placeable sprites without requiring any user-provided asset: their albedo,
g-buffer, and rendered passes SHALL be baked using the built-in procedural
environment (no external HDRI asset) — an equirect gradient sky with a warm
sun disc whose direction matches the world editor's default key light. The
environment SHALL be a pure function so bakes are reproducible. A built-in
primitive SHALL have its rendered pass before it can be placed in a world.

#### Scenario: Boot bake needs no user input

- **WHEN** the user opens a built-in primitive from the project browser with
  no workspace connected and no HDRI loaded
- **THEN** the primitive is baked — including a rendered pass from the
  procedural environment — and can be placed into a world without loading
  any external asset
