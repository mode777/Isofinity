# runtime-directional-shadows Specification

## Purpose

Reconstructs a world-space occluder from the placed sprites' baked g-buffer
data and casts the key directional light's shadow from it at runtime, so a
dynamic day/night key light produces direction-correct shadows that sprites
and characters share.

## Requirements

### Requirement: World-space occluder is reconstructed from baked sprite data

The runtime SHALL build a world-space occluder for the placed scene by
unprojecting the covered texels of every placed sprite's baked g-buffer —
applying the placement's world offset — and accumulating them into a
world-space occluder field. The occluder SHALL be derived at runtime from
data the bundles already carry: no manifest field, world-file field, or
format-version change is introduced, and no source-model geometry is
required, so high-polygon and alpha-masked assets are supported without
decimation. Alpha-masked-out g-buffer texels SHALL cast no occlusion,
matching their empty g-buffer value.

#### Scenario: Occluder derives from shipped bundles

- **WHEN** a world is opened whose bundles predate this change and carry no
  occluder-specific data
- **THEN** the runtime builds the occluder from each placement's baked
  g-buffer, and the world casts directional shadows without any re-bake or
  bundle-format change

#### Scenario: Masked coverage casts no shadow

- **WHEN** a placed asset uses an alpha-mask material whose masked-out texels
  read empty in the baked g-buffer
- **THEN** those regions contribute no occlusion, so a foliage patch casts a
  shadow that follows its kept silhouette rather than a solid block

#### Scenario: A placement's height and position move its occlusion

- **WHEN** the user places or moves a sprite at a non-zero height
- **THEN** its contributed occluder points follow the placement's world
  offset, and the shadow it casts lands where that raised geometry implies

### Requirement: The key directional term is shadowed at runtime

The deferred light pass SHALL scale the key directional term by a per-pixel
visibility in `[0, 1]` determined by whether a ray from the receiver pixel's
reconstructed world position toward the key light is occluded by the
reconstructed occluder. The visibility SHALL gate only the key term; the
ambient term, the baked albedo·AO surface, and point-light terms SHALL be
evaluated exactly as before. When the dynamic-light switch pins shading to
identity, no shadow test SHALL run and the displayed image SHALL be
unchanged.

#### Scenario: A receiver inside a cast shadow loses only the key term

- **WHEN** a ground pixel lies in the shadow cast by a placement along the
  key-light direction
- **THEN** that pixel receives no key-light contribution while its ambient
  contribution and baked albedo·AO are unchanged, so the shadow is tinted by
  the ambient color rather than rendered black

#### Scenario: Surfaces outside any cast shadow are unchanged

- **WHEN** a receiver has an unobstructed ray to the key light
- **THEN** it receives exactly the key term it received before this change

#### Scenario: Dynamic light off skips the shadow test

- **WHEN** the dynamic-light switch is off
- **THEN** the shadow test has no effect on the displayed image

### Requirement: The key-light direction is bounded to a shadow-valid domain

The key-light direction SHALL be constrained to a shadow-valid domain: the
angle between the light direction (toward the light) and the camera's view
direction (toward the camera) SHALL NOT exceed a configured maximum, and the
light's elevation above the ground plane SHALL NOT fall below a configured
minimum. The constraint guarantees the camera-facing reconstructed relief is
a valid, well-conditioned occluder. A requested direction outside the domain
SHALL be clamped into it rather than rejected, and the editor's key-light and
sun-position controls SHALL reflect the clamped direction.

#### Scenario: A requested out-of-domain direction is clamped

- **WHEN** the user sets a key-light direction below the elevation floor or
  outside the allowed angle from the camera axis
- **THEN** the applied direction is clamped to the nearest valid direction in
  the domain and the controls show the clamped value

#### Scenario: Shadows remain well-conditioned across the domain

- **WHEN** the key light moves between two valid directions in the domain
- **THEN** the cast shadow moves accordingly, with no direction in the domain
  producing a degenerate or inverted shadow from the reconstructed relief

### Requirement: Character and sprite shadows compound as one region

Placed dynamic meshes SHALL contribute their geometry to the occluder (as a
per-frame dynamic layer, since characters animate) and SHALL receive the same
key-light visibility sprites receive. A receiver occluded by a sprite and a
receiver occluded by a character SHALL resolve through the same test along
the same light direction, so their shadow regions merge into one area. Where
both a sprite and a character occlude the same receiver, the receiver SHALL
be shadowed once, not double-darkened.

#### Scenario: A character's shadow merges with a sprite's

- **WHEN** a character stands beside a sprite so their cast shadows overlap on
  the ground
- **THEN** the overlapping region reads as one continuous shadow with a
  single key-light reduction, and no seam or doubled darkening appears

#### Scenario: A character is shaded inside a sprite's shadow

- **WHEN** a character stands in the shadow a sprite casts along the key
  direction
- **THEN** the character's lit surface loses the same key term a sprite at
  that world position would lose

#### Scenario: An animated character moves its own shadow

- **WHEN** a character's animation changes its pose
- **THEN** the shadow it casts and receives updates with the pose in the same
  frame, matching the rendered geometry

### Requirement: The occluder rebuilds when the scene or light changes

The static part of the occluder SHALL be rebuilt when a world is loaded and
after any placement edit (add, move, height, facing, or removal), and the
dynamic mesh layer SHALL update every frame that a mesh is placed. With no
placements and no meshes, the occluder SHALL be empty and the key term SHALL
be unshadowed — the render SHALL be identical to the pre-change output for
that document state.

#### Scenario: Editing a placement updates the shadow

- **WHEN** the user moves or erases a placed sprite
- **THEN** the shadow it casts on the next frame reflects its new position or
  its removal, with no re-bake of any sprite bundle

#### Scenario: An empty scene casts no shadow

- **WHEN** a world has no sprite or mesh placements
- **THEN** the key term is unshadowed and the frame matches the pre-change
  renderer for the same document state
