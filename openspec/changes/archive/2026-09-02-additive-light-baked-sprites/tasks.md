## 1. Renderer: multiplicative baked branch

- [x] 1.1 In `src/runtime/renderer.ts` `SPRITE_FRAG`, change the baked branch to classic multiplicative shading per design D1: sample the render pass and reuse `shade(r.rgb, g.rgb)`, keeping the render pass alpha; verify `npm run build` passes
- [x] 1.2 Confirm the unlit branch, discard test (raster coverage), `gl_FragDepth`, texture bindings, and uniforms are untouched; verify the diff touches only the baked branch of the fragment shader

## 2. Runtime: switch pins shading to identity

- [x] 2.1 In `src/runtime/main.ts`, change the disabled path of `updateLightUniforms()` to upload `ambient = (1,1,1)` with `key = (0,0,0)` (design D3) so unlit sprites show raw albedo (fixing the previous black render) and baked sprites the pure prerendered image; update the comment; verify `npm run build` passes

## 3. Docs

- [x] 3.1 Update `docs/runtime.md` Display modes and Lighting sections: baked mode = prerendered image shaded by key + ambient (multiplicative, same `shade()` as unlit), Dynamic light switch pins shading to identity (off = pure prerender / raw albedo); verify no additive-era claims remain

## 4. Verification

- [x] 4.1 `npm run build` (tsc + vite) passes clean
- [x] 4.2 Manual check in `npm run dev`: baked sprite shows the prerendered image re-shaded by the dynamic lights; dragging azimuth/elevation shifts shading on baked and unlit sprites alike; ambient slider affects both modes; toggling Dynamic light off returns baked sprites to the exact pure prerendered image and unlit sprites to raw albedo (no black); boot-baked primitives and interpenetrating-sprite occlusion unchanged
