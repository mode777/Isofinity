## MODIFIED Requirements

### Requirement: The screen-space g-buffer covers all geometry

Every surface the geometry pass draws SHALL write the screen-space g-buffer:
the ground plane writes its surface normal (the normal map's perturbation
when a material is selected, world up otherwise) and its plane depth; placed
meshes write their live skinned normals and world depth; placed sprites write
their baked g-buffer normal and depth (plus the placement's world offset).
Surface data SHALL be written unblended: at partial render-pass coverage
(the antialiased silhouette), the sprite fragment's normal and depth REPLACE
whatever the attachment held — the g-buffer never carries a coverage-weighted
mix of two surfaces' data, so the deferred pass shades every pixel with one
surface's own data. Only the albedo attachment composites with the backdrop
(alpha blend). A sprite's grounding-shadow pixels — g-buffer-empty, shadow-tinted in the
render pass — SHALL map to the ground plane: they write the ground-plane
depth at that pixel with world-up normal, so the deferred pass lights them
as floor.

#### Scenario: Point light pools on the floor

- **WHEN** a point light stands on bare ground
- **THEN** the ground pixels within its radius receive its light, shaded by
  the ground's surface normal

#### Scenario: Torch light reaches sprite and mesh surfaces

- **WHEN** a point light stands next to a sprite and a character mesh
- **THEN** both the sprite's baked normals and the mesh's live normals pick
  up the light, and surfaces beyond the radius receive none

#### Scenario: Grounding shadow is lit as floor

- **WHEN** a point light stands over the baked grounding shadow of a
  ground-level placement
- **THEN** the shadow pixels receive light as ground-plane surface (up
  normal, ground depth), not as object pixels

#### Scenario: Silhouette pixels shade as the object, not a blend

- **WHEN** a sprite's antialiased silhouette edge stands against ground or
  another sprite's pixels — lit or shadowed
- **THEN** the deferred pass shades the edge fragment with the sprite's own
  baked normal and depth, so no silhouette ring appears whose lighting
  differs from both the object and the backdrop (the coverage-blend
  artifact that showed as a pale outline in front of shadows)

#### Scenario: Albedo still composites at partial coverage

- **WHEN** a sprite's silhouette overlaps any backdrop
- **THEN** the fragment's color blends with the backdrop at the render
  pass's coverage alpha exactly as before — the backdrop shows through the
  antialiased edge unchanged
