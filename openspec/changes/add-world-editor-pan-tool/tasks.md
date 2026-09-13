## 1. Space-key tracking in the world editor

- [x] 1.1 In `src/app/components/WorldEditor.tsx`, add a `keydown`+`keyup` effect on `window` keyed on `e.code === 'Space'`: reuse the existing form-control guard, `preventDefault()` only when handled, ignore `e.repeat`, mirror the held state into a `spaceRef` next to the existing live refs, keep a React state flag for render-side feedback, and clear the flag on window `blur`. Verify: `npm run build` typechecks; in the browser (`npm run dev`), holding Space in a world tab does not scroll the page or re-trigger a focused button, and typing a space in a text field still inserts a space.

## 2. Pan gesture wiring

- [x] 2.1 In the canvas `onDown`, when Space is held and the press is left-button, start the existing middle-drag `pan` state (extended with the originating button) with `setPointerCapture`, before the place/paint/select/erase branches. Verify: with a brush active, holding Space and left-dragging pans the viewport and places nothing.
- [x] 2.2 Gate the mutating press branches on Space being held: left-button place/paint/select/select-drag-move, right-button erase/clear-selection, and the shift height-adjust gesture are all refused while Space is down; wheel scroll/zoom and touch gestures stay active. Verify: with Space held, left-click on a sprite with the Select tool selects nothing, right-click erases nothing, and the view follows drags instead.
- [x] 2.3 Let the pan drag finish on `pointerup`/`pointercancel` when `pan !== null` regardless of button, and confirm an in-flight pan survives releasing Space mid-drag while a gesture started before Space was pressed is never converted into a pan. Verify: start a space-drag, release Space, keep dragging — the view keeps panning until mouse-up; start a paint drag, press Space mid-stroke — the stroke stays a stroke.
- [x] 2.4 Confirm the pan writes only the per-document `viewTransform` via `setWorldViewTransform` (never marks the document dirty, nothing new serialized). Verify: after a space-pan, the Save control shows no dirty state and a saved world file contains no view-transform data.

## 3. Cursor and hint feedback

- [x] 3.1 Flip the world canvas's inline cursor between `grab` (Space held) and `grabbing` (pan drag in flight), restoring the CSS default otherwise, following the `RealtimeCanvas.tsx` precedent. Verify: in the browser the cursor changes on Space down/up and during a space-drag.
- [x] 3.2 Update the viewport hint line to document the space-drag pan binding. Verify: the hint renders in the world editor without layout breakage.

## 4. Docs

- [x] 4.1 Update `docs/runtime.md`: the world-editor viewport paragraph and the Input section gain the space-hold pan gesture and its suppression rules. Verify: the two sections read consistently with each other and with the spec delta.
- [x] 4.2 Add a glossary entry (pan mode) to `docs/glossary.md` and a feature line to `docs/roadmap.md`. Verify: entries present and consistent with existing wording.

## 5. Verification gate

- [x] 5.1 Run `npm run build` and `openspec validate --change add-world-editor-pan-tool --strict`; fix any failures. No Node verifier applies (no bundle/mesh/history/selection/terrain logic touched).
- [ ] 5.2 Manual browser pass over the spec scenarios: space-drag pans at constant zoom, suppresses place/erase/select, mid-drag Space release completes the pan, form-control space keeps editing, existing wheel/middle-drag/touch pans and zoom controls unchanged. Leave the run to the user per AGENTS.md.

## 6. Dedicated pan tool button

- [x] 6.1 Add `PAN_TOOL_ID = 'pan'` to `src/app/store/world.ts` beside the other tool ids, an `IconPan` glyph to `src/app/components/icons.tsx` (16×16 stroke style), and a Pan button to the viewport tool bar (after Select) that calls `setTool`; exclude the pan tool from `placementMode` so the brush dropdown stays hidden, and give the bottom hint line a pan case. Verify: `npm run build` typechecks; the button renders, highlights when active, and the brush dropdown/brush hint disappear while it is active.
- [x] 6.2 Admit the pan tool into the same pan drag path in `onDown` (Space held **or** pan tool active: left press starts the pan, right presses refused), guard the mouse/touch place fall-throughs in `onMove`/`onUp` against the pan tool, and make a single-finger touch drag pan under the pan tool (ended when a second finger lands; taps do nothing). Verify: with the pan tool, left-drag pans, right-click erases nothing, clicks select/place nothing, and touch single-finger drags pan.
- [x] 6.3 Extend `syncCursor` to show grab/grabbing while the pan tool is active (re-syncing on tool change). Verify: the cursor turns grab on selecting the tool and grabbing during a drag, reverting on switching away.
