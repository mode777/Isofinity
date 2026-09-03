# Design — slider numeric input

## Context

`SliderRow` (`src/app/components/controls.tsx`) is the single slider control;
all 13 slider instances across `WorldProperties.tsx` and
`SpriteProperties.tsx` go through it. It currently renders a
`<label class="row">` containing the range `<input type="range">` and a
read-only `<output>` formatted by an optional `format` callback. The panel
grid and styling live in `.row` rules in `src/app/app.css`. See proposal.md
for motivation.

## Goals / Non-Goals

**Goals:**

- Typed, exact entry for every slider value with predictable commit rules
  (Enter/blur commit, Escape cancel, clamp to range, reject invalid).
- Zero changes to `SliderRow`'s props or call sites — the behavior is
  internal to the control.

**Non-Goals:**

- Reworking `NumberRow` (model scale already has a numeric field).
- Spinners, stepper buttons, or drag-on-readout gestures.
- Undo/history integration beyond the existing document dirty flow.

## Decisions

**Text input styled as the readout, not `type="number"`.**
The `<output>` becomes `<input type="text" inputMode="decimal">`. A number
input's constrained value grammar and browser spinners fight the UX we want:
intermediate states (`""`, `1e`, `-`) must be typable while editing, and
commit-time validation is ours anyway. `inputMode="decimal"` still raises the
numeric keyboard on touch devices. Alternative rejected: keep `<output>` and
overlay a number input on click — more DOM and state for no gain.

**Idle display vs edit display.** The field is a controlled component with a
local `editing: string | null` state. When `editing === null` it shows
`format?.(value) ?? String(value)` (exactly today's readout, so `13:30`,
`45°`, `1.35` displays are preserved); focus sets `editing` to the raw
`String(value)` and subsequent keystrokes edit that text. Blur/Enter commits,
Escape clears `editing` (and blurs). Alternative rejected: always show the
raw number — loses the formatted readouts that exist today.

**Commit rules in one helper.** On commit: trim; normalize a decimal comma to
a dot; `Number()`; reject unless `Number.isFinite` (revert, i.e. clear
editing); otherwise `Math.min(max, Math.max(min, v))` and call `onChange`.
No step snapping — precise entry is the feature; `step` continues to govern
drag and arrow keys on the range control. Out-of-range clamps rather than
rejects, matching the range input's own clamping behavior.

**Accessibility of the two-control row.** The wrapping `<label>` stays bound
to the range (first control) as today; the value field gets
`aria-label={label}` so screen readers name it. Clicking the label text keeps
focusing the slider, not the field.

**Disabled propagation.** `disabled` is forwarded to the range and the field
alike (view-only sprite tabs).

**CSS.** One new rule block for the field (`.row .value-input`), matching the
current `output` column width; focus styling reuses the existing input focus
conventions in `app.css`.

## Risks / Trade-offs

- [Label element containing two form controls] → range remains the label's
  control; the field is `aria-label`ed, verified manually in the dev server.
- [Committed precise values desync from the step grid] → intentional and
  harmless: documents store full floats (world JSON already does); the slider
  thumb just sits between steps.
- [Value prop changes while the field is focused (e.g. slider dragged with
  field focused — impossible with one pointer, but possible via keyboard
  traversal)] → while `editing` is set the text is the source of truth and a
  later commit overrides; when not editing the field always mirrors the prop.
- [Locale decimal formats] → only decimal comma is normalized; other locales
  fall back to reject-and-revert, which is safe.

## Migration Plan

None. Pure UI control change; no persisted formats, stores, or APIs change.
Rollback is reverting the single control and its CSS.

## Open Questions

None.
