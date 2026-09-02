## MODIFIED Requirements

(none)

## REMOVED Requirements

### Requirement: Runtime parses format /4 bundles with optional passes

**Reason**: The runtime no longer has an unlit display path, so a bundle
without a rendered pass has nothing to display; the render pass is now a
loading requirement, not an optional extra.
**Migration**: Re-bake with an environment to produce a `/4` bundle
containing `<id>-render.png`; such bundles load as before. `/3` bundles are
no longer loadable in the runtime (the bake tool still reads them).

### Requirement: Occlusion and hit-testing stay g-buffer driven

**Reason**: The requirement was phrased around two display modes and raster
albedo-alpha coverage; both are gone. Coverage now comes from g-buffer
emptiness — the identical hard raster coverage of the same bake draw — and
the behavior continues under a fresh, mode-free requirement.
**Migration**: Replaced by the ADDED requirement below; occlusion depth,
coverage semantics, and footprint picking are unchanged in practice.

### Requirement: Sprite display mode switches between baked image and dynamic lighting

**Reason**: Display modes are gone — every sprite displays its prerendered
lit image shaded by the dynamic key + ambient lights (the multiplicative
path). There is no unlit appearance to switch to, so the per-sprite mode,
the per-sprite toggle tool, and the default mode for new placements no
longer exist.
**Migration**: The replacement behavior is captured by the ADDED
requirements below; the global Dynamic light switch (shading pinned to
identity when off) is unchanged.

## ADDED Requirements

### Requirement: Bundles must carry a rendered pass

The runtime's bundle parser SHALL still accept `isoinfinity-bake/3` and
`isoinfinity-bake/4` format prefixes (unknown prefixes fail with a named
error), but a bundle SHALL NOT be placed unless it carries its rendered
pass: loading a bundle without `<id>-render.png` SHALL fail with a named
error and place no sprite. A `/4` bundle that includes the rendered pass
SHALL load as today: the lit image is uploaded as the sprite's display
layer.

#### Scenario: v3 bundle is rejected

- **WHEN** the user loads an `isoinfinity-bake/3` bundle
- **THEN** loading fails with a named error and no sprite is placed

#### Scenario: v4 bundle without a render pass is rejected

- **WHEN** the user loads a `/4` bundle whose manifest lists no render pass
- **THEN** loading fails with a named error and no sprite is placed

#### Scenario: v4 bundle with a render pass

- **WHEN** the user loads a `/4` bundle that includes `<id>-render.png`
- **THEN** the runtime uploads the lit image as the sprite's display layer
  and places it

### Requirement: Per-pixel occlusion stays g-buffer driven

Per-pixel occlusion between sprites and the ground SHALL not depend on
shading: depth comes from the baked g-buffer, and sprite coverage for
fragment discard comes from g-buffer emptiness (the hard raster coverage of
the same bake draw) — never from the antialiased alpha of the render pass.
Cursor placement and erase keep using ground-footprint picking.

#### Scenario: Interpenetrating sprites resolve pixel-accurately

- **WHEN** two sprites overlap in depth
- **THEN** the per-pixel occlusion boundary between them follows the baked
  g-buffer depth

#### Scenario: Partial render-pass alpha never drops fragments

- **WHEN** a sprite pixel lies inside the baked g-buffer coverage but its
  render-pass alpha is partial (antialiased edge)
- **THEN** the fragment is still rendered and blends with the partial alpha
  rather than being discarded

### Requirement: Every sprite displays the shaded prerendered image

The runtime SHALL display every placed sprite by sampling its prerendered
lit image and shading it with the dynamic key + ambient lights
(multiplicatively, over the baked g-buffer normal), regardless of where the
sprite came from (boot bake or bundle). The global Dynamic light switch
SHALL pin shading to identity when disabled (pure prerendered image).

#### Scenario: Boot-baked sprites show rendered images

- **WHEN** the runtime page finishes loading
- **THEN** every test primitive displays as a path-traced, shaded sprite
  and responds to the key light controls

#### Scenario: Key light shading applies uniformly

- **WHEN** the user adjusts the key light or ambient controls
- **THEN** all placed sprites — boot-baked and bundle-loaded alike —
  respond identically to the change

### Requirement: Runtime bakes rendered passes at boot with a procedural environment

At page load the runtime SHALL path-trace a rendered pass for every test
primitive it bakes, using a built-in procedural environment (no external
HDRI asset): an equirect gradient sky with a warm sun disc whose direction
matches the runtime's default key light. The environment SHALL be a pure
function so boot bakes are reproducible. Baking SHALL complete before the
scene is displayed.

#### Scenario: Boot bake needs no user input

- **WHEN** the runtime page loads with no user interaction
- **THEN** every primitive gets a rendered pass from the procedural
  environment without requiring an HDRI file
