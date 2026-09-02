## 1. Renderer: additive baked branch

- [x] 1.1 In `src/runtime/renderer.ts` `SPRITE_FRAG`, change the baked branch to the linear-space additive composite from design D1: decode the render texel with `srgbToLinear`, add `uKeyLight * max(dot(gbufferNormal, uLightDir), 0)`, encode with `linearToSrgb`, keep the render pass alpha; verify `npm run build` passes
- [x] 1.2 Confirm the unlit branch, discard test (raster coverage), `gl_FragDepth`, texture bindings, and uniforms are untouched; verify the diff touches only the baked branch of the fragment shader

## 2. Runtime: switch semantics

- [x] 2.1 In `src/runtime/main.ts`, verify `updateLightUniforms()` disabled path (key/ambient zeroed) yields the pure prerendered image for baked sprites with no further changes, and update its comment (it currently says baked sprites are unaffected); verify `npm run build` passes

## 3. Docs

- [x] 3.1 Update `docs/runtime.md` Display modes and Lighting sections: baked mode = prerendered image + additive key light over baked normals (linear-space, no ambient), Dynamic light switch now gates the additive overlay (off = pure prerender); verify the two sections no longer claim baked mode is a passthrough or switch-immune

## 4. Verification

- [x] 4.1 `npm run build` (tsc + vite) passes clean
- [ ] 4.2 Manual check in `npm run dev`: load a `/4` bundle with a render pass (or inspect an existing one), toggle a sprite to baked mode — sprite shows prerendered image plus directional highlight; dragging light azimuth/elevation shifts the highlight on baked and unlit sprites alike; toggling Dynamic light off returns baked sprites to the exact pure prerendered image; ambient slider changes unlit sprites but not baked ones; boot-baked primitives and interpenetrating-sprite occlusion unchanged
