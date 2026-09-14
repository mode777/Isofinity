## MODIFIED Requirements

### Requirement: Bake renders a path-traced lit render pass

The bake tool SHALL be able to render the active source through a path-traced
renderer into an additional `render` pass: a fully lit beauty image produced
with the same fixed isometric orthographic camera and the same projected
sprite rectangle as the raster g-buffer pass, so the render pass aligns
pixel-for-pixel with the g-buffer pass. Background pixels (no geometry)
SHALL be transparent (alpha 0), except where the optional grounding shadow
(see the grounding-shadow requirement) composites dark mid-alpha values
into them; camera rays that miss the asset SHALL not contribute any
background image or color into the pass beyond that shadow. This applies at
partial coverage as well: a silhouette-edge texel's stored color SHALL be
the asset's own lit radiance with the environment's contribution removed,
at its coverage alpha — never an average with the environment plate — and
a fully empty texel SHALL store RGB 0. The render pass
SHALL be tone-mapped (ACES filmic) and sRGB-encoded before storage, and the
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
  and the grounding-shadow toggle is off
- **THEN** pixels not covered by geometry are fully transparent while lit
  object pixels are opaque

#### Scenario: Silhouette edges carry no environment contamination

- **WHEN** a render-pass texel has partial coverage (its alpha is strictly
  between 0 and 1, the antialiased edge of the asset's silhouette or of an
  interior gap)
- **THEN** its stored RGB equals the tone-mapped asset radiance with the
  background-plate contribution removed — compositing it over any backdrop
  at its coverage alpha reproduces the uncontaminated edge rather than a
  bright seam — instead of an average of asset and environment radiance

#### Scenario: Empty pixels carry no background color

- **WHEN** the render pass finishes with the grounding-shadow toggle off
- **THEN** every fully transparent texel stores RGB 0 (the pass carries no
  environment radiance in pixels the asset does not cover)

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
