# runtime-deferred-lighting Specification

## Purpose

The unified two-phase world compositor: geometry draws ground, meshes and
sprites into a screen-space g-buffer (world normal + linear depth) plus an
unlit albedo·AO surface, and one deferred fullscreen pass applies every
dynamic light — ambient, directional key, and point lights — over the
reconstructed world position and baked normals, replacing per-draw forward
shading.

## Requirements

### Requirement: Two-phase frame with a deferred light pass

The world compositor SHALL render the world in two phases: a geometry pass
that draws the ground, placed meshes, and placed sprites into an offscreen
framebuffer carrying (a) a screen-space g-buffer attachment — per-pixel
world-space normal in rgb and linear reference-plane depth in alpha, the
same channel layout as the per-sprite bake g-buffer — and (b) an unlit
albedo·AO color attachment; and a deferred light pass that samples both,
reconstructs world position from the g-buffer depth using the fixed-camera
constants, and applies the multiplicative dynamic-light factor
(`albedo·AO × (ambient + key·N·L + point-light terms)`) once for every
surface kind. Per-pixel occlusion semantics (shared depth convention,
painter-sorted blended compositing, discard rules) SHALL be unchanged: the
geometry pass resolves exactly the same surfaces per pixel the forward
compositor did.

#### Scenario: Key light change reaches every surface kind

- **WHEN** the user changes the key light direction, color, or intensity
- **THEN** sprites, meshes, and the ground all respond to the same change
  through the single deferred light pass, with no per-kind shader changes

#### Scenario: Occlusion is unchanged by the restructure

- **WHEN** sprites and meshes interpenetrate or stack as today
- **THEN** the per-pixel occlusion boundaries resolve exactly as the forward
  compositor resolved them


### Requirement: The screen-space g-buffer covers all geometry

Every surface the geometry pass draws SHALL write the screen-space g-buffer:
the ground plane writes its surface normal (the normal map's perturbation
when a material is selected, world up otherwise) and its plane depth; placed
meshes write their live skinned normals and world depth; placed sprites write
their baked g-buffer normal and depth (plus the placement's world offset).
A sprite's grounding-shadow pixels — g-buffer-empty, shadow-tinted in the
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


### Requirement: Ambient is evaluated in the deferred pass from live normals

The ambient term SHALL be evaluated in the deferred light pass from the
g-buffer normal — the SH irradiance probe when an environment resolves,
flat black otherwise — uniformly for sprites, meshes, and ground. The
albedo·AO attachment SHALL carry no ambient shading (a sprite's stored
albedo·AO is its baked render texel; a mesh's is its environment-lit
tonemapped texel; the ground's is its material albedo times its AO).

#### Scenario: Ambient unifies across surface kinds

- **WHEN** the user picks a new ambient color
- **THEN** sprites, meshes, and the ground tint identically through the one
  deferred evaluation


### Requirement: Dynamic light off skips the deferred pass

With the Dynamic light switch disabled the compositor SHALL present the
albedo·AO attachment unmodified — the pure prerendered image for sprites,
the environment-lit look for meshes, the flat material color for the
ground — by skipping the deferred light pass (identity factor), exactly the
off behavior the forward compositor had.

#### Scenario: Switch off shows pure prerender

- **WHEN** the user disables the dynamic light
- **THEN** sprites show their baked images unshaded and no light pass runs;
  grounding shadows remain composited as part of the prerendered image


### Requirement: Point lights render with radius, energy, and color

Each point light placement SHALL contribute to the deferred light pass: a
quadratic window attenuation from full energy at its position to zero at its
radius (world units), scaled by its linearized color and energy, applied
with the same `max(dot(N, L), 0)` normal gating as the key light. At most
16 point lights SHALL be rendered concurrently (a compile-time cap);
placements beyond the cap SHALL render without light contribution while the
world stays usable.

#### Scenario: Falloff reaches zero at the radius

- **WHEN** a point light is placed with a given radius
- **THEN** surfaces at the light's position receive full energy and the
  contribution fades quadratically to nothing at the radius edge

#### Scenario: More than 16 lights stay placeable

- **WHEN** the user places a 17th point light
- **THEN** the placement succeeds, the first 16 lights render, and the rest
  contribute no light while the editor remains fully functional


### Requirement: Point lights are placeable and erasable like sprites

A point light SHALL be a placement kind in the world editor: it is placed
from the toolbar at the cursor's ground position (height from the brush
height control), ghosted before placement, erased by the eraser like other
placements, and editable in the properties panel — radius, energy, color,
and position (ground position and height). The light itself SHALL NOT be
drawn as a visible object beyond its editor marker; with the dynamic light
switch off, markers stay visible but lights contribute nothing.

#### Scenario: Place and erase a light

- **WHEN** the user selects the point-light tool, clicks to place, then
  erases the light
- **THEN** the light contributes from placement until erase, with no
  sprite/mesh placement affected

#### Scenario: Properties update live

- **WHEN** the user changes a placed light's radius, energy, or color in the
  properties panel
- **THEN** the deferred light pass reflects the change on the next frame


### Requirement: Point lights persist with the world

Point light placements SHALL persist through world save/load exactly like
sprite placements (see world-persistence), and SHALL be accepted only in
`isoinfinity-world/6` files and newer.

#### Scenario: Lights round-trip

- **WHEN** a world with point lights is saved and reloaded
- **THEN** every light stands at the same position with the same radius,
  energy, and color


