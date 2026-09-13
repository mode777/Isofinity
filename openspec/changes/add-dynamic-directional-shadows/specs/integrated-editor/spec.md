## ADDED Requirements

### Requirement: Key-light controls are clamped to the allowed shadow domain

The world editor's key-light direction controls (azimuth and elevation) and
the sun-position controls SHALL present and apply only directions inside the
shadow-valid domain defined by the runtime-directional-shadows capability.
Values outside the domain SHALL be clamped to the nearest valid direction
rather than rejected, and the sun-position computation's output SHALL be
clamped by the same rule, so a computed dawn, dusk, or night direction never
leaves the domain. The controls SHALL display the applied (clamped) direction.

#### Scenario: Sun position clamps into the domain

- **WHEN** the computed sun direction for a chosen time, date, and latitude
  falls outside the allowed angle or below the elevation floor
- **THEN** the applied key-light direction is clamped to the nearest valid
  direction and the azimuth/elevation fields display the clamped values

#### Scenario: Typed direction clamps rather than rejects

- **WHEN** the user types an azimuth or elevation value outside the allowed
  domain and commits
- **THEN** the document's light direction is the clamped value and the field
  shows it, consistent with the existing numeric-input clamp behavior

#### Scenario: Valid directions pass through unchanged

- **WHEN** the user sets a direction already inside the domain
- **THEN** the document and the controls use exactly that direction
