## 1. State and store wiring

- [x] 1.1 Add `humanReference?: boolean` to `BakeDocument` in `src/app/document.ts` next to `boxOverlay`, doc-commented as in-memory editor state only — never written into bundles (ADR 0006). Verify: `npm run build` typechecks.
- [x] 1.2 Add `setHumanReference(docId, on)` to `src/app/store/bake.ts` mirroring `setBoxOverlay`: updates the document only — no dirty marking, no render invalidation (the figure cannot affect passes). Verify: `npm run build` typechecks; toggling in dev does not light the tab's dirty dot.

## 2. Realtime figure

- [x] 2.1 In `src/app/realtime.ts`: add `HUMAN_REFERENCE_HEIGHT = 1.8` (m = world units) and build a procedural humanoid `Group` (torso/head/legs from three.js primitives) exactly that tall, neutral `MeshStandardMaterial`, depth-tested, standing on y = 0. Do NOT apply `applySlotModelRotation` to it; position it from `yawRotatedBoxSize(prim.size, yawDeg)` with a small fixed gap outside the camera-facing corner so it stays put across N/E/S/W. Hidden by default; dispose its geometries/materials in `dispose()`. Verify: `npm run build` typechecks; figure appears beside the model in dev.
- [x] 2.2 Add a `setHumanReference(on)` method on `RealtimeMeshView` (toggles the group's `visible`, like `setBoxOverlay`) and thread the flag through `RealtimeCanvas` props in `src/app/components/SpriteEditor.tsx` with an effect syncing prop → visibility. Verify: in dev, toggling shows/hides the figure without recreating the canvas.

## 3. View-controls toggle

- [x] 3.1 Add a "Human" button to the view-controls row in `SpriteEditor.tsx` next to Box: active class from `doc.humanReference`, tooltip describing the 1.8 m reference, disabled exactly when the Realtime 3D view is unavailable (no source geometry). Verify: in dev, a view-only bundle without a resolvable model has the button disabled; per-document state survives view and tab switches.

## 4. Docs

- [x] 4.1 Update `docs/runtime.md` sprite editing section (Realtime 3D bullet: the human-scale reference toggle and its never-baked/never-persisted semantics) and add the change to `docs/roadmap.md` "Done". Verify: no other docs need touching (no format/vocabulary change); wording matches `docs/glossary.md` terms.

## 5. Verification

- [x] 5.1 Run `npm run build` (tsc + vite) — must pass. `npm run verify:bundles` is unaffected (no `src/bake/bundle.ts`/`export.ts` change) but run it once to confirm zero diff.
- [ ] 5.2 Browser harness (user-run per AGENTS.md): `npm run dev` → `/scratch-verify.html` still passes existing checks; then in the sprite editor walk the spec scenarios — toggle shows/hides the figure; a model set to 1.8 m height aligns with the figure's head; figure stays fixed across all four slots; a re-bake with the toggle on produces passes/bundle identical to a bake with it off.

## 6. Follow-up: base-mesh figure + drag repositioning

- [x] 6.1 Replace the procedural figure with the bundled base mesh: ship `src/app/assets/free_base_mesh.glb` as a vite `?url` asset (add `src/vite-env.d.ts` with `vite/client` types), load it async in `RealtimeMeshView` via `GLTFLoader`, normalize at load (uniform scale to `HUMAN_REFERENCE_HEIGHT`, feet to y = 0, centered over the ground position) and keep the procedural mannequin only as a load-failure fallback; re-render once loaded. Verify: `npm run build` passes; dev shows the mesh figure at true 1.8 m scale.
- [x] 6.2 Drag repositioning: `RealtimeMeshView` gains raycast helpers (`hitHuman` pick, `dragHumanTo` ground-plane move, `setHumanPosition`); `RealtimeCanvas` handles pointerdown/move/up on its host — a press on the figure drags it (pointer capture, stopPropagation so the view does not pan), a press elsewhere pans as before; grab/grabbing cursor on hover/drag. Verify: `npm run build` passes; dev drag moves the figure on the ground without panning.
- [x] 6.3 Persist the dragged ground position per document in memory (`humanRefPos` on `BakeDocument`, `setHumanReferencePos` store action, never serialized, never dirty), applied over the default corner spot on view recreation (slot/tab switches). Verify: `npm run build` passes; position survives slot and tab switches in dev.
- [x] 6.4 Docs: update the `docs/runtime.md` Human reference bullet (mesh figure, dragging, per-document spot) and the `docs/roadmap.md` Done entry. Verify: wording matches the updated spec.
- [x] 6.5 Run `npm run build` and `npm run verify:bundles` — must pass with zero bundle-format diff.
- [ ] 6.6 Browser harness (user-run): extend the walkthrough — the figure is the base mesh at 1.8 m; dragging it on the ground never pans the view; a press beside it pans; the dragged spot survives slot and tab switches; baked passes stay identical with the figure shown/moved/hidden.
