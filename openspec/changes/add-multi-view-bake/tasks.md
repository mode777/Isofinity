## 1. Camera parameterization (D1)

- [x] 1.1 Add `VIEW_SLOTS` (`'n'|'e'|'s'|'w'`) and `slotAzimuthDeg(slot) = ISO_AZIMUTH_DEG + 90*index` in `src/shared/iso.ts`; verify `npm run build` passes
- [x] 1.2 Parameterize `frameIsoBox(size, pxPerUnit, padPx, azimuthDeg = ISO_AZIMUTH_DEG)` in `src/bake/iso.ts`; thread the slot azimuth through `reconstructWorldPos` and `projectBoxFrame`; verify existing call sites still compile and `npm run build` passes
- [x] 1.3 Thread the azimuth through the raster bake (`bakePrimitive` in `src/bake/bake.ts`): per-view camera in `BakeResult` and a `uViewDir` uniform for the g-buffer depth encoding instead of the `ISO_VIEW_DIR` constant; verify a sphere baked at azimuth 45 produces byte-identical dimensions/emptiness conventions as before at `npm run build` + scratch-verify
- [x] 1.4 Thread the azimuth through `PtBaker` (`setPrimitive`/frame setup in `src/bake/pt.ts`) so the PT camera and depth match the slot; verify the render pass pixel-aligns with the slot g-buffer via scratch-verify

## 2. Bundle format /6 (D4, D6)

- [x] 2.1 Extend `BakeManifest` with the optional `views` table and emit `isoinfinity-bake/6` with per-view entries (`<id>-<slot>-gbuffer.exr`, `<id>-<slot>-render.png`; N keeps historical names) in `src/bake/export.ts`/`buildBundle` in `src/bake/bundle.ts`; verify manifest JSON shape by serializing a two-view bake in scratch-verify
- [x] 2.2 Extend `parseBake` to accept `/4`, `/5`, `/6`, returning extra-view blobs; `/4`/`/5` parse unchanged; unknown formats still rejected by name; verify via scratch-verify cases
- [x] 2.3 Extend `decodeBundle` (`src/app/bundleView.ts`) to decode extra views into `extraViews`-shaped results and restore the stored-slot list; verify a saved `/6` re-opens with both views via scratch-verify decode path

## 3. Document state + per-slot bake actions (D2, D3)

- [x] 3.1 Add `extraViews` and `activeSlot` to `BakeDocument` (`src/app/document.ts`), reset in `baseBakeDoc` (`src/app/store/bake.ts`), plus a `viewPasses(doc, slot)` helper; verify `npm run build`
- [x] 3.2 Make the bake actions slot-aware: `bakeRaster`/`runRenderPass` write into `result`/`render` for n or `extraViews[slot]` for others and invalidate only that slot; verify baking E leaves N passes untouched (scratch-verify of the store reducer or manual dev-server check)
- [x] 3.3 Implement `setActiveSlot` (editor-only, no dirty) and `removeView` (clears `extraViews[slot]`, discards an in-flight pass for it, unavailable for n/view-only/empty/busy); verify states in dev server
- [x] 3.4 Implement `bakeAll`: sequential n→e→s→w loop reusing the per-slot render path, setting `activeSlot` per iteration, checking the `renderGen` token between slots, stopping on failure with a named error, `[k/4]` status prefix; verify on a primitive document in dev server

## 4. Editor UI (D5)

- [x] 4.1 Add the slot switcher overlay (top-right of the sprite viewport in `SpriteEditor.tsx`): four letter icons N,E,S,W, baked/empty coloring, active outline, disabled rules (view-only without stored passes; while busy); verify coloring and switching in dev server
- [x] 4.2 Route the viewport display, box overlay and pixel-size preview through `activeSlot` (view modes realtime/normals/depth/render carry over; overlay uses the slot camera); verify the overlay matches the displayed slot
- [x] 4.3 Add Bake All and Remove view to the sprite toolbar (`EditorToolbar.tsx`) with the disabled states from the spec; verify enable/disable matrix in dev server

## 5. Save / open / place integration

- [x] 5.1 Extend `saveSprite` to build the `/6` bundle from N + `extraViews` (view-only copy path unchanged); verify `sprites/<id>.sprite` opens with all baked views
- [x] 5.2 Extend `openBundleDoc` for `/6` (restore extra views, `activeSlot = 'n'`) and keep `/5` opening as single-view editable; verify both in dev server
- [x] 5.3 Confirm `Place in world` and world rendering still consume only the N pair (no code change expected); verify placing a multi-view sprite still works

## 6. Verification

- [x] 6.1 Extend `src/bake/scratch-verify.ts`: `/6` round trip with E/S/W entries, per-view azimuths and sprite rects, `/4`+`/5` open N-only, remove-view omission on next save, unknown-format rejection; run it and make it pass
- [x] 6.2 Run `npm run build` (tsc + vite) and resolve all type errors; leave browser-only checks (batch viewport following, switcher interaction) noted for the user
