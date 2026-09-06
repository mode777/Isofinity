# 0010 — Transparent-pixel depth rule (grounding shadows)

Status: Accepted (2026-09-06)

## Context

A sprite's render pass historically had two pixel classes: object pixels
(g-buffer non-empty — shaded, depth-writing) and background pixels
(g-buffer empty — discarded). The baked grounding shadow introduced a
third: g-buffer-empty render pixels carrying a blue-dominant, mid-alpha
tint that must composite as a ground darkening. A transparent pixel that
composites while others depth-test raises the question of what depth it
writes — and the wrong answers are tempting.

## Decision

Grounding-shadow fragments write their **true ground-plane depth**: the
analytic intersection of the fragment's view ray with the placement's
ground cell plane (`groundFromWorldImagePx` + `groundDepth`, GLSL twin in
the sprite shader), biased a hair toward the camera for coplanar
comparisons. A shader-written `gl_FragDepth` drives **both** the LEQUAL
test and the write, and because the value is physically true for the
shadow, both are correct: the single painter-sorted sprite batch resolves
every interleaving — farther sprites are darkened, nearer sprites
overwrite, overlapping shadows collapse to the nearer ground point — with
no new batches, no blend-state changes, no draw-order logic.

This rule is general: **any future transparent compositing layer riding
the sprite batch (decals, projected shadows, dynamic-shadow control maps)
must write the depth of the surface it physically lies on — never the
carrying object's depth, never none.**

## Consequences

- The g-buffer remains the only occlusion authority: shadow pixels carry
  no normals or object depth, so hit-testing, erase and sprite-vs-sprite
  occlusion are untouched.
- The ground plane itself still writes no depth (flat batch) or the
  shared map (material plane); the shadow's small bias makes coplanar
  tests resolve in the shadow's favor without visibly lifting it.
- Shadow pixels participate in painter-sorted alpha blending, so a far
  sprite's base is darkened "through" the shadow — the classic 2D-sprite
  behavior, accepted.
- Raised placements suppress shadow pixels in-shader (per-instance
  height), because a quad-riding patch would float with the object; the
  contact-shadow ellipses remain the raised-placement grounding.

## Rejected alternatives

- **Writing the object's depth for shadow pixels**: a fake occluder in
  empty space — later fragments depth-reject against it, punching holes
  in the world behind every shadow.
- **Writing no depth** (`glDepthMask` off around shadow pixels): the mask
  is per-draw state, so object and shadow pixels could not share one
  instanced batch; avoiding the split would require per-placement draw
  interleaving — order hacks the depth buffer exists to prevent.
- **Screen-space-only shadow pixels with no depth interaction** (blend
  unconditionally, draw order only): breaks under any sprite in front of
  the patch and cannot arbitrate overlapping shadows.
