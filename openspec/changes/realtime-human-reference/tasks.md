## 1. State and store wiring

- [ ] 1.1 Add `humanReference?: boolean` to `BakeDocument` in `src/app/document.ts` next to `boxOverlay`, doc-commented as in-memory editor state only — never written into bundles (ADR 0006). Verify: `npm run build` typechecks.
- [ ] 1.2 Add `setHumanReference(docId, on)` to `src/app/store/bake.ts` mirroring `setBoxOverlay`: updates the document only — no dirty marking, no render invalidation (the figure cannot affect passes). Verify: `npm run build` typechecks; toggling in dev does not light the tab's dirty dot.

## 2. Realtime figure

- [ ] 2.1 In `src/app/realtime.ts`: add `HUMAN_REFERENCE_HEIGHT = 1.8` (m = world units) and build a procedural humanoid `Group` (torso/head/legs from three.js primitives) exactly that tall, neutral `MeshStandardMaterial`, depth-tested, standing on y = 0. Do NOT apply `applySlotModelRotation` to it; position it from `yawRotatedBoxSize(prim.size, yawDeg)` with a small fixed gap outside the camera-facing corner so it stays put across N/E/S/W. Hidden by default; dispose its geometries/materials in `dispose()`. Verify: `npm run build` typechecks; figure appears beside the model in dev.
- [ ] 2.2 Add a `setHumanReference(on)` method on `RealtimeMeshView` (toggles the group's `visible`, like `setBoxOverlay`) and thread the flag through `RealtimeCanvas` props in `src/app/components/SpriteEditor.tsx` with an effect syncing prop → visibility. Verify: in dev, toggling shows/hides the figure without recreating the canvas.

## 3. View-controls toggle

- [ ] 3.1 Add a "Human" button to the view-controls row in `SpriteEditor.tsx` next to Box: active class from `doc.humanReference`, tooltip describing the 1.8 m reference, disabled exactly when the Realtime 3D view is unavailable (no source geometry). Verify: in dev, a view-only bundle without a resolvable model has the button disabled; per-document state survives view and tab switches.

## 4. Docs

- [ ] 4.1 Update `docs/runtime.md` sprite editing section (Realtime 3D bullet: the human-scale reference toggle and its never-baked/never-persisted semantics) and add the change to `docs/roadmap.md` "Done". Verify: no other docs need touching (no format/vocabulary change); wording matches `docs/glossary.md` terms.

## 5. Verification

- [ ] 5.1 Run `npm run build` (tsc + vite) — must pass. `npm run verify:bundles` is unaffected (no `src/bake/bundle.ts`/`export.ts` change) but run it once to confirm zero diff.
- [ ] 5.2 Browser harness (user-run per AGENTS.md): `npm run dev` → `/scratch-verify.html` still passes existing checks; then in the sprite editor walk the spec scenarios — toggle shows/hides the figure; a model set to 1.8 m height aligns with the figure's head; figure stays fixed across all four slots; a re-bake with the toggle on produces passes/bundle identical to a bake with it off.
