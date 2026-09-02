## Why

The runtime editor aims the directional light with raw azimuth/elevation
sliders, which forces users to guess angles to get a plausible sun. The
ambient fill term is likewise a single gray scalar, so scenes cannot receive
tinted ambient light. Both make lighting the scene less convenient than it
should be.

## What Changes

- Add sun-position controls to the light panel: a time-of-day slider
  (0–24 h), a day-of-year slider (1–365), and a latitude slider
  (−66°…+66°, default 45°N). Moving any of them computes the sun's
  azimuth/elevation via a standard solar-position approximation and
  updates the light state.
- The existing azimuth/elevation sliders remain for manual fine-tuning;
  the sun-position sliders overwrite their values (and their displayed
  readouts) when moved.
- **BREAKING** (UI only): replace the ambient scalar slider with an
  ambient color picker. The picked sRGB color is converted to linear RGB
  per channel and uploaded as the ambient term; the separate ambient
  scalar goes away (brightness comes from the picked color).
- Assumptions (recorded, low-stakes):
  - Time of day is local solar time (sun crosses the meridian at 12:00);
    no timezone/longitude input.
  - Solar-position math is a standard daylight approximation (NOAA-style
    declination + hour angle), accurate enough for art direction — not an
    ephemeris library.

## Capabilities

### New Capabilities

- `sun-position`: deriving directional-light azimuth/elevation from
  time-of-day, day-of-year, and latitude, and driving the existing
  azimuth/elevation light parameters from those controls.

### Modified Capabilities

- `runtime-sprite-rendering`: the ambient lighting term becomes a
  per-channel ambient color set by a color picker instead of a uniform
  scalar; the "shaded prerendered image" behavior now responds to ambient
  color.

## Impact

- `index.html` — light panel markup (sun-position sliders, ambient color
  input replacing the ambient range input).
- `src/runtime/main.ts` — light state shape, uniform upload (ambient
  becomes per-channel), input binding for the new controls.
- New `src/shared/sun.ts` — dependency-free solar-position math shared
  style with `src/shared/iso.ts` (pure function, no DOM).
- `docs/runtime.md` — Lighting section update.
- Renderer and shaders are unchanged: the ambient uniform is already a
  vec3; only the CPU-side value source changes. No bake/asset changes.
