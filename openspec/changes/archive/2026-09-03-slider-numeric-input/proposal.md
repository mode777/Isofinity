# Slider numeric input

## Why

Every numeric slider in the properties panel (light, sun, bake settings,
environment) shows a read-only readout next to the range control. Setting an
exact value — a specific sun hour, an intensity of `1.35`, a latitude — means
dragging a thumb until the readout happens to land on the wanted number, which
is slow and imprecise. The readout should double as an editable field so any
slider value can be typed exactly.

## What Changes

- The shared slider control (`SliderRow` in `src/app/components/controls.tsx`)
  gains an editable numeric input: the value readout becomes a field the user
  can click into and type a precise number into.
- Commit rules for typed entry: Enter or blur commits; Escape cancels back to
  the current value; non-numeric or empty input is rejected on commit (field
  reverts); out-of-range values are clamped to the slider's min/max.
- Typed values are NOT re-snapped to the slider's step grid — precise entry is
  the point of the feature (step still governs drag/arrows).
- While not being edited, the readout keeps the existing formatted display
  (e.g. `13:30` for time-of-day, `1.35` via `toFixed`, `45°`); while editing,
  the field shows the raw numeric value.
- All sliders pick this up automatically — both the world properties panel
  (key light + sun position) and the sprite properties panel (bake settings +
  environment) use the one shared control. Disabled sliders disable the field.
- Existing `NumberRow` (model scale) is unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the properties-panel controls gain precise numeric
  entry on every slider row (commit/clamp/cancel behavior, formatted idle
  display, disabled state propagation).

## Impact

- `src/app/components/controls.tsx` — `SliderRow` only (its props do not
  change, so `WorldProperties.tsx` and `SpriteProperties.tsx` call sites are
  untouched).
- `src/app/app.css` — styling for the editable readout field within `.row`.
- No engine, bake, persistence, or renderer changes; no new dependencies.
