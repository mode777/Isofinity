## 1. Renderer: single display path

- [x] 1.1 In `src/runtime/renderer.ts`, reduce `SPRITE_FRAG` to one path: discard on g-buffer emptiness (`dot(g.rgb, g.rgb) == 0`), write `gl_FragDepth` from the g-buffer depth as today, sample the render pass and output `shade(r.rgb, g.rgb)` with the render alpha; drop `uSprites`, `vBaked`, and the unlit branch; verify `npm run build` passes
- [x] 1.2 Update `SPRITE_VERT` + VAO setup: remove `aInst3`/`vBaked` (instance stride 48 → 32 bytes), keep `aInst`/`aInst2`; drop the albedo texture array from `setSprites` (signature loses `albedoLayers`, remove `this.tex`), bind `uRender`/`uGbuffer` units; verify `npm run build` passes

## 2. Assets: rendered boot bakes

- [x] 2.1 Add the procedural environment builder (pure function, equirect RGBA-float DataTexture: sky gradient + warm sun disc at the default key light direction, intensity/exposure 1) and make `bakeSpriteLayers` async: raster MRT per primitive as today plus `PtBaker.setPrimitive` + `renderPass()` for the render layer, flipping the GL-order `PtImage` bytes to top-down; verify `npm run build` passes
- [x] 2.2 Drop albedo from the runtime layer plumbing (`SpriteLayer.albedo`, `SpriteSet.albedoLayers`, `layersToSet`, `layerFromBundle` stops decoding the albedo PNG) and make `layerFromBundle` throw a named error when the bundle has no render pass; verify `npm run build` passes

## 3. World, main, UI

- [x] 3.1 `src/runtime/world.ts`: remove `DisplayMode`, `displayMode`, and `toggleModeAt`; `place(x, z, primId)` loses the mode parameter; verify `npm run build` passes
- [x] 3.2 `src/runtime/main.ts`: move boot into an async `main()` with a "Baking sprites…" status, remove default-mode wiring / mode tool branch / `toggleMode`, emit 8-float instances without the baked flag, drop the "baked render available" status note; verify `npm run build` passes
- [x] 3.3 `index.html`: remove the Bake toggle toolbar button and the Display panel (default-mode select), update the footer text to rendered-sprite wording; verify the page loads with `npm run dev`

## 4. Docs and verification

- [x] 4.1 Update `docs/runtime.md`: display modes section replaced by the single shaded-prerender path, boot bake describes the procedural-environment PT render, bundle loading requires the render pass, renderer description drops albedo and documents g-buffer-emptiness coverage; verify no display-mode/mode-tool references remain
- [x] 4.2 `npm run build` (tsc + vite) passes clean
- [x] 4.3 Manual check in `npm run dev`: page shows all primitives as path-traced shaded sprites after a short bake pause; key light + ambient affect every sprite; light off = pure prerender; a `/4` bundle with render loads, a `/3` or render-less `/4` bundle fails with a named error; interpenetrating sprites occlude pixel-accurately; no mode tool or Display panel in the UI
