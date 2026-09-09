# runtime-ground-rendering delta

## MODIFIED Requirements

### Requirement: Ground shading matches the world lighting

The ground SHALL be lit through the unified deferred light pass: the
ground's geometry-pass draw writes its material albedo (linearized diffuse
map), its arm map's red channel as the AO factor of the albedo·AO surface,
and its surface normal — the tangent-space normal map perturbation when a
material provides one, world up otherwise — plus its plane depth into the
screen-space g-buffer; the deferred pass applies the ambient term (the
world's equirect HDRI environment the same way dynamic meshes receive it)
and the dynamic lights — directional key and point lights — over that
normal, so ground, meshes, and sprites share one lighting model. Roughness
and metalness channels SHALL be decoded but not yet applied.

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
