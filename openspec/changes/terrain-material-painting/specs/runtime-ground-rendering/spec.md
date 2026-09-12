## MODIFIED Requirements

### Requirement: Ground materials load from the workspace

Ground materials SHALL be zip files with a `.material` file extension,
stored in the workspace's `materials/` folder. Inside a material zip, each
map SHALL be identified by the file-name pattern
`<material_name>_(diff|diffuse|arm|nor_gl|disp|displace|displacement)_*.(exr|png|jpg)`:
a diffuse map (`diff`, with `diffuse` accepted as an alias), an
AO/Roughness/Metal map with the channels encoded in rgb (`arm`), a normal
map in gl convention (`nor_gl`), and an optional displacement map (`disp`,
with `displace` and `displacement` accepted as aliases) used as a per-pixel
surface height when blending ground materials. When a zip contains maps
matching both `diff` and `diffuse` spellings, the `diff`-spelled map SHALL
take precedence and the other SHALL be reported as a duplicate, consistent
with the existing first-match-per-slot rule. A material zip missing the
diffuse map (under either spelling) SHALL be reported as invalid and not
applied; the normal map being missing SHALL fall back to flat geometric
normals with a reported notice; the arm map being missing SHALL fall back
to no ambient occlusion; the displacement map being missing SHALL fall back
to neutral blend height with a reported notice. Unsupported map formats
SHALL be reported by name. All four maps SHALL be normalized so several
materials can be sampled together.

#### Scenario: A well-formed material zip applies

- **WHEN** the user selects a `.material` zip containing diffuse, arm, and
  `nor_gl` maps from `materials/`
- **THEN** the ground renders with the material's diffuse color, normal
  detail, and ambient occlusion

#### Scenario: A diffuse map spelled `diffuse` applies

- **WHEN** the user selects a `.material` zip whose diffuse map is named
  `<name>_diffuse_*.(exr|png|jpg)` (arm and `nor_gl` maps optional)
- **THEN** the material is accepted and the ground renders with that
  diffuse map, identically to a `diff`-spelled map of the same content

#### Scenario: Material without a diffuse map is rejected

- **WHEN** the user selects a material zip whose contents match neither
  the diffuse (`diff`) nor the diffuse (`diffuse`) pattern
- **THEN** the selection is reported as invalid, the ground keeps its
  previous material, and the world stays usable

#### Scenario: Both diffuse spellings present resolves with precedence

- **WHEN** the user selects a material zip containing both a
  `<name>_diff_*` and a `<name>_diffuse_*` map
- **THEN** the `diff`-spelled map is used and the `diffuse`-spelled map
  is reported as a duplicate in the non-fatal load notices

#### Scenario: Missing normal map degrades gracefully

- **WHEN** the user selects a material zip containing only a diffuse map
- **THEN** the ground renders with the diffuse map and flat normals, with a
  notice naming what was missing

#### Scenario: A displacement map is recognized under its aliases

- **WHEN** a material zip contains a map named with `disp`, `displace`, or
  `displacement`
- **THEN** that map is decoded as the material's displacement map and is
  available to the material blend

#### Scenario: Missing displacement map degrades gracefully

- **WHEN** a material zip contains no displacement map
- **THEN** the material still applies and its blend treats it as neutral
  height, with a notice naming the missing displacement map

### Requirement: Ground shading matches the world lighting

The ground SHALL be lit through the unified deferred light pass: the
ground's geometry-pass draw writes its material albedo (linearized diffuse
maps), its arm maps' red channels as the AO factor of the albedo·AO
surface, and its surface normal — the tangent-space normal-map perturbation
when a material provides one, world up otherwise — plus its plane depth into
the screen-space g-buffer; the deferred pass applies the ambient term (the
world's equirect HDRI environment the same way dynamic meshes receive it)
and the dynamic lights — directional key and point lights — over that
normal, so ground, meshes, and sprites share one lighting model. When more
than one material slot carries coverage, the ground SHALL blend the bound
materials per pixel by their painted coverage, weighted by each material's
displacement height where coverages meet, and SHALL composite their
diffuse, normal, and AO maps with those weights before shading; the
resulting normal SHALL be renormalized. A material slot whose coverage is
zero SHALL not contribute. Roughness and metalness channels SHALL be
decoded but not yet applied.

#### Scenario: Ground responds to the key light

- **WHEN** the user changes the world's directional light azimuth or
  intensity
- **THEN** the ground's shading changes consistently with dynamic meshes
  under the same light

#### Scenario: Ground responds to point lights

- **WHEN** a point light is placed on the ground
- **THEN** the ground pools the light within the radius, gated by its
  surface normal (normal-map relief visible in the pool)

#### Scenario: Normal map tilts the shading

- **WHEN** the selected material's normal map contains non-flat detail
- **THEN** the ground's shading varies across the detail (surface relief is
  visible under the key light) without geometric displacement

#### Scenario: Tiled material covers the plane

- **WHEN** a material with a tile scale is applied to the plane
- **THEN** the material repeats seamlessly according to the tile scale, in
  world units, across the whole plane

#### Scenario: Blended materials share one lighting model

- **WHEN** the ground blends two materials with different diffuse and normal
  maps
- **THEN** the blended region is lit by the same ambient and dynamic lights
  as the rest of the ground, using the blended normal
