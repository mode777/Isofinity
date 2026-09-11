## 1. Icon rendering

- [x] 1.1 In `src/app/components/WorldEditor.tsx`, add an `emitLightIcon` helper beside `lightRing` that draws one light icon into `overlayBatch`: a dark under-diamond outline plus a smaller filled diamond centered on `toPx(l.x + 0.5, l.z + 0.5, l.y)` (~4 px half-diagonal core), tinted from the light's `colorHex` channels per design D4; verify visually via `npm run dev` that every placed light shows its icon in all tool modes (select, eraser, point-light, brush).
- [x] 1.2 Emit icons for every light of `live.world.listLights()` each frame in `renderFrame`, and confirm zoom/pan keeps them anchored at constant on-screen size; verify `npm run build` typechecks.

## 2. Hover feedback

- [x] 2.1 In `renderFrame`, with the Select or point-light tool active and `hoverRef.current` within the 14 px light pick radius of a light's projected emitter, draw that light's radius ring at hover alpha ~0.3 via `lightRing` (skip when that light is already selected and the selection ring already draws); verify with `npm run dev` that the ring appears only while the cursor rests on the icon.

## 3. Interaction wiring

- [x] 3.1 Verify (no code expected) that clicking a light icon with the Select tool selects the light and that dragging it moves the light with one undoable command on release — this rides the existing `pickPlacementAt` proximity pick and `selectDrag` machinery; if either fails, fix the integration (not the pick) and re-verify.
- [x] 3.2 Verify the point-light tool still selects (not places) when clicking an icon, and that with a placement brush active a click on an icon places the brush without selecting the light.

## 4. Checks, docs, validation

- [x] 4.1 Run `npm run build` and the relevant Node verifiers (`npm run verify:selection` for the untouched pick, to confirm no regression); fix anything they surface.
- [x] 4.2 Update `docs/runtime.md` (world editor overlays/input: light icons), add the "light icon (handle)" term to `docs/glossary.md` if kept, and add the done entry to `docs/roadmap.md`; no ADR (chrome within ADR 0006), no format-history change.
- [x] 4.3 Run `npx openspec validate selectable-light-icons` and archive-readiness check; confirm saved world files contain no icon data (save a world with lights, inspect the JSON).
