## ADDED Requirements

### Requirement: Bake may composite a grounding shadow into the render pass

The bake SHALL offer a per-document **grounding-shadow** toggle (default
on). When enabled, baking a view slot SHALL derive a soft ground-space
occlusion mask from that slot's own baked g-buffer — by unprojecting the
covered pixels' world positions onto the ground plane, splatting them into
a footprint mask, and blurring — and SHALL composite the mask into the
render pass: exactly those pixels that were fully empty (alpha 0, no
geometry) before composition MAY receive a dark, non-pure-black,
mid-alpha grounding value; object pixels and their antialiased fringe
SHALL be left unchanged. The mask SHALL be derived only from geometry the
g-buffer kept (alpha-masked-out texels cast no shadow). The grounding
shadow SHALL NOT involve the path tracer beyond the existing render pass
and SHALL be deterministic: the same source, settings, and toggle
reproduce the same bytes. Each stored view slot derives its mask from its
own presentation, so a rotated slot's shadow is the rotated asset's
shadow.

#### Scenario: Shadow appears under the baked asset

- **WHEN** the user bakes a view slot with the grounding-shadow toggle on
  and a render pass
- **THEN** the render pass shows a soft dark grounding patch in the
  transparent pixels around and under the asset's ground contact, fading
  to zero with distance from the footprint

#### Scenario: Toggle off bakes unchanged passes

- **WHEN** the user disables the grounding-shadow toggle and bakes
- **THEN** the render pass equals the pre-change bake: all no-geometry
  pixels are alpha 0, and the sprite rect matches the projected-box
  framing without shadow reach

#### Scenario: Determinism

- **WHEN** the same source, settings, and toggle bake twice
- **THEN** the render pass bytes are identical

#### Scenario: Multi-view slots shadow their own presentation

- **WHEN** the user bakes N and E slots with the toggle on
- **THEN** the E slot's grounding patch is oriented as the 90°-rotated
  asset's shadow, matching the E slot's sprite

### Requirement: Grounding shadow grows the sprite rect

When the grounding-shadow toggle is enabled, the baked sprite rect SHALL
be the union of the projected asset box and the projected ground extent of
the shadow mask, so the grounding patch fits inside the sprite. The
origin anchor SHALL keep marking the same physical asset point (reprojected
into the grown rect), placement anchoring SHALL remain the existing
origin-based math, and disabling the toggle SHALL restore the projected-box
framing. The rect growth SHALL respect the existing sprite pixel cap and
its pre-bake warning.

#### Scenario: Rect contains the shadow reach

- **WHEN** a tall asset bakes with the shadow on
- **THEN** the sprite rect extends beyond the projected box by the
  shadow's ground reach and `originPx` still marks the same asset point as
  a shadow-off bake of the same asset

#### Scenario: Oversized shadow warns like the sprite cap

- **WHEN** the grown rect would exceed the sprite pixel cap
- **THEN** the properties panel warns with the offending pixel size before
  the bake, and the bake fails with the existing named cap error if run

### Requirement: Provenance records the grounding-shadow toggle

When the grounding-shadow toggle is disabled, the manifest's provenance
SHALL record `groundShadow: false`; at the on default the field SHALL be
omitted so bundles without it stay byte-compatible with earlier saves.
Re-bake from provenance SHALL restore the toggle, and re-baking SHALL
reproduce or drop the grounding patch accordingly. Bundles of any accepted
format SHALL continue to load whether or not they carry the field.

#### Scenario: Disabled toggle persists

- **WHEN** the user disables the grounding shadow, bakes, and saves
- **THEN** the saved provenance records `groundShadow: false` and re-opening
  the sprite shows the toggle off

#### Scenario: Omitted field means the default

- **WHEN** the user opens a bundle whose provenance has no
  `groundShadow` field
- **THEN** the toggle restores to on (without changing the stored passes
  of that bundle)

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
background image or color into the pass beyond that shadow. The render pass
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
