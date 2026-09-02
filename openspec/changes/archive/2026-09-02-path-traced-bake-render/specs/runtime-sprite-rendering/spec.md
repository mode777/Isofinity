## Purpose

How the runtime displays baked sprites once asset bundles may carry
pre-rendered lit passes: each placed sprite renders either from the baked
beauty image or via dynamic re-lighting of the unlit albedo, while
per-pixel occlusion and hit-testing stay driven by the baked g-buffer in
every mode.

## ADDED Requirements

### Requirement: Runtime parses format /4 bundles with optional passes

The runtime's bundle parser SHALL accept `isoinfinity-bake/3` and
`isoinfinity-bake/4` bundles. In a `/4` bundle the render and AO passes are
optional: the parser SHALL expose which optional passes are present, and the
runtime SHALL treat a missing render pass as "no baked image available" for
that asset (unlit display only). Loading SHALL fail with a named error for
bundles with an unknown format prefix.

#### Scenario: v3 bundle keeps loading as today

- **WHEN** the user loads an `isoinfinity-bake/3` bundle
- **THEN** the sprite is available in unlit display mode only

#### Scenario: v4 bundle without optional passes

- **WHEN** the user loads a `/4` bundle whose manifest lists no render pass
- **THEN** the sprite is available in unlit display mode only

#### Scenario: v4 bundle with a render pass

- **WHEN** the user loads a `/4` bundle that includes `<id>-render.png`
- **THEN** the runtime uploads the lit image as an additional sprite layer
  and offers baked display mode for it

### Requirement: Sprite display mode switches between baked image and dynamic lighting

The runtime SHALL provide a display mode per placed sprite plus a default
mode for new placements: **baked** (sample the asset's lit render pass; alpha
for blending comes from that pass) and **unlit** (today's behavior: albedo
shaded by key + ambient dynamic lights). Sprites without a render pass SHALL
always display unlit. A global control SHALL let the user disable dynamic
lighting entirely, which SHALL leave baked-mode sprites unaffected while
unlit-mode sprites receive no key or ambient light.

#### Scenario: Per-sprite toggle

- **WHEN** the user switches one placed sprite to baked mode
- **THEN** that sprite shows its baked lit image and the other sprites
  keep their current mode

#### Scenario: New placements use the default mode

- **WHEN** the user changes the default display mode and places a new sprite
- **THEN** the new sprite uses the new default while existing placements
  keep their modes

#### Scenario: Dynamic lighting off

- **WHEN** the user disables dynamic lighting
- **THEN** baked-mode sprites still show their baked image and unlit-mode
  sprites turn unshaded (albedo as-is)

### Requirement: Occlusion and hit-testing stay g-buffer driven

Per-pixel occlusion between sprites, the ground, and cursor hit-testing
SHALL behave identically in both display modes: depth still comes from the
baked g-buffer, and sprite coverage for hit-testing still comes from the
raster coverage alpha — never from the antialiased alpha of the render pass.
Display mode SHALL affect shading only.

#### Scenario: Interpenetrating sprites resolve the same in both modes

- **WHEN** two sprites overlap in depth and the user toggles one between
  display modes
- **THEN** the per-pixel occlusion boundary between them does not change

#### Scenario: Hit-testing ignores render-pass alpha

- **WHEN** the cursor hovers over a sprite pixel whose render-pass alpha is
  partial but whose raster coverage is 1
- **THEN** hit-testing treats the pixel as solid regardless of display mode
