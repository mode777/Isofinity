## MODIFIED Requirements

### Requirement: The sprite origin anchor is settable in the north view

The sprite editor's properties panel SHALL offer an origin control for the
document: three numeric inputs (X/Y/Z, in asset-space world units measured
from the box min corner of the source's unrotated box) and a convenience
button that sets the origin to the center of the ground plane — half the
box's X and Z extent at ground level (Y = 0). The inputs SHALL be editable
only while the N slot is active; other slots SHALL present the value
non-editably with a hint that the origin is set in the north view.
Non-finite input SHALL be rejected and values SHALL clamp into the box
extent per axis, so the anchor stays on the asset. Editing the origin SHALL
update every baked view's recorded origin immediately — without requiring a
re-bake, since the passes do not depend on the anchor — and SHALL mark the
document dirty. A new document SHALL default to the box min corner, and
changing the uniform scale of a model source SHALL rescale the origin
proportionally so it keeps marking the same relative spot of the asset. The
viewport's bounding-box overlay SHALL mark the current origin point with
its origin cross.

The anchor SHALL be framing-independent authoring state: baking a slot
SHALL produce the same sprite pixels and the same recorded origin whether
the anchor was authored before or after that bake. The bounding-box overlay
SHALL be projected with the same framing rule the bake used — including the
grounding-shadow pad when the document's grounding shadow is enabled — so
the overlay aligns with the baked pixels in every document state.

#### Scenario: Ground-center button

- **WHEN** the user presses the ground-center button on a document whose
  source box is 2×1×0.5 (after scale)
- **THEN** the origin inputs show (1, 0, 0.25)

#### Scenario: Inputs clamp into the box

- **WHEN** the user enters an X beyond the box extent, or non-numeric text
- **THEN** the value clamps to the box extent in that axis, or is rejected,
  and the stored origin stays finite and inside the box

#### Scenario: Origin edit takes effect without a re-bake

- **WHEN** the user edits the origin on a fully baked document and saves
  the bundle without re-baking
- **THEN** the saved bundle's per-view origins reflect the new anchor and
  the stored passes are pixel-identical to before the edit

#### Scenario: Origin editing is north-only

- **WHEN** the user selects the E slot
- **THEN** the origin inputs are not editable and point to the north view
  for editing

#### Scenario: Scale change keeps the relative anchor

- **WHEN** the user doubles the uniform scale of a model document that has
  a custom origin
- **THEN** the origin values halve proportionally, continuing to mark the
  same relative spot of the asset

#### Scenario: Overlay cross marks the anchor

- **WHEN** the user authors a non-default origin on a document with the
  bounding-box overlay enabled
- **THEN** the overlay's origin cross sits at the projected anchor point
  in every view slot

#### Scenario: Baking after authoring the origin matches baking before

- **GIVEN** a fixed source and a fixed authored origin (e.g. ground center)
- **WHEN** one document is baked with the origin authored first and another
  document is baked at the default origin with the same origin projected
  afterwards
- **THEN** both documents' slot passes have identical pixel dimensions and
  pixel content, and identical recorded per-view origins

#### Scenario: Overlay tracks the grounding-shadow framing

- **WHEN** the bounding-box overlay is shown on a document whose
  grounding shadow is enabled
- **THEN** the projected box edges land on the same pixels the baked box
  occupies in the stored passes, instead of being inset and shifted by the
  missing ground pad
