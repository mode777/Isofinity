# Tasks: add-ground-plane-material

## 1. Workspace convention

- [x] 1.1 Add `'materials'` to `WORKSPACE_FOLDERS` (`src/shared/workspace.ts`) and verify `npm run build` passes and connecting creates `materials/`
- [x] 1.2 Add `materials/` to the project browser listing with `.material`/`.zip` filtering and verify the listing shows only matching files

## 2. Material loading

- [x] 2.1 Create a ground-material loader module: open `.material`/zip bytes, match `<name>_(diff|arm|nor_gl)_*.(exr|png|jpg)` entry names (case-insensitive, duplicate notice, missing-`diff` rejection) and verify with unit-style Node checks where decoders allow
- [ ] 2.2 Decode maps to uploadable images (EXR float via existing decoder; PNG/JPG via ImageBitmap with GL flip) and verify a hand-built fixture zip decodes to three images *(implemented; fixture-zip check added to `scratch-verify.html` — needs a browser run)*

## 3. Renderer: ground plane

- [ ] 3.1 Add a ground program to `src/runtime/renderer.ts`: world-space quad at y=0 spanning world bounds, tangent basis computed on CPU, sampling diffuse/normal/arm textures with REPEAT wrap, and verify the plane draws under `npm run dev` with a placeholder texture *(implemented — browser verification pending)*
- [ ] 3.2 Write `gl_FragDepth` with the shared `uDepthA/uDepthB` mapping and verify sprite pixels occlude/composite correctly over the plane in the browser harness *(implemented; spike check added — browser run pending)*
- [ ] 3.3 Implement the lean PBR fragment: linearized albedo × SH ambient (perturbed normal) × arm.r AO + key N·L, through the shared ACES/exposure/saturation chunk; verify ground and mesh respond identically to key-light changes *(implemented; key-light spike check added — browser run pending)*
- [ ] 3.4 Wire tile scale as a uniform in world units and verify visible repeat density changes on scale input *(implemented; tile-scale spike check added — browser run pending)*
- [ ] 3.5 Keep the unlit flat batch as the no-material default and verify a fresh world renders exactly as today until a material is selected *(implemented; flat-mode spike check added — browser run pending)*
- [ ] 3.6 Add a ground check to `scratch-verify.html` and record the baseline output *(check added; baseline output needs a browser run)*

## 4. World state + persistence

- [ ] 4.1 Add ground state (material reference, tile scale) and a user-selected HDRI variant to the world store (`src/app/store/world.ts`); user selection overrides provenance env for the SH probe; verify probe rebuilds on selection *(implemented; probe rebuild check is browser-side)*
- [ ] 4.2 Bump world JSON to `isoinfinity-world/4` with optional `ground.material`, `ground.tileScale`, and HDRI fields on save; loader accepts `/1`–`/4`, skips unresolvable materials with a status notice, leaves defaults for absent fields; verify save/load round trip in the browser and that a `/3` file loads unchanged *(implemented; round trip is browser-side)*
- [x] 4.3 Verify erase/pick interactions ignore the ground plane (the ground is not a `World` placement: `removeTopAt`/`removeAt` only ever resolve sprite/mesh placements)

## 5. Editor UI

- [ ] 5.1 Add ground properties (material picker from `materials/`, tile-scale numeric input) and an HDRI picker to the world properties panel, with file-dialog fallback when no workspace is connected; verify live re-render on each change *(implemented; live behavior is browser-side)*
- [x] 5.2 Add an HDRI .hdr/.exr file-dialog fallback for the world environment and verify loading works without a workspace (in-memory equirect cache feeds the SH probe; typecheck + build green)

## 6. Docs + ADR

- [x] 6.1 Write the render-framework ADR in `docs/decisions/` (raw WebGL2 compositor; three.js CPU-side only) and add the index row
- [x] 6.2 Update `docs/runtime.md` (ground plane, material pipeline, HDRI selection semantics), `docs/glossary.md` (material, tile scale), and `docs/roadmap.md`
- [ ] 6.3 Run `npm run build`, `npm run verify:bundles`, `npm run verify:mesh`, and `npm run dev` → `/scratch-verify.html`; confirm no regression in bundle hashes and all checks pass *(build + both Node harnesses pass; browser harness needs a run)*
