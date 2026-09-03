## 1. SliderRow numeric entry

- [x] 1.1 In `src/app/components/controls.tsx`, replace `SliderRow`'s read-only `<output>` with a controlled text field (`type="text"`, `inputMode="decimal"`, `aria-label={label}`) holding a local `editing: string | null` state: idle shows `format?.(value) ?? String(value)`, focus seeds `editing` with `String(value)`; verify `tsc --noEmit` passes
- [x] 1.2 Implement commit (Enter/focus loss): trim, normalize decimal comma to dot, `Number()`, reject non-finite by reverting, clamp to `min`/`max`, call `onChange` — no step snapping; verify by typing `1.35` into the world intensity field (step `0.05`) and seeing exactly `1.35` applied
- [x] 1.3 Implement Escape-to-cancel (restore current value, leave edit mode) and forward `disabled` to the field; verify Escape on a changed azimuth field reverts it and that a view-only sprite tab's fields are not editable
- [x] 1.4 Add the `.row .value-input` style block in `src/app/app.css` (width matching the old `output` column, existing focus conventions); verify the row layout is unchanged with both panels open

## 2. Cross-control verification

- [x] 2.1 In `npm run dev`, exercise sliders in both panels — world key light (azimuth/elevation/intensity), sun (time-of-day `13:30` idle format, day-of-year clamp `500 → 365`, latitude), sprite bake settings and environment (samples, rotate, exposure) — confirming commit, clamp, reject, and formatted-idle behavior per the spec scenarios, and that dragging still snaps by step and keeps the field in sync
- [x] 2.2 Run `npm run build` and confirm it passes with no new diagnostics
