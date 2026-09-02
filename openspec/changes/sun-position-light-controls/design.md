## Context

The light panel (`index.html` `#light-panel`) currently binds five
controls plus the Dynamic light checkbox; `updateLightUniforms()` in
`src/runtime/main.ts` builds the key direction from azimuth/elevation
degrees and uploads ambient as a scalar replicated to a vec3. The
renderer's ambient uniform is already a vec3 and the fragment shader just
adds it — so the ambient color change is CPU-side only. Shared,
dependency-free math lives in `src/shared/` (`iso.ts` is the model: pure
functions, no DOM, shared with the bake tool). See proposal.md for
motivation; the deltas in `specs/` pin the behavior.

## Goals / Non-Goals

**Goals:**

- Realistic sun aiming from time-of-day / day-of-year / latitude.
- Manual azimuth/elevation override still possible at all times.
- Tinted ambient light via color picker; shader untouched.
- Solar math as a pure, dependency-free, Node-testable function.

**Non-Goals:**

- Real geography: no longitude, timezone, or date-picker; time is local
  solar time.
- Sky/atmosphere rendering changes, animated day cycle, or key-light
  presets.
- Updating the boot-bake procedural environment's sun disc to follow the
  chosen sun position (boot bakes stay lit by the default key direction;
  re-baking on every slider move is out of scope).

## Decisions

1. **Solar algorithm: NOAA-style low-precision approximation, in a new
   `src/shared/sun.ts`.** Inputs `(dayOfYear, hourOfDay, latitudeDeg)`;
   outputs `{ azimuthDeg, elevationDeg }` using the standard fractional-
   year declination + hour-angle formulation (accuracy well under 1°,
   irrelevant for art direction). Local solar time means the equation of
   time and longitude cancel out of the hour angle. Alternatives: an
   ephemeris library (new dependency for no visible gain) or a full
   NOAA spreadsheet port with EoT (only matters for clock time, which we
   don't take as input). Rejected both.
2. **Axis mapping stays in the panel's existing convention.** The panel's
   azimuth 0° = world +x, 90° = world +z (`updateLightUniforms`).
   `sun.ts` documents a fixed compass→world mapping (+x = east,
   +z = north→world axes chosen so compass south at northern latitudes
   reads naturally) and converts once, so `updateLightUniforms` and the
   bake-side convention stay untouched. Alternative — re-parametrizing
   everything to compass degrees — was rejected: it would change bake
   docs and shader-adjacent code for zero user-visible benefit.
3. **Sun-position sliders write through to the az/el state and their DOM
   controls.** On input: compute, assign `light.azimuthDeg/elevationDeg`,
   then set the `light-az`/`light-el` input `.value`s and output texts.
   Manual edits keep working unchanged because they write the same state.
   Alternative — a mode toggle separating "manual" and "sun" modes —
   rejected as extra UI state the user didn't ask for.
4. **Night handling: clamp, don't disable.** Computed elevation clamps
   into the elevation slider's [5°, 85°] range, azimuth wraps into
   [0°, 360°). Below-horizon suns become a 5° grazing light. This keeps
   the invariant that the three sun sliders and the az/el sliders always
   agree — and avoids a fourth "night" state in the shading path.
   Alternative: auto-uncheck Dynamic light at night — rejected (surprising
   side effect on an unrelated control).
5. **Ambient color: replace the scalar, factor the sRGB decode.**
   `LightState.ambient: number` becomes `ambientHex: string`; a small
   `srgbHexToLinearRgb(hex)` helper replaces the copy-pasted parseInt/
   srgbToLinear key-color code and serves both key and ambient. Default
   ambient `#a8a8a8` (≈0.40 linear per channel — matches today's default
   scalar so the boot look doesn't shift). Old scalar range [0, 1.5] is
   not preserved: white caps ambient at 1.0/channel — accepted per the
   request; key intensity still scales overall brightness.

## Risks / Trade-offs

- [Approximate solar position (±<1°, no EoT)] → Fine for art direction;
  documented in `sun.ts`; not a navigation instrument.
- [Zenith singularity near 90° elevation (equator/equinox noon) makes
  azimuth ill-conditioned] → Elevation clamps at 85° anyway, so the
  degenerate point is unreachable; azimuth noise there is harmless.
- [Clamped night light keeps the scene lit at midnight] → Deliberate
  (decision 4); the Dynamic light checkbox remains the way to see the raw
  prerender.
- [Ambient can no longer exceed 1.0/channel] → Accepted; noted in specs
  (no separate ambient intensity control).

## Migration Plan

No persisted state, no format changes — pure UI/runtime behavior. Ship
behind nothing; rollback is reverting the commit. `docs/runtime.md`'s
Lighting section updates in the same change.

## Open Questions

None.
