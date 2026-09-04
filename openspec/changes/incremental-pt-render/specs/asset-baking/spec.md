## MODIFIED Requirements

### Requirement: Bake renders a path-traced lit render pass

The bake tool SHALL be able to render the active source through a path-traced
renderer into an additional `render` pass: a fully lit beauty image produced
with the same fixed isometric orthographic camera and the same projected
sprite rectangle as the raster g-buffer pass, so the render pass aligns
pixel-for-pixel with the g-buffer pass. Background pixels (no geometry)
SHALL be transparent (alpha 0) and camera rays that miss the asset SHALL not
contribute any background image or color into the pass. The render pass SHALL
be tone-mapped (ACES filmic) and sRGB-encoded before storage, and the
downloaded PNG SHALL be pixel-identical to the on-screen preview of that
pass. Accumulation SHALL proceed incrementally over a tile grid — each
accumulation step renders one tile of the frame rather than the whole frame
in a single blocking submission — so the page SHALL stay responsive (user
input processed, frames composited) for the duration of the pass. The tile
grid SHALL be a deterministic function of the rendered frame size, and
progressive accumulation SHALL be deterministic for a fixed sample count and
tile grid: re-running the pass with the same source, settings, and
environment reproduces the same bytes.

#### Scenario: Render pass aligns with the raster passes

- **WHEN** the user bakes a source with the render pass enabled
- **THEN** the render pass has the same pixel dimensions as the g-buffer
  pass and object pixels land at the same pixel coordinates in both passes

#### Scenario: Background stays transparent

- **WHEN** the render pass is produced with no background image visible
- **THEN** pixels not covered by geometry are fully transparent while lit
  object pixels are opaque

#### Scenario: Export matches the preview

- **WHEN** the user downloads the render pass after inspecting it on screen
- **THEN** the exported PNG equals the tone-mapped, sRGB-encoded image shown
  in the preview

#### Scenario: Large pass accumulates without blocking the page

- **WHEN** the user runs a render pass on a source that bakes a frame of
  several thousand pixels per axis
- **THEN** the browser stays responsive throughout accumulation — UI
  interactions are processed while samples accumulate — and the pass
  completes to the converged image instead of failing with a stall or
  context-loss error

#### Scenario: Same settings reproduce the same bytes

- **WHEN** the same source, sample count, and environment are rendered
  twice on any machine
- **THEN** both runs use the same tile grid for the same frame size and
  produce byte-identical render passes

### Requirement: Bundles record provenance

An `isoinfinity-bake/5` manifest SHALL record how the sprite was produced:
the bake source (a built-in primitive identified by name, or a glTF model
referenced by its file name within the workspace's `models/` folder together
with the applied uniform scale), the path-trace settings used for the
optional render pass (sample count, bounce count, texture size, tile grid),
and the environment used for the render pass (the `.hdr`/`.exr` file name
within the workspace's `hdri/` folder, or a marker for the built-in
procedural environment, plus rotation, intensity, exposure, and saturation).
The provenance SHALL be written on every sprite save and updated on re-bake.

#### Scenario: Model sprite records its source

- **WHEN** the user bakes `robot.glb` at scale 2 with an HDRI and saves the
  sprite
- **THEN** the saved manifest records the source as model `robot.glb` with
  scale 2, the path-trace settings used (including the tile grid), and the
  HDRI file name with its environment settings

#### Scenario: Primitive sprite records its source

- **WHEN** the user bakes the built-in donut with the procedural
  environment and saves the sprite
- **THEN** the saved manifest records the source as the donut primitive and
  the environment as the procedural one

#### Scenario: Provenance without a tile grid still opens

- **WHEN** the user opens a `/5` sprite whose provenance predates the tile
  grid field
- **THEN** the sprite opens editable with its recorded settings restored and
  re-baking derives the tile grid from the frame size

## ADDED Requirements

### Requirement: Render pass shows a live converging preview

While a render pass accumulates, the sprite editor's viewport SHALL display
the partial accumulation live: the same tone-mapped, sRGB-encoded image the
finished pass will store, refreshed as samples complete, so the image
visibly converges toward the final render. Sample progress SHALL continue to
be reported in the status bar alongside the preview. The live preview SHALL
NOT alter the document's committed passes: any previously committed render
pass remains the stored pass until the new accumulation finishes, and a
discarded (stale) pass SHALL leave the stored passes unchanged. When the
accumulation finishes, the committed render pass SHALL equal the final state
of the preview and the viewport SHALL show it.

#### Scenario: Viewport shows the image converging

- **WHEN** a render pass accumulates in a sprite editor
- **THEN** the viewport displays the partially accumulated image, updated as
  samples complete, converging toward the final render while the status bar
  reports sample progress

#### Scenario: Finished pass matches the preview

- **WHEN** the accumulation reaches the target sample count
- **THEN** the committed render pass is pixel-identical to the final preview
  state and the viewport shows it as the render view

#### Scenario: Stale pass leaves the stored image intact

- **WHEN** the user changes the source or settings while a pass accumulates
  so that the pass is discarded
- **THEN** the previously committed render pass stays stored and shown, and
  no partial image is committed
