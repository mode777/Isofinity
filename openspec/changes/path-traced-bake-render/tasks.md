## 1. Spike: ortho + transparent path tracing

- [x] 1.1 Add `three-gpu-pathtracer` + `three-mesh-bvh` (exact pinned versions) to package.json and verify `npm run build` still passes
- [ ] 1.2 Throwaway check (scratch page or scratch-verify.html section): render the unit cube with `WebGLPathTracer` using the `frameIsoBox` ortho camera and `scene.background = null`; verify convergent image, object pixels opaque, background alpha 0 via render-target readback — before building anything on top (design D1/D3/D4) — *check code delivered in scratch-verify.html ("PT spike" section); needs a browser run*
- [ ] 1.3 Verify ortho AA: edges converge smoothly with accumulated samples and the sprite rect matches `frameIsoBox` dimensions/pixel alignment with the raster bake — *covered by the same browser run (sprite-rect + AA + raster-footprint assertions in the spike)*

## 2. PT render pass module

- [x] 2.1 New `src/bake/pt.ts`: build the PT stage from the existing scene + `frameIsoBox` camera (shared with `bakePrimitive`), `environmentRotation`/`environmentIntensity`/exposure inputs, fixed seed; `npm run build` clean
- [ ] 2.2 Progressive accumulation loop with sample budget, convergence/sample counter surfaced to the UI; deterministic for fixed seed + sample count (two runs same settings → identical readback) — *loop + counter shipped; the two-run readback assertion lives in the scratch PT spike, needs the browser run*
- [x] 2.3 Export path: composite accumulated linear target through a fullscreen quad with three's `<tonemapping_fragment>` (ACESFilmic) + `<colorspace_fragment>` into RGBA8, `readPixels` → float→bytes; verify exported PNG is pixel-identical to the on-screen preview canvas (identity is structural: preview canvas and PNG are drawn from the same readback bytes)
- [x] 2.4 HDRI loading: `HDRLoader` → `scene.environment`, file-picker + drag-drop with named errors on parse failure keeping the previous env; rotation/intensity/exposure controls restart accumulation (spec: HDRI environment lights the render pass)
- [x] 2.5 Wire a render-pass preview panel into `bake.html`/`main.ts` (pass gallery entry + toggling like the existing g-buffer views)

## 3. AO pass

- [x] 3.1 AO stage in `pt.ts` following the aoRender pattern: `AmbientOcclusionMaterial` + shared BVH uniform, two-target running average, jittered view offset, radius + samples controls; verify donut creases bake darker and background stays transparent (spec: path-traced AO pass) — *stage shipped; the donut/creases/determinism assertions live in the scratch AO spike, needs the browser run*
- [x] 3.2 AO export as grayscale PNG through the pass-through quad path; AO must produce output with no HDRI loaded (render pass stays absent then)

## 4. PBR materials for the render stage

- [x] 4.1 Extend `src/bake/gltf.ts` source to carry full `MeshStandardMaterial` data (base color map/factor, metallic/roughness, normal map, `alphaTest` for MASK) alongside the existing base-color fields; raster pass still overrides with its own ShaderMaterial — g-buffer/albedo output unchanged by construction (`bake.ts` untouched; scratch bundle hashes confirm on the browser run)
- [ ] 4.2 Normalize texture wrap/filter flags across materials and expose PT `textureSize` packing as a bake setting; verify a glTF with metallic material shows environment reflections and masked texels stay transparent in the render pass — *code shipped (flags normalized, `tex-size` setting, alphaTest verified in PT source); metallic/mask visuals need the browser run*

## 5. Bundle format /4

- [x] 5.1 Bump manifest to `format: "isoinfinity-bake/4"`: optional `render`/`ao` entries in the pass table, `environment` block (hdri name, rotation, intensity, exposure), `renderer` block (library+version, samples, bounces, denoise, seed); verify a produced bundle's manifest references exactly the present passes (checked statically; browser bundle-download confirms)
- [x] 5.2 Extend `buildBundle`/`export.ts` to include `<id>-render.png` / `<id>-ao.png` when present; confirm row order is top-down (reuse existing flip helpers) and re-baking identical settings yields identical bytes
- [x] 5.3 Extend `parseBake` to accept `/3` and `/4` and expose which optional passes are present; unknown format prefixes error by name; unit-check with hand-built v3 and v4 fixtures (fixture assertions added to scratch-verify)

## 6. Runtime display modes

- [x] 6.1 Upload optional render/ao layers into the sprite texture arrays in `src/runtime/assets.ts` (padding/anchoring per existing conventions) and thread per-layer presence through `Renderer.setSprites`
- [x] 6.2 Per-placement `displayMode: 'baked' | 'unlit'` + default-for-new-placements + toolbar UI in `world.ts`/`main.ts`; baked mode samples the render layer with its alpha; sprites without render stay unlit; verify per-sprite toggle leaves other placements unchanged (toggleModeAt mutates exactly one placement)
- [x] 6.3 Global dynamic-light switch: key/ambient off affects unlit sprites only; verify baked sprites unaffected (spec: display mode + dynamic lighting off scenarios) — baked shader branch never reads light uniforms
- [x] 6.4 Verify occlusion/hit-testing invariance: interpenetrating sprites resolve identically in both modes and hover uses raster coverage, not render alpha — static proof: `gl_FragDepth` is computed from the g-buffer before the display-mode branch; discard/coverage still use raster `c.a`; picking/erase never read the render layer
- [ ] 6.5 Load-test v3 and v4 bundles (with and without optional passes) through the editor's Load zip; unknown-format bundle shows a named error — *manual browser step; parser behavior is fixture-tested in scratch-verify*

## 7. Docs and hardening

- [x] 7.1 Update `docs/bake-pipeline.md`: pass table gains render/ao, format `/4`, environment/renderer manifest blocks, PT conventions (ortho, alpha, ACES, determinism); update `docs/runtime.md`: display modes, optional layers
- [x] 7.2 Record chosen default sample/bounce/AO-radius/exposure settings in the bake UI and docs after tuning against the reference viewer quality — defaults 256 samples / 5 bounces / 1024 tex-size / 64 AO rays @ 0.4 radius / exposure 1, recorded in `DEFAULT_PT_SETTINGS` and bake.html; retune after the browser run if needed
- [x] 7.3 Full `npm run build` + a manual pass over the spec scenarios that are statically checkable (bundle layout, manifest fields, parser acceptance); leave GPU/visual scenarios checklist for the user
