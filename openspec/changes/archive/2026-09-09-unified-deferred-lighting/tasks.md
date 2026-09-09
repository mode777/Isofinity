# Tasks — Unified deferred lighting + point lights

## 1. Compositor restructure (stage 1 — parity, no new features)

- [x] 1.1 Add the offscreen frame plumbing to `Renderer`: FBO sized to canvas with RT1 (RGBA16F normal+depth) and RT2 (RGBA8 albedo+AO), a shared depth renderbuffer, recreate-on-resize, dispose cleanup; verify `npm run build` passes
- [x] 1.2 Extend the ground programs (material plane + flat batch) to write RT1 (surface/up normal, plane depth) and RT2 (albedo, arm AO); verify ground renders into the offscreen targets in the scratch harness
- [x] 1.3 Extend the mesh programs to write RT1 (live skinned normal, world depth) and RT2 (env-lit tonemapped texel, AO = 1), removing the per-mesh `shade()` factor application; verify a mesh and sprite at equal material/light shade identically in the scratch harness
- [x] 1.4 Extend the sprite program to write RT1 (baked g-buffer normal+depth, grounding-shadow pixels mapped to ground-plane depth + up normal) and RT2 (render texel, AO = 1) while keeping discard/depth rules identical; verify grounding-shadow pixels carry ground-plane data in RT1 via the scratch harness
- [x] 1.5 Implement the deferred light pass: fullscreen program sampling RT1/RT2, ADR 0001 position reconstruction, ambient from SH probe + key directional, output to the default framebuffer; Dynamic-off path presents RT2·AO and skips the pass; verify key/ambient changes affect sprites, meshes, and ground through the one pass
- [x] 1.6 Remove the now-dead per-draw light uniforms/factors from sprite/ground/mesh programs and route the flat overlay path through the new frame (overlay draws after the light pass, unlit); verify `npm run build`
- [x] 1.7 Update `scratch-verify.html`: capture deferred-output composite hashes for the primitive worlds and record the pre-restructure forward hashes alongside so a browser regression diff is mechanical; user runs the harness to confirm sprite/ground parity (mesh shift = accepted D4 exception)

## 2. Point light rendering

- [x] 2.1 Add `MAX_POINT_LIGHTS = 16` UBO block (xyz + radius / rgb + energy) and the point-light evaluation (quadratic window, `max(N·L, 0)`, radius early-out) to the deferred light pass; verify with a manually uploaded test light in the scratch harness that ground, sprites, and a mesh all pick up the light and falloff reaches zero at the radius
- [x] 2.2 Handle the >16 case: upload only the first 16 placements and render the rest dark; verify a 17th light placement leaves the frame stable in the scratch harness

## 3. World model + serialization

- [x] 3.1 Add `LightPlacement` to `src/runtime/world.ts` (stable id, ground position, height, radius, energy, color, depth key) with place/remove/erase integration across placement kinds (erase removes topmost across sprites/meshes/lights); verify `npm run build`
- [x] 3.2 Bump `WORLD_FORMAT` to `isoinfinity-world/6` in `src/app/store/world.ts`: serialize light placements (position, height, radius, energy, color; height optional at ground level) and keep `/1`–`/5` loading unchanged (no light entries); verify round trip via save/load of a world with lights and a `/5` file load
- [x] 3.3 Reject malformed light entries (non-finite position/radius/energy, malformed color) with the standard corrupt-file path (named error, scene unchanged); verify with a hand-edited world file

## 4. Editor surface

- [x] 4.1 Add the point-light tool to the world editor toolbar (ghost marker with ground-projected radius ring, click-to-place, eraser support, no brush asset required); verify place/erase against the spec scenarios in the browser
- [x] 4.2 Add point-light properties (radius, energy, color picker, ground position + height) to the properties panel with immediate frame updates; verify edits reflect on the next frame in the browser
- [x] 4.3 Wire light placements into per-frame upload (`src/app/realtime.ts` → `Renderer`) and selection/erase paths; verify the full placement→edit→erase loop in the browser

## 5. Verification + docs

- [x] 5.1 Run `npm run build` and `npm run verify:bundles` and `npm run verify:mesh`; confirm all pass and the bundle checks are untouched (no bake changes)
- [x] 5.2 Update `docs/runtime.md` (two-phase frame, RT1/RT2 layout, deferred pass), `docs/glossary.md` (light pass, screen-space g-buffer, albedo·AO attachment, point light), and `docs/roadmap.md`
- [x] 5.3 Write the ADR: unified deferred lighting (factor applied once in the deferred pass for every surface kind; successor to ADR 0003's factor placement, extension of ADR 0009) recording the accepted mesh appearance shift, the RT2.a shadow-blend future hook, the transparency ceiling, and the indexed-blending upgrade path; add the ADR index row and mark ADR 0003's factor placement superseded
- [ ] 5.4 Browser verification pass by the user: `npm run dev` → `scratch-verify.html` hash diff (stage-1 parity), then the editor scenarios — place lights, edit properties, >16 lights, dynamic-off switch, save/reload `/6` round trip
