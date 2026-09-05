## ADDED Requirements

### Requirement: Bake projection's clip volume includes the whole model

The bake's fixed isometric orthographic projection SHALL derive its depth
clip planes from the model's projected extent, so the projection's clip
volume always contains the whole model: every part of the source geometry
that the lateral framing already includes SHALL lie strictly between the
near and far planes, in every view slot. Baked passes SHALL show no geometry
missing due to near- or far-plane clipping, at any model size within the
sprite pixel cap. The clip planes are a projection detail only: lateral
framing (padded projected box at the bake's pixels-per-unit), sprite rect,
origin anchor, camera angles, stored depth definition, and pass alignment
SHALL stay unchanged, so a model that already fit the previous clip volume
SHALL bake byte-identical passes.

#### Scenario: Deep model bakes without near-plane clipping

- **WHEN** the user bakes a model whose depth extent along the view
  direction reaches past the previous fixed clip slab
- **THEN** the baked passes contain every part of the model that the
  lateral framing includes, with no geometry clipped away by the near or
  far plane

#### Scenario: Clip planes scale with the model per view slot

- **WHEN** the same large model is baked into multiple view slots
- **THEN** each slot's projection contains its rotated model's full extent,
  and no slot's passes clip geometry that its lateral framing includes

#### Scenario: Small models bake unchanged

- **WHEN** a model is baked whose extent already fit the previous clip
  volume
- **THEN** the baked passes are identical to those of a bake before this
  requirement, with the same sprite rect, origin and pixel alignment
  between passes
