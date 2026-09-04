## ADDED Requirements

### Requirement: Height-based proportional scaling of model sources

A sprite document whose source is a loaded glTF model SHALL offer a height
input in meters alongside the uniform scale control. Entering a desired
height SHALL derive the uniform scale as the desired height divided by the
model's native bounding-box Y extent (the model's height in native file
units), so the model's other axes scale proportionally and the baked model
stands the requested height tall in world units. The panel SHALL display
the model's native height (and, where known, native box extent) in file
units next to the input. The height input and the raw scale control SHALL
stay in sync: editing either updates the other's displayed value. The
meters value SHALL NOT be persisted — provenance continues to record the
derived uniform scale — so re-bake from provenance and bundle saves are
unchanged. The height input SHALL appear only while the document holds the
loaded source model (its native extent); it SHALL appear again after a
provenance re-bake reloads the model, showing the height implied by the
recorded scale.

#### Scenario: Desired height derives the scale

- **WHEN** the user enters `2` meters as the height of a model whose native
  Y extent is `1.8` file units and bakes
- **THEN** the bake applies the uniform scale `2 / 1.8`, the baked model's
  box is `2` units tall in Y, and its X and Z extents scale by the same
  factor

#### Scenario: Height and scale rows stay in sync

- **WHEN** the user sets the raw scale to `2` after entering a height
- **THEN** the height row shows the height implied by that scale, and
  editing the height again updates the scale row to match

#### Scenario: Native height is shown in file units

- **WHEN** a model source is loaded into the sprite document
- **THEN** the properties panel shows the model's native height in file
  units, labelled as file units rather than meters

#### Scenario: Height is not persisted

- **WHEN** the user sizes a model via the height input, saves the sprite,
  and later re-bakes it from provenance
- **THEN** the provenance records only the derived uniform scale, and the
  re-baked sprite matches the saved one exactly

#### Scenario: Height input without the loaded source

- **WHEN** the user opens a sprite bundle whose model file is missing
  (view-only)
- **THEN** no height input is offered, and after a re-bake that restores
  the source model the height input appears showing the height implied by
  the recorded scale

### Requirement: Height input warns before the sprite pixel cap

The properties panel SHALL show, next to the height input, the sprite pixel
size the current scale bakes to at the bake's fixed pixels-per-unit, and
SHALL warn when that size exceeds the bake's sprite pixel cap — before the
user commits to a bake that fails. Baking an oversized sprite SHALL still
fail with the existing named error if attempted.

#### Scenario: Resulting sprite size is previewed

- **WHEN** the user enters a height that bakes to a sprite within the cap
- **THEN** the panel shows the resulting sprite pixel size and no warning

#### Scenario: Oversized height warns

- **WHEN** the user enters a height whose resulting sprite pixel size
  exceeds the cap
- **THEN** the panel warns that the bake would exceed the sprite pixel cap
  and names the offending pixel size, and the bake fails with its existing
  cap error if run anyway
