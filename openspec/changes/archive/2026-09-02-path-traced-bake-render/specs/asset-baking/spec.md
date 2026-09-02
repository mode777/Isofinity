## ADDED Requirements

### Requirement: Bake renders a path-traced lit render pass

The bake tool SHALL be able to render the active source through a path-traced
renderer into an additional `render` pass: a fully lit beauty image produced
with the same fixed isometric orthographic camera and the same projected
sprite rectangle as the raster passes, so the render pass aligns pixel-for-
pixel with the albedo and g-buffer passes. Background pixels (no geometry)
SHALL be transparent (alpha 0) and camera rays that miss the asset SHALL not
contribute any background image or color into the pass. The render pass SHALL
be tone-mapped (ACES filmic) and sRGB-encoded before storage, and the
downloaded PNG SHALL be pixel-identical to the on-screen preview of that
pass. Progressive accumulation SHALL be deterministic for a fixed sample
count and seed.

#### Scenario: Render pass aligns with the raster passes

- **WHEN** the user bakes a source with the render pass enabled
- **THEN** the render pass has the same pixel dimensions as the albedo and
  g-buffer passes and object pixels land at the same pixel coordinates in
  all passes

#### Scenario: Background stays transparent

- **WHEN** the render pass is produced with no background image visible
- **THEN** pixels not covered by geometry are fully transparent while lit
  object pixels are opaque

#### Scenario: Export matches the preview

- **WHEN** the user downloads the render pass after inspecting it on screen
- **THEN** the exported PNG equals the tone-mapped, sRGB-encoded image shown
  in the preview

### Requirement: HDRI environment lights the render pass

The bake tool SHALL let the user load equirectangular HDR environment files
(`.hdr`) and use the selected environment as the sole illumination source for
the render pass. The tool SHALL provide controls to rotate the environment,
scale its intensity, and set the exposure applied at tone-mapping; changing
any of them SHALL restart the render pass accumulation. Loading an invalid
environment file SHALL produce a named error in the status area and keep the
previously active environment. Without an active environment the tool SHALL
still bake albedo and g-buffer, and simply not produce render/AO passes.

#### Scenario: Environment illuminates the render

- **WHEN** the user loads an HDRI and enables the render pass
- **THEN** the baked image shows environment lighting and reflections
  consistent with that HDRI

#### Scenario: Controls re-render

- **WHEN** the user rotates the environment or changes intensity or exposure
- **THEN** the render pass restarts accumulation and converges to the new
  lighting

#### Scenario: Invalid HDRI is rejected

- **WHEN** the user selects a file that fails to parse as an equirectangular
  HDR environment
- **THEN** the status area names the error and the previous environment
  stays active

### Requirement: Bake can produce a path-traced ambient occlusion pass

The bake tool SHALL be able to render an additional optional `ao` pass:
monochrome ambient occlusion computed by tracing rays against the asset
geometry, with white meaning unoccluded and black fully occluded. The AO
pass SHALL use the same camera and sprite rectangle as the other passes,
SHALL be controllable by an occlusion radius and sample count, and SHALL
not require an environment. Background pixels SHALL be transparent.

#### Scenario: Crevices bake darker

- **WHEN** an asset with concave features (e.g. the donut) bakes with the
  AO pass enabled
- **THEN** pixels in creases and contact areas are darker than exposed
  pixels, converging with more samples

#### Scenario: AO bakes without an environment

- **WHEN** the user enables the AO pass with no HDRI loaded
- **THEN** the AO pass is produced while the render pass is not

### Requirement: Render stage consumes full PBR materials

The path-traced render and AO stages SHALL consume the complete material
description of each draw group — base-color texture multiplied by base-color
factor, metallic-roughness values/textures, and normal maps where present —
instead of the base-color-only subset the raster passes use. Alpha-mask
materials SHALL apply their cutoff in the render pass so masked-out texels
read as transparent there, matching raster coverage. The raster albedo and
g-buffer passes SHALL remain unchanged by this requirement.

#### Scenario: Metallic materials reflect the environment

- **WHEN** a glTF material declares high metallic value and the render pass
  is baked with an HDRI
- **THEN** the material's pixels mirror environment lighting like a metal
  rather than a flat diffuse color

#### Scenario: Masked texels stay empty in the render pass

- **WHEN** an alpha-mask material is rendered into the render pass
- **THEN** texels below the alpha cutoff are transparent in the render pass
  just as they have zero coverage in the raster passes

## MODIFIED Requirements

### Requirement: glTF bakes emit standard bundles

A glTF bake SHALL produce the same outputs as a primitive bake — albedo PNG,
g-buffer EXR (rgb = world-space normal, a = linear ray depth against the
global reference plane), manifest with format `isoinfinity-bake/4`, single
zip bundle — readable by the runtime's bundle parser without modification.
The g-buffer normals SHALL come from the mesh geometry, not derived from
depth. The g-buffer EXR and albedo PNG SHALL follow exactly the byte-level
conventions of format `/3`. When produced, the render and AO passes SHALL be
included as additional bundle entries (`<id>-render.png`, `<id>-ao.png`)
referenced by the manifest's pass table; the manifest SHALL record which
optional passes are present, and the environment/tonemap/renderer settings
used for them. The runtime bundle parser SHALL accept both `/3` and `/4`
bundles; a `/4` bundle MAY omit the optional passes.

#### Scenario: glTF bundle downloads and validates

- **WHEN** the user bakes a glTF source and downloads the bundle
- **THEN** the zip contains a valid `isoinfinity-bake/4` manifest plus the
  albedo and g-buffer passes, and the runtime bundle parser accepts it

#### Scenario: Curved glTF geometry bakes correct normals

- **WHEN** a glTF mesh contains smooth curved surfaces
- **THEN** the g-buffer stores interpolated per-pixel world-space normals of
  unit length on rendered pixels (not flat depth derivatives), and empty
  pixels remain all-zero

#### Scenario: Bundle with optional passes lists them in the manifest

- **WHEN** the user bakes with render and AO passes produced
- **THEN** the bundle additionally contains `<id>-render.png` and
  `<id>-ao.png` and the manifest's pass table references exactly those
  entries alongside the environment and tonemap settings used

#### Scenario: Bundle without optional passes stays minimal

- **WHEN** the user bakes without the render and AO passes
- **THEN** the bundle contains only manifest, albedo, and g-buffer entries
  and is byte-convention-compatible with a `/3` bundle apart from the
  format string
