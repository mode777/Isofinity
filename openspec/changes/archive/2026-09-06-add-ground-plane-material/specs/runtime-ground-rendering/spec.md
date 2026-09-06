# runtime-ground-rendering Specification

## Purpose

The world's ground plane: a flat, material-backed surface spanning the world
bounds, rendered as real world-space geometry in the raw WebGL2 compositor
with the same lighting and tone pipeline as dynamic meshes, so sprites and
meshes stand on a lit, depth-correct floor.

## ADDED Requirements

### Requirement: The world has a ground plane

The world view SHALL render a flat ground plane spanning the current world
bounds at height 0. The plane SHALL be rendered as world-space geometry that
writes the same shared linear depth mapping the dynamic mesh path uses, so
sprite pixels occlude and are occluded against it per pixel. The ground
SHALL be backdrop only: it SHALL NOT be pickable, erasable, or removable,
and erase/pick interactions SHALL ignore it.

#### Scenario: Sprites occlude against the ground

- **WHEN** a sprite is placed on the ground plane
- **THEN** the sprite's pixels composite over the ground it covers, and
  ground pixels in front of a sprite's depth (none on a flat plane) do not
  overwrite the sprite

#### Scenario: Ground is not interactive

- **WHEN** the user uses the erase tool or any pick interaction over the
  ground plane
- **THEN** only sprite or mesh placements are resolved and removed; the
  ground plane itself is never selected or removed

### Requirement: Ground materials load from the workspace

Ground materials SHALL be zip files with a `.material` file extension,
stored in the workspace's `materials/` folder. Inside a material zip, each
map SHALL be identified by the file-name pattern
`<material_name>_(diff|arm|nor_gl)_*.(exr|png|jpg)`: a diffuse map
(`diff`), an AO/Roughness/Metal map with the channels encoded in rgb
(`arm`), and a normal map in gl convention (`nor_gl`). A material zip
missing the diffuse map SHALL be reported as invalid and not applied; the
normal map being missing SHALL fall back to flat geometric normals with a
reported notice; the arm map being missing SHALL fall back to no ambient
occlusion. Unsupported map formats SHALL be reported by name.

#### Scenario: A well-formed material zip applies

- **WHEN** the user selects a `.material` zip containing diffuse, arm, and
  `nor_gl` maps from `materials/`
- **THEN** the ground renders with the material's diffuse color, normal
  detail, and ambient occlusion

#### Scenario: Material without a diffuse map is rejected

- **WHEN** the user selects a material zip whose contents do not match the
  diffuse (`diff`) pattern
- **THEN** the selection is reported as invalid, the ground keeps its
  previous material, and the world stays usable

#### Scenario: Missing normal map degrades gracefully

- **WHEN** the user selects a material zip containing only a diffuse map
- **THEN** the ground renders with the diffuse map and flat normals, with a
  notice naming what was missing

### Requirement: Ground shading matches the world lighting

The ground SHALL be shaded per pixel from its material maps using a lean
PBR style: the diffuse map as linearized albedo, the normal map as
tangent-space normal perturbation, and the arm map's red channel as ambient
occlusion over the ambient term. Ambient SHALL come from the world's
equirect HDRI environment the same way dynamic meshes receive it, and the
world's directional key light SHALL be applied on top of the ambient, so
ground and dynamic meshes share one lighting model. Output SHALL pass
through the same ACES tonemap, exposure, and saturation as the dynamic mesh
path. Roughness and metalness channels SHALL be decoded but not yet applied.

#### Scenario: Ground responds to the key light

- **WHEN** the user changes the world's directional light azimuth or
  intensity
- **THEN** the ground's shading changes consistently with dynamic meshes
  under the same light

#### Scenario: Normal map tilts the shading

- **WHEN** the selected material's normal map contains non-flat detail
- **THEN** the ground's shading varies across the detail (surface relief is
  visible under the key light) without geometric displacement

#### Scenario: Tiled material covers the plane

- **WHEN** a material with a tile scale is applied to the plane
- **THEN** the material repeats seamlessly according to the tile scale, in
  world units, across the whole plane

### Requirement: Ground material and tiling are adjustable

The world editor's properties panel SHALL offer a ground material picker
(listing `.material` zips from the workspace's `materials/` folder, with
file-dialog fallback when no workspace is connected) and a numeric tile
scale control. Changing either SHALL update the rendered ground immediately.

#### Scenario: Selecting a material re-renders the ground

- **WHEN** the user picks a different material in the ground properties
- **THEN** the ground re-renders with the new material without reload or
  scene change

#### Scenario: Tile scale changes take effect immediately

- **WHEN** the user adjusts the tile scale value
- **THEN** the material's repeat density on the plane changes immediately
