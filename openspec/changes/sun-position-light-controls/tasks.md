## 1. Solar-position math

- [x] 1.1 Create `src/shared/sun.ts` with a dependency-free pure
  `sunDirection(dayOfYear, hourOfDay, latitudeDeg)` returning
  `{ azimuthDeg, elevationDeg }` using the NOAA-style declination +
  hour-angle approximation in the panel's azimuth convention (design
  decision 2); document accuracy, solar-time basis, and the compass→world
  axis mapping. Verify: `npx tsc src/shared/sun.ts --outDir /tmp/opencode/sun-check`
  then run a scratch Node script — equinox noon @ 45°N ≈ 45° elevation
  (due south), midwinter noon elevation < midsummer noon at the same
  latitude, below-horizon times report negative elevation.

## 2. Ambient color

- [x] 2.1 In `src/runtime/main.ts`, factor `srgbHexToLinearRgb(hex):
  [number, number, number]` out of the key-color upload and replace
  `LightState.ambient: number` with `ambientHex: string` (default
  `#a8a8a8`); upload the decoded linear RGB as the ambient vec3.
  Verify: `npm run build` passes and the boot scene's ambient brightness
  matches the previous default (white sprites ≈ same fill).

## 3. Panel UI

- [x] 3.1 In `index.html`, replace the Ambient range input with an
  ambient `<input type="color">` (id `light-ambient`, default `#a8a8a8`)
  and add three sun-position sliders — time of day (0–24, step 0.25),
  day of year (1–365, step 1), latitude (−66…66, step 1, default 45) —
  under a "Sun position" sub-heading in the Key light panel; bind the
  ambient picker in `main.ts`. Verify: `npm run dev`, panel shows the
  picker (no ambient slider) and picking a saturated color tints sprite
  fill and ground.
- [x] 3.2 Bind the three sun sliders in `main.ts`: on input, call
  `sunDirection`, clamp elevation into the elevation slider's range
  ([5°, 85°]) and wrap azimuth into [0°, 360°), assign
  `light.azimuthDeg/elevationDeg`, and sync the `light-az`/`light-el`
  inputs and outputs. Verify in `npm run dev`: moving time-of-day jumps
  the az/el sliders + readouts and re-lights the scene; 12:00 equinox
  45°N gives ≈45° elevation; a midnight setting settles the elevation
  slider at its minimum with a grazing light still shading; nudging
  azimuth afterwards applies manually until the next sun-slider edit.

## 4. Docs and verification

- [x] 4.1 Update the Lighting section of `docs/runtime.md`: sun-position
  controls (solar-time basis, clamping) and ambient color replacing the
  scalar. Verify: doc matches the shipped panel; `npm run build` passes.
