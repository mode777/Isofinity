## Purpose

Derives the directional light's sun position from human-meaningful inputs —
time of day, day of year, and latitude — so users can aim a realistic sun
without hand-tuning angles, while keeping the raw azimuth/elevation
controls available for manual fine-tuning.

## ADDED Requirements

### Requirement: Sun-position controls compute sun azimuth and elevation

The runtime light panel SHALL provide a time-of-day slider (0–24 h), a
day-of-year slider (1–365), and a latitude slider (−66°…+66°). Moving any
of them SHALL compute the sun's azimuth and elevation from the three
values using a local-solar-time solar-position approximation (solar noon
at 12:00; no timezone or longitude input) and set the directional light's
azimuth/elevation parameters accordingly.

#### Scenario: Equinox noon at mid-latitude

- **WHEN** the user sets 12:00 on the equinox at latitude 45°N
- **THEN** the computed elevation is approximately 45° (sun due south of
  the latitude) and the key light direction updates accordingly

#### Scenario: Seasonal change at fixed time

- **WHEN** the user keeps time and latitude fixed and moves the
  day-of-year slider from midsummer to midwinter (northern latitude)
- **THEN** the computed noon elevation decreases and the light direction
  changes accordingly

#### Scenario: Latitude changes the sun path

- **WHEN** the user keeps time and day fixed and moves the latitude slider
- **THEN** the computed elevation changes (same instant, different place)

### Requirement: Computed sun position drives the existing light controls

Moving a sun-position slider SHALL overwrite the light's
azimuth/elevation values, and the existing azimuth/elevation sliders and
their numeric readouts SHALL update to reflect the computed values. The
azimuth/elevation sliders SHALL remain adjustable afterwards and SHALL
keep overriding the direction until a sun-position slider is moved again.

#### Scenario: Sliders follow the computation

- **WHEN** the user moves the time-of-day slider
- **THEN** the azimuth/elevation sliders and readouts jump to the computed
  sun position and the scene re-lights accordingly

#### Scenario: Manual override persists until the next sun-position edit

- **WHEN** the user nudges the azimuth slider after a computed position,
  then edits time of day again
- **THEN** the manual azimuth applies first, and the new computation
  overwrites both angles again

### Requirement: Computed positions stay inside the panel's slider ranges

The runtime SHALL clamp the computed elevation into the elevation
slider's range and the azimuth into [0°, 360°). When the sun is at or
below the horizon, the light SHALL clamp to the panel's minimum elevation
(a grazing light) rather than pointing up from below the ground or
disabling shading.

#### Scenario: Night time clamps to grazing light

- **WHEN** the user sets a time of day for which the computed sun is below
  the horizon at the current latitude
- **THEN** the elevation slider settles at its minimum and the scene stays
  lit by a grazing key light instead of an underground light
