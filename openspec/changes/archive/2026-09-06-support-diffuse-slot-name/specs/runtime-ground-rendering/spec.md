## MODIFIED Requirements

### Requirement: Ground materials load from the workspace

Ground materials SHALL be zip files with a `.material` file extension,
stored in the workspace's `materials/` folder. Inside a material zip, each
map SHALL be identified by the file-name pattern
`<material_name>_(diff|diffuse|arm|nor_gl)_*.(exr|png|jpg)`: a diffuse map
(`diff`, with `diffuse` accepted as an alias), an AO/Roughness/Metal map
with the channels encoded in rgb (`arm`), and a normal map in gl
convention (`nor_gl`). When a zip contains maps matching both `diff` and
`diffuse` spellings, the `diff`-spelled map SHALL take precedence and the
other SHALL be reported as a duplicate, consistent with the existing
first-match-per-slot rule. A material zip missing the diffuse map (under
either spelling) SHALL be reported as invalid and not applied; the
normal map being missing SHALL fall back to flat geometric normals with a
reported notice; the arm map being missing SHALL fall back to no ambient
occlusion. Unsupported map formats SHALL be reported by name.

#### Scenario: A well-formed material zip applies

- **WHEN** the user selects a `.material` zip containing diffuse, arm, and
  `nor_gl` maps from `materials/`
- **THEN** the ground renders with the material's diffuse color, normal
  detail, and ambient occlusion

#### Scenario: A diffuse map spelled `diffuse` applies

- **WHEN** the user selects a `.material` zip whose diffuse map is named
  `<name>_diffuse_*.(exr|png|jpg)` (arm and `nor_gl` maps optional)
- **THEN** the material is accepted and the ground renders with that
  diffuse map, identically to a `diff`-spelled map of the same content

#### Scenario: Material without a diffuse map is rejected

- **WHEN** the user selects a material zip whose contents match neither
  the diffuse (`diff`) nor the diffuse (`diffuse`) pattern
- **THEN** the selection is reported as invalid, the ground keeps its
  previous material, and the world stays usable

#### Scenario: Both diffuse spellings present resolves with precedence

- **WHEN** the user selects a material zip containing both a
  `<name>_diff_*` and a `<name>_diffuse_*` map
- **THEN** the `diff`-spelled map is used and the `diffuse`-spelled map
  is reported as a duplicate in the non-fatal load notices

#### Scenario: Missing normal map degrades gracefully

- **WHEN** the user selects a material zip containing only a diffuse map
- **THEN** the ground renders with the diffuse map and flat normals, with a
  notice naming what was missing
