## ADDED Requirements

### Requirement: Sprites composite baked grounding shadows

The sprite compositor SHALL recognize a third pixel class in the render
pass — pixels whose g-buffer value is empty (zero-length normal) but whose
render alpha is positive and whose color is the dark grounding tint — and
composite them as grounding shadows: alpha-blended without key/ambient
shading, without writing the placement's object depth. Object pixels
(g-buffer non-empty) and fully empty pixels SHALL composite exactly as
before; g-buffer-driven occlusion, hit-testing and discard semantics SHALL
be unchanged.

A grounding-shadow pixel SHALL write its **true ground-plane depth**: the
analytic intersection of the pixel's view ray with the placement's ground
cell plane, using the shared fixed-camera constants (a GLSL twin of the
CPU ground unprojection) — never the object's depth and never no depth.
With the existing painter-sorted batch and LEQUAL depth test this makes
the depth buffer resolve every interleaving pixel-accurately:

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

### Requirement: Raised placements suppress the baked grounding shadow

A placement whose height is not the ground level SHALL NOT composite its
baked grounding shadow from the sprite quad (it would float with the
object); the existing contact-shadow ellipse behavior covers those
placements as before. Ground-level placements composite the baked shadow.
The suppression SHALL be per-instance (the shader knows the placement
height) and SHALL NOT require separate draws or batches.

#### Scenario: Raised placement keeps the ellipses, drops the baked patch

- **WHEN** a placement with a baked grounding shadow is raised above the
  ground plane
- **THEN** the baked shadow pixels do not composite while the placement's
  contact-shadow ellipse still shows, and lowering it back to the ground
  restores the baked patch
