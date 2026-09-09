# runtime-sprite-rendering delta

## MODIFIED Requirements

### Requirement: Every sprite displays the shaded prerendered image

The runtime SHALL display every placed sprite from its prerendered lit
image, shaded by the world's dynamic lights through the unified deferred
light pass: the sprite's geometry-pass draw writes its baked render texel
as the albedo·AO surface and its baked g-buffer normal and depth (plus the
placement's world offset) into the screen-space g-buffer, and the deferred
pass applies the multiplicative factor (ambient + key + point lights) over
the baked normal. The ambient term SHALL be the per-channel ambient color
evaluated in the deferred pass (see the deferred-lighting capability). The
global Dynamic light switch SHALL pin shading to identity when disabled
(pure prerendered image, light pass skipped). Sprite shading SHALL be
pixel-equivalent to the forward multiplicative model it replaces for every
light state the forward model supports.

#### Scenario: Boot-baked sprites show rendered images

- **WHEN** the runtime page finishes loading
- **THEN** every test primitive displays as a path-traced, shaded sprite
  and responds to the key light controls

#### Scenario: Key light shading applies uniformly

- **WHEN** the user adjusts the key light or ambient controls
- **THEN** all placed sprites — boot-baked and bundle-loaded alike —
  respond identically to the change

#### Scenario: No point lights means no sprite shading change

- **WHEN** a world without point lights renders under the same key/ambient
  state before and after this change
- **THEN** sprite pixels shade identically (the deferred factor reproduces
  the forward multiplicative formula exactly)

### Requirement: Sprites composite baked grounding shadows

The sprite compositor SHALL recognize a third pixel class in the render
pass — pixels whose g-buffer value is empty (zero-length normal) but whose
render alpha is positive and whose color is the dark grounding tint — and
composite them as grounding shadows: alpha-blended without key/ambient
shading of the object texel, without writing the placement's object depth
to the shared depth buffer. In the screen-space g-buffer a grounding-shadow
pixel SHALL map to the ground plane: it writes the true ground-plane depth
at that pixel (the analytic intersection of the pixel's view ray with the
placement's ground cell plane, using the shared fixed-camera constants) and
world-up as normal, so the deferred pass lights it as floor. Object pixels
(g-buffer non-empty) and fully empty pixels SHALL composite exactly as
before; g-buffer-driven occlusion, hit-testing and discard semantics SHALL
be unchanged.

With the existing painter-sorted batch and LEQUAL depth test this keeps the
depth buffer resolving every interleaving pixel-accurately:

- a farther sprite's opaque pixels are darkened by the shadow drawn over
  them (the shadow's ground depth is nearer and passes the test),
- a nearer sprite's opaque pixels overwrite the shadow,
- overlapping shadows of different placements resolve to the nearer
  ground point instead of double-darkening.

#### Scenario: Shadow darkens the ground and things standing behind it

- **WHEN** a placement carrying a baked grounding shadow stands on the
  ground with another sprite behind it
- **THEN** the shadow patch darkens the bare ground and the base of the
  farther sprite, while sprites nearer than the shadow's ground area
  composite over it unmodified

#### Scenario: Shadow does not claim object depth

- **WHEN** any sprite is drawn after a placement with a grounding shadow,
  overlapping the shadow's pixels
- **THEN** the later sprite's per-pixel depth test resolves against the
  shadow's ground-plane depth, so no part of the world is occluded by the
  shadow's pixels

#### Scenario: Legacy sprites without shadow pixels are unchanged

- **WHEN** a sprite bundle baked before this change (or with the toggle
  off) is placed
- **THEN** its compositing is pixel-identical to the pre-change runtime —
  the shadow pixel class never fires

#### Scenario: Shadow stays visible with dynamic light off

- **WHEN** the Dynamic light switch pins shading to identity
- **THEN** the grounding shadow remains composited (it is part of the
  prerendered image, like the object's own baked light)
