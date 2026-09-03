## ADDED Requirements

### Requirement: Slider rows accept precise numeric input

Every numeric slider in the properties panel (world key-light and
sun-position controls, sprite bake settings and environment controls) SHALL
pair its range control with an editable numeric value field. Activating the
field SHALL show the raw numeric value for editing; committing (Enter or
focus loss) SHALL apply the entered number to the document exactly as a
slider drag would. Typing SHALL NOT be re-snapped to the slider's step grid —
typed values are precise — but committed values SHALL be clamped to the
slider's range (values below the minimum become the minimum, values above the
maximum become the maximum). Input that is empty or not a valid number SHALL
be rejected on commit: the document is unchanged and the field reverts to the
current value. Escape SHALL cancel editing, restoring the current value
without applying it. When not being edited the field SHALL show the slider's
formatted display (degrees, fixed decimals, or clock time as each slider
defines). A disabled slider SHALL disable its value field.

#### Scenario: Typing an exact value applies it

- **WHEN** the user activates the intensity slider's value field in a world
  tab, types `1.35`, and presses Enter
- **THEN** the document's light intensity becomes exactly `1.35` even though
  the slider's step is `0.05`, and the slider thumb moves to the matching
  position

#### Scenario: Out-of-range entry is clamped

- **WHEN** the user types `500` into the day-of-year field (range 1–365) and
  commits
- **THEN** the applied value is `365` and the field shows it

#### Scenario: Invalid entry is rejected

- **WHEN** the user clears the elevation field or types non-numeric text and
  commits
- **THEN** the document is unchanged and the field reverts to the current
  value

#### Scenario: Escape cancels editing

- **WHEN** the user changes the text in the azimuth field and presses Escape
- **THEN** the document is unchanged and the field shows the current azimuth
  again

#### Scenario: Formatted display when idle

- **WHEN** a time-of-day slider holds `13.5` and is not being edited
- **THEN** its field shows the formatted clock time (`13:30`), not the raw
  number

#### Scenario: Disabled sliders disable the field

- **WHEN** a view-only sprite tab shows the environment sliders
- **THEN** the value fields cannot be edited, same as the sliders
