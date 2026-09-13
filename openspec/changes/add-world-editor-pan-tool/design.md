# Design — world-editor space-pan

## Context

The world viewport already pans three ways — plain wheel scroll, middle-drag,
three-finger touch — all funneling through one mechanism: a per-document 2D
`ViewTransform` (`{ zoom, panX, panY }`, in-memory, never serialized — ADR 0006)
updated via the pure `panned()` helper in `src/app/bakeView.ts` and applied by a
single first branch of the canvas `pointermove` handler in
`src/app/components/WorldEditor.tsx`. Middle-drag keeps a small effect-local
`pan` drag object alive across `pointermove` and releases it on
`pointerup`/`pointercancel`, with pointer capture so drags survive leaving the
canvas. The Space key is unused anywhere in the app; there are no `keyup`
listeners yet, and the world editor's keyboard effect already carries a
"typing in a form control" guard pattern. See proposal.md — Why for the
motivation.

## Goals / Non-Goals

**Goals:**

- Hold Space → temporary pan mode: grab/grabbing cursor, left-drag pans,
  world-mutating pointer actions suppressed.
- Zero new camera machinery: same drag state, same `panned()` update, same
  per-document transform.
- A drag in flight keeps its identity: a pan started with Space completes even
  if Space is released early; a place/paint/select/erase gesture started
  before Space was pressed is not converted into a pan mid-stroke.

**Non-Goals:**

- No store/tool-state representation of pan mode, no toolbar button, no
  sprite-viewport space-pan, no undo entries (see proposal — Non-goals).

## Decisions

1. **Ephemeral component-local state, not a tool id.** Space-pan lives in
   `WorldEditor.tsx`: a `spaceRef` boolean (read by the native canvas
   listeners without re-binding, mirroring the existing `liveRef` pattern)
   plus a small React state flag only for render-side feedback (cursor class,
   hint line). It is never written into the document, so it is trivially never
   serialized (ADR 0006) and cannot leak across tabs (each world editor
   instance owns its listener; the flag resets on unmount).
   *Alternative — a `'pan'` tool id in `store/world.ts`:* rejected because
   pan mode is momentary and key-driven, not a selected tool; a tool id would
   force a toolbar button, per-document tool state churn, and restore logic
   for "which tool was active before Space".
2. **Reuse the middle-drag `pan` object, extended with the originating
   button.** `onDown` with Space held starts the same `pan` state the
   middle button uses (with `setPointerCapture`); `onUp`/`onCancel` release
   it when `pan !== null` regardless of button. "Continue the pan after an
   early Space release" falls out for free — the drag state doesn't consult
   Space after its start.
   *Alternative — a separate space-pan drag state:* rejected as duplication
   of the identical update/release choreography; a `button`/`space` field on
   the existing object is strictly less state.
3. **Suppression at press time only.** The `onDown` left-button branches
   (paint/place, select, character), the right-button erase/clear branch, and
   the shift height-adjust gesture check `spaceRef.current` before starting;
   `onMove`/`onUp` need no new gating because every in-flight gesture was
   already admitted or refused at press time. Wheel zoom/scroll and touch
   gestures stay active while Space is held.
   *Alternative — a global mode flag consulted in every handler:* rejected;
   press-time admission is sufficient and keeps the diff inside `onDown`.
4. **Keyboard tracking: one new `keydown`+`keyup` effect on `window`, keyed
   on `e.code === 'Space'`.** Reuses the existing form-control guard so text
   inputs and sliders keep their space keystroke; `preventDefault()` only when
   the editor claims the key (stops page scroll and focused-button
   reactivation); `e.repeat` ignored; window `blur` clears the held flag so a
   missed keyup (alt-tab, browser menu) cannot wedge the editor in pan mode.
   The layer-menu effect already uses `stopPropagation`, so no double
   handling.
   *Alternative — toggling pan mode on Space press (press once to enter,
   again to exit):* rejected; the request specifies hold-to-pan, which also
   matches every mainstream editor.
5. **Cursor via the canvas element's inline style**, flipping between
   `grab`/`grabbing`/'' following the `RealtimeCanvas.tsx` precedent, so the
   static `cursor: crosshair` rule in `app.css` stays untouched for other
   tools.
6. **Docs and hints, not new verifiers.** No Node verifier applies (no
   bundle/mesh/history/selection/terrain logic changes); the gate is
   `npm run build` plus browser checks of the new binding. Update
   `docs/runtime.md` (viewport paragraph + Input section), add a glossary
   entry, and a roadmap line.

## Risks / Trade-offs

- [Missed `keyup` wedges pan mode (window loses focus while Space is down)]
  → `blur` handler clears the flag; keyup also clears unconditionally, so a
  stray late keyup can't stick.
- [Space pressed with a focused toolbar button re-triggers it]
  → `preventDefault()` when the editor handles the key (the form-control
  guard exempts real editing surfaces).
- [Users expect wheel-while-space to zoom (some apps do that)]
  → out of scope; wheel keeps its existing pan/zoom behavior. Recorded as a
  deliberate convention choice, revisit only with user feedback.
- [Touch devices never emit Space, so the mode is dead code there]
  → harmless; the suppression checks are one boolean read.

## Migration Plan

Additive UI behavior; no data, format, or store-shape changes. Rollback is
reverting the single component change. No migration steps.

## Open Questions

None — interaction details that arose (mid-drag Space release, form-control
guard, in-flight gesture identity) are pinned in the specs delta.
