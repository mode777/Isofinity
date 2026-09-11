## 1. Shared control

- [x] 1.1 Add the optional slider track to `PreciseNumberRow` in `src/app/components/controls.tsx` (e.g. `slider?: { min; max; step }`): render a range input between the label and the text field whose `onChange` calls the same `onCommit` path, keep the text field's unclamped commit behavior, and export the shared band constants (min −2, max +2, step 0.1). Verify: `npm run build` passes.

## 2. World-editor height rows

- [x] 2.1 Brush height row in `src/app/components/WorldProperties.tsx`: pass the slider to the Brush section's height `PreciseNumberRow` (band constants); confirm the surface-snap branch still replaces the entire row (slider included) with the read-only snap display. Verify: `npm run build`; in `npm run dev` the slider drags the stored height (ghost follows, no dirty mark), a typed `5` keeps the thumb parked at +2, and snapping on/off restores the row.
- [x] 2.2 Selected sprite height row: attach the slider to the sprite `PreciseNumberRow`. Verify in the browser: dragging moves the sprite live between −2 and +2, one undo returns the pre-drag height, typing `−3` applies exactly with the thumb parked at −2.
- [x] 2.3 Selected character height row: same attachment for the character (mesh) `PreciseNumberRow`. Verify in the browser: drag adjusts live and undo restores.
- [x] 2.4 Point light height row: replace the light height `NumberRow` with the slider + precise field control (unclamped typed entry, band slider). Verify in the browser: drag moves the emitter and its rendered light live, undo restores, and the light list's `(x, y, z)` readout tracks the drag.
- [x] 2.5 Check `src/app/app.css` row layout: label + range + text field fit on one row at the panel's width (adjust flex-basis of `.value-input` only if the field gets squeezed). Verify visually in `npm run dev` with all four rows visible.

## 3. Docs and gates

- [x] 3.1 Update `docs/runtime.md` world-editing sections to mention the −2…+2 height sliders (brush + selected placement/light rows) and `docs/roadmap.md` with a Done line. Verify: docs read consistent with the spec deltas; no glossary change needed.
- [x] 3.2 Run the full gate: `npm run build`. Confirm no verify scripts are affected (no changes under `src/bake/` or `src/runtime/`); leave the browser check notes above to the user if any row could not be exercised locally.

## 4. Relative-slider correction (user feedback)

- [x] 4.1 Rework the height slider in `src/app/components/controls.tsx` as a relative offset control: thumb centered at rest, `pointerdown` freezes the drag-start value as base, each tick commits `base + offset`, `pointerup`/`pointercancel`/`blur` recenter (next drag re-anchors, repeated drags compound; keyboard changes lazily rebase). Verify: `npm run build` passes.
- [x] 4.2 Update artifacts (proposal, both spec deltas, design decision 3) to the relative contract; replace parked-thumb scenarios with recenter/compound ones. Verify: deltas read consistently.
- [x] 4.3 Update `docs/runtime.md` (Brush + Select sections) and the `docs/roadmap.md` bullet to the relative wording, then rerun `npm run build`.
