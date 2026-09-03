## Purpose

How the runtime displays baked sprites once asset bundles carry
pre-rendered lit passes: each placed sprite renders from the baked beauty
image, re-lit in real time by the g-buffer normals, while per-pixel
occlusion and hit-testing stay driven by the baked g-buffer in every mode.

## Requirements

## Requirements

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

### Requirement: Runtime bakes rendered passes at boot with a procedural environment

The integrated editor SHALL make the built-in test primitives available as
placeable sprites without requiring any user-provided asset: their g-buffer
and rendered passes SHALL be baked using the built-in procedural environment
(no external HDRI asset) — an equirect gradient sky with a warm sun disc
whose direction matches the world editor's default key light. The
environment SHALL be a pure function so bakes are reproducible. A built-in
primitive SHALL have its rendered pass before it can be placed in a world.

#### Scenario: Boot bake needs no user input

- **WHEN** the user opens a built-in primitive from the project browser with
  no workspace connected and no HDRI loaded
- **THEN** the primitive is baked — a g-buffer plus a rendered pass from the
  procedural environment — and can be placed into a world without loading
  any external asset

### Requirement: Sprites load from the workspace listing

While a workspace is connected, the runtime editor's sprite loader SHALL
additionally list the `sprites/` folder's bundles (`.sprite` and `.zip`)
and loading an entry SHALL follow exactly the same path as a dialog-loaded
bundle: same parser, same rules (a bundle without its rendered pass is
still rejected), same unique-id handling when an asset id already exists.
The existing file dialog and drag-drop SHALL remain fully functional, with
and without a workspace.

#### Scenario: Sprite loaded from the workspace listing

- **WHEN** the user picks a `.sprite` bundle from the `sprites/` listing
- **THEN** the sprite loads, appears in the toolbar, and places exactly as
  if loaded through the file dialog

#### Scenario: Same rules apply to workspace loads

- **WHEN** the user picks a bundle that lacks its rendered pass from the
  `sprites/` listing
- **THEN** loading fails with the same named error as the dialog flow and
  no sprite is placed

#### Scenario: Duplicate asset ids stay unique

- **WHEN** a workspace bundle is loaded whose asset id already exists in
  the scene
- **THEN** the loaded copy gets a unique id exactly as the dialog flow does

#### Scenario: Dialog upload keeps working alongside the workspace

- **WHEN** a workspace is connected and the user loads a `.sprite` file
  through the existing file dialog instead
- **THEN** it behaves exactly as the zip dialog flow did before this change
