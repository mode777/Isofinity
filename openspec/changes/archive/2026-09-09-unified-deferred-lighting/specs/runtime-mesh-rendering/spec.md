# runtime-mesh-rendering delta

## MODIFIED Requirements

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
