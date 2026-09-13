## Purpose

Dynamic meshes — skinned, animated characters — rendered inside the world
compositor alongside baked sprites: per-pixel occlusion through the shared
world depth convention, lighting matched to the world's dynamic light,
placed and erased through the existing brush machinery as editor-session
state.

## Requirements

### Requirement: Animated meshes render inside the world frame

The world compositor SHALL render placed character meshes in the same
frame as sprites, ordered so that opaque mesh pixels are drawn before
blended sprite pixels and every mesh/sprite overlap is resolved
pixel-accurately: sprite pixels behind mesh depth are discarded, sprite
pixels in front composite over the mesh, and sprite-transparent pixels
reveal the mesh. The character's animation SHALL play continuously in
place while the placement exists, at wall-clock pace, looping its clip.

#### Scenario: Mesh and sprite interpenetrate

- **WHEN** a character is placed so its geometry crosses a sprite cube's
  surface
- **THEN** the intersection line is resolved per pixel with no whole-sprite
  draw-order artifacts: mesh surface in front shows mesh, sprite surface in
  front shows sprite

#### Scenario: Mesh behind a sprite's transparent region

- **WHEN** a character stands behind a sprite whose edge pixels are
  partially transparent
- **THEN** the character shows through the transparent region and is hidden
  behind opaque sprite pixels

#### Scenario: Character animates in place

- **WHEN** a character placement exists
- **THEN** its animation plays and loops continuously without user input,
  and stops when the placement is erased

### Requirement: Mesh depth shares the world depth convention

Every rendered mesh fragment SHALL write the same window depth a sprite
fragment at the same world point would write — the linear map of
`dot(worldPos, viewDir)` used by the sprite batch — so the existing
LEQUAL depth buffer resolves mesh/mesh and mesh/sprite interpenetrations
identically, including stacking and raised placements.

#### Scenario: Stacked characters interpenetrate correctly

- **WHEN** two character meshes overlap in screen space at different
  depths
- **THEN** the nearer surface wins per pixel regardless of placement order

#### Scenario: Character on a raised sprite surface

- **WHEN** a character is placed at a height above the ground plane beside
  stacked sprites
- **THEN** its occlusion against those sprites matches the sprites' own
  occlusion behavior at the same height

### Requirement: Mesh shading matches the world's light

Placed characters SHALL be shaded by the world's dynamic lights through the
unified deferred light pass: the mesh's geometry-pass draw writes its
environment-lit tonemapped texel (SH irradiance over live skinned normals,
through the bake's ACES curve) as the albedo·AO surface and its live
skinned normals and world depth into the screen-space g-buffer; the
deferred pass applies the multiplicative factor (ambient + key + point
lights) over the live normals — the same evaluation, in the same pass, a
sprite texel at the same world point receives. The ambient probe SHALL be
derived from the environment recorded in the loaded sprite bundles'
provenance; when no bundle provides one, it SHALL fall back to the built-in
default environment. With the dynamic-light switch off, characters SHALL
show the environment-lit look only — the same pure-prerendered appearance
sprites show. A mesh texel and a sprite texel of equal material and light
SHOULD produce near-equal color: the mesh no longer applies the factor
post-tonemap in its own shader (the accepted appearance shift that unifies
light response across surface kinds).

#### Scenario: Dynamic light changes reach the mesh

- **WHEN** the key light direction, color, or ambient color changes
- **THEN** the character's shading changes exactly as nearby sprites'
  shading does, through the same deferred pass

#### Scenario: Point lights reach the character

- **WHEN** a point light is placed beside a character
- **THEN** the character's live normals pick up the light with the same
  attenuation and gating a sprite at the same world point receives

#### Scenario: Dynamic light off

- **WHEN** the dynamic-light switch is disabled
- **THEN** the character shows its environment-lit appearance only, the
  mesh equivalent of the pure prerendered sprite image

#### Scenario: Ambient probe from bundle provenance

- **WHEN** a world's sprite bundles record an HDRI environment in their
  provenance
- **THEN** the character's ambient term is derived from that environment;
  with no resolvable environment, the default environment is used
### Requirement: Character brush behaves like a sprite brush

The character SHALL be placeable and erasable through the existing
placement tools: a depth-tested ghost previews the animated character at
the cursor before placing, the contact shadow follows placement height,
raised placements work as for sprites, erase removes the placement picked
under the cursor (the same pixel-accurate pick the Select tool uses:
g-buffer silhouette and depth for sprites, screen-space proximity for the
character and point lights), whatever its kind, and surface snap computes
the landing height from sprite g-buffers exactly as it does for sprite
brushes.

#### Scenario: Ghost preview occlusion

- **WHEN** a character brush hovers over the world among placed sprites
- **THEN** the ghost shows the character per-pixel occluded exactly as the
  placement would sit

#### Scenario: Erase resolves topmost

- **WHEN** the eraser is used where a character and sprites overlap
- **THEN** the placement under the cursor is removed, whatever its kind,
  exactly as the Select tool would pick it

#### Scenario: Surface snap onto sprites

- **WHEN** surface snap is enabled and the character brush hovers over a
  sprite surface
- **THEN** the character lands at the height the sprite surface under the
  cursor implies, identical to the sprite brush behavior

### Requirement: Mesh placements are editor-session state

Character placements SHALL live only in the in-memory world document:
saving a world SHALL write exactly today's world JSON (no mesh fields),
loading a world SHALL ignore mesh placements without error, and a
reloaded world SHALL contain no characters. No persisted format changes.

#### Scenario: World save round-trip unaffected

- **WHEN** a world containing character placements is saved and reloaded
- **THEN** the JSON is valid today-format world JSON, sprites and lights
  round-trip, and no characters appear after reload

#### Scenario: Old worlds load unchanged

- **WHEN** an existing `isoinfinity-world/3` (or `/1`, `/2`) file is
  loaded
- **THEN** it opens exactly as before this change

### Requirement: Empty mesh set is a no-op

With no character placed, the world frame SHALL render exactly as before
this change: the sprite path (shading, blending, occlusion, batch order)
is untouched, and adding the mesh batch SHALL not shift, tint, or re-order
any existing pixel.

#### Scenario: Existing world regression guard

- **WHEN** a world without mesh placements is rendered after this change
- **THEN** the frame is visually identical to the pre-change renderer
  output for the same document state


### Requirement: Meshes cast and receive directional shadows

Placed character meshes SHALL participate in the world's directional shadow
system: their animated geometry SHALL contribute to the reconstructed
occluder each frame, and their shaded surfaces SHALL lose the key directional
contribution wherever the reconstructed occluder blocks the key light. A mesh
SHALL receive the same per-pixel visibility a sprite at the same world
position receives, and its cast shadow SHALL merge with sprite shadows as one
region rather than being drawn as a separate overlay. With no mesh placed,
the mesh shadow path SHALL add nothing to the frame.

#### Scenario: Character receives a sprite's cast shadow

- **WHEN** a character stands where a placed sprite occludes the key light
- **THEN** the character's key-lit surfaces darken in the same region the
  sprite's shadow covers, with no separate shadow geometry drawn for it

#### Scenario: Character casts onto the ground and other surfaces

- **WHEN** a character stands on the ground with the key light to one side
- **THEN** its animated silhouette casts a shadow along the light direction
  onto the ground and onto any sprite surface behind it

#### Scenario: No character placed adds no cost or artifact

- **WHEN** a world contains no mesh placements
- **THEN** the mesh shadow contribution is empty and the frame is unchanged
  from a world rendered without this capability
