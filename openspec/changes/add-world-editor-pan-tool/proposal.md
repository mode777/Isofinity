## Why

The world viewport can only be panned by middle-mouse drag, wheel/two-finger
scroll, or a three-finger touch drag. The common desktop convention — hold
Space and drag (the "hand tool") — is missing, and the Space key is currently
unused in the editor. Space-drag is the most discoverable pan gesture for
mouse users, works during every tool (pencil, brush, eraser, light, select,
paint), and costs no toolbar chrome.

## What Changes

- Add a **space-hold pan mode** to the world editor viewport: while the Space
  key is held, the canvas cursor becomes `grab` (and `grabbing` during a
  drag), and a left-button drag pans the viewport at constant zoom by
  applying the existing `panned()` view-transform update — the same
  mechanism, state, and invariants as middle-drag pan.
- While Space is held, viewport pointer actions that would mutate the world
  are suppressed: left press/drag does not place, paint, select, or move a
  selection; a right press does not erase or clear the selection. The gesture
  only pans.
- A pan drag started with Space held SHALL continue until the pointer is
  released, even if Space is released mid-drag (the drag in progress stays a
  pan; only new presses are affected).
- The Space keydown is prevent-defaulted while the world editor is focused so
  it does not scroll the page or re-trigger a focused button; when the focus
  is in a form control (text input, select, slider), Space keeps its normal
  editing behavior.
- The viewport hint line documents the new binding.
- No world file format change: the view transform stays per-document
  in-memory editor state and is never serialized.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the "World editor viewport zoom and pan" requirement
  gains the space-hold pan gesture (cursor feedback, suppression of
  mutating pointer actions while held, drag continuation across an early
  Space release) alongside the existing wheel / middle-drag / touch pans.

## Impact

- `src/app/components/WorldEditor.tsx` — a keydown/keyup listener pair
  tracking the Space state in the existing live-ref mirror, a left-button pan
  start in `onDown` when Space is held (reusing the existing `pan` drag state
  and `onMove`/`onUp` handling), a held-space guard suppressing the
  place/paint/select/erase branches, dynamic `grab`/`grabbing` cursor
  (precedent: `RealtimeCanvas.tsx`), and the hint line. `src/app/bakeView.ts`
  needs no change — `panned()` is reused as-is.
- No store/document-model change: the pan writes the existing per-document
  `viewTransform` through `setWorldViewTransform` and never marks the
  document dirty.
- Docs: `docs/runtime.md` (world-editor viewport paragraph and the Input
  section), `docs/glossary.md` (pan-mode entry), `docs/roadmap.md` (feature
  line). **No ADR** — this reuses the established 2D `ViewTransform` model
  and settles no new cross-cutting trade-off.
- Format-version impact: none — no new world fields, no bundle or world
  format tolerance changes; nothing serialized.

## Non-goals

- No toolbar button or persistent "pan tool" entry in the tool bar — holding
  Space is the only activation (temporary mode, not a selected tool).
- No change to the existing pan gestures (wheel scroll, ctrl+wheel zoom,
  middle-drag, three-finger touch drag) or their bindings.
- No space-hold pan in the sprite editor viewport (future follow-up if
  wanted).
- No pan/zoom undo entries; viewport navigation stays un-undoable.
- No world file format change and no new world format version.
