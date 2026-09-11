# Design — Editor height sliders

## Context

The properties panel already has three numeric row controls in
`src/app/components/controls.tsx`:

- `SliderRow` — range input + text field, but its text input **clamps to the
  band** on commit (used for shadow, radius, energy, sun, etc.).
- `NumberRow` — live `<input type="number">` with hard min/max (used for
  positions and the point-light height, −99…+99).
- `PreciseNumberRow` — text field with commit-on-Enter/blur, Escape cancel,
  and *optional* clamping; the height fields (brush, sprite, character) use it
  with **no** min/max, per the unclamped-height requirement.

The four height rows in `src/app/components/WorldProperties.tsx`: brush
`heightLevel` (lines ~89–93, swapped for a read-only snap display while
surface snap is on), selected sprite `y` (~150–154), selected character `y`
(~205–209), selected light `y` (~284–290, the only `NumberRow`). All four
commit through store actions that already validate finite input and handle
undo (`setHeightLevel`, `patchSprite`, `patchMesh`, `setLightPlacement`).
The brush height is per-document in-memory editor state — never serialized
into world files (ADR 0006); placement/light heights persist as they always
have.

## Goals / Non-Goals

**Goals:**

- One shared control that renders a slider and a precise numeric field on a
  single row, so all four height rows stay visually and behaviorally identical.
- Slider band fixed at −2…+2; typed entry keeps its exactness (unclamped for
  brush/sprite/character heights).
- Zero store/model changes — the control is a pure view-layer addition.

**Non-Goals:**

- No grouped "one command per drag" undo batching (that is a cross-cutting
  interaction change affecting every existing `SliderRow`, not just heights).
- No new range enforcement in the store or the world model.
- No keyboard shortcuts, no x/z sliders.

## Decisions

1. **Extend `PreciseNumberRow` with an optional slider track** rather than
   adding a fourth component or composing two rows. New optional prop, e.g.
   `slider?: { min: number; max: number; step: number }`; when present the row
   renders `<input type="range">` between the label and the text field,
   calling the same `onCommit` the text field uses.
   - *Alternative: reuse `SliderRow`* — rejected: its text input clamps to the
     band, which would break the unclamped-height contract.
   - *Alternative: new standalone `RangeNumberRow` component* — rejected:
     duplicates the commit/Escape conventions `PreciseNumberRow` already
     owns; drift risk.
2. **Slider commits continuously, one `onCommit` per step.** Dragging calls
   `onCommit(v)` for each step tick, exactly how the existing `SliderRow` rows
   (shadow, radius, energy) already apply values. Placement/light edits
   therefore record per-step undoable commands, matching today's slider
   behavior; the brush height stays non-dirtying in-memory state.
   - *Alternative: buffer the drag and commit once on release* — rejected for
     this change: requires new plumbing in every consumer action; out of scope
     (see Non-Goals).
3. **Relative offset slider (user correction).** The thumb displays an
   offset from the value at drag start: `pointerdown` freezes the current
   value as the base, each change tick commits `base + offset`, and
   `pointerup`/`pointercancel`/`blur` recenter the thumb (offset 0, base
   cleared). A change arriving with no base (keyboard arrows) lazily
   rebases on the current value, so arrow keys nudge from where things
   stand.
   - *Alternative: absolute −2…+2 band with the thumb parked at the nearer
     end for out-of-band values* — rejected (the original implementation):
     heights are unbounded, so for a placement at height 6 the absolute
     band is dead track; the useful adjustment is always "a bit up/down
     from here", and compounding drags reach any value.
4. **Shared band constants.** `HEIGHT_SLIDER_MIN = -2`, `HEIGHT_SLIDER_MAX =
   2`, step `0.1` (assumption: fine enough for placement nudges, coarse
   enough to hit exactly; trivially tunable later), exported from
   `controls.tsx` (or a small module-level constant in `WorldProperties.tsx`)
   so all four rows agree by construction. They bound the *offset* from the
   drag-start value, not the height itself.
5. **Unify the light height row on the same control.** The light's height
   `NumberRow` (−99…+99, live spinner) is replaced by the slider + precise
   field like the other three heights: commit on Enter/blur, unclamped typed
   entry. This trades the spinner arrows for consistency with every other
   height field and the editor's precise-numeric-input convention; the slider
   covers quick tweaks.
   - *Alternative: keep `NumberRow` and bolt a slider next to it* — rejected:
     two different height-row shapes in one panel, and the row gets cramped.
6. **Layout reuses the existing `.row` grid** in `src/app/app.css`
   (`input[type='range']` and `.value-input` are already styled there via
   `SliderRow`). Expect at most a small flex-basis tweak so the text field
   keeps a usable width next to the track.

## Risks / Trade-offs

- [Undo history gains one command per slider tick for placement/light
  height drags] → Accept: identical to the existing shadow/radius/energy
  sliders; documented in the spec delta. A grouped-drag command is a separate
  cross-cutting change.
- [Light height loses its live spinner input] → Mitigation: slider provides
  the quick-adjust path; precise typing stays; behavior now matches the other
  three height fields.
- [Step 0.1 may feel coarse for sub-decimeter tweaks] → Mitigation: single
  shared constant; typing remains the precision path.
- [Character height slider may be considered scope creep] → It is recorded as
  an assumption in proposal.md; dropping it is a one-row deletion.

## Migration Plan

None needed: no format, persistence, or API change. Ship as a normal commit;
rollback is revert. In-memory brush-height state is never serialized (ADR
0006), so nothing to migrate.

## Open Questions

None — the two assumptions (character row included; step 0.1) are recorded
and do not change the specs' contracts.
