## 1. Test asset

- [x] 1.1 Commit Khronos CesiumMan GLB under `src/app/assets/` with a CC-BY attribution note (source URL, license) and confirm `npm run build` still passes
- [x] 1.2 Write a Node-runnable parse check (GLTFLoader `parse()` on the committed GLB) that asserts a `SkinnedMesh` with JOINTS_0/WEIGHTS_0, a skeleton with inverse binds, and at least one animation clip; run it via `npx tsx` or equivalent and record the output

## 2. Skinned asset model and pose engine

- [x] 2.1 Create `src/runtime/meshAsset.ts`: extract interleaved position/normal/JOINTS_0/WEIGHTS_0 + indices into plain arrays; keep three.js bones, `boneInverses`, and clips as the CPU pose record; enforce the 64-joint cap with a named error; verify by loading CesiumMan through it in the 1.2-style check
- [x] 2.2 Implement the pose engine: per-frame clip sampling via AnimationMixer (no GL calls) producing the joint palette (`bone.matrixWorld · boneInverse` per joint, Float32Array of 16·J); verify palettes differ across a sampled frame range and are identity for unskinned assets

## 3. Renderer mesh batch

- [x] 3.1 Add the mesh program to `src/runtime/renderer.ts`: vertex shader (palette skinning, `worldPos` → screen px via the shared iso constants, `vDepth = dot(worldPos, VIEW_DIR)`), fragment shader (own copy of `SHADE_CHUNK` + ACES + sRGB — do not edit the shared chunk, `gl_FragDepth = uDepthA·vDepth + uDepthB` reusing the sprite uniforms); verify `npm run build` passes
- [x] 3.2 Add the instanced mesh VAO (per-instance yaw+translation), the draw call between the shadow and sprite batches (blend off, depth write+test LEQUAL), and the empty-batch skip; verify with zero meshes the render call sequence is unchanged (code review + build)
- [x] 3.3 Extend `Renderer.render()`/dispose for the new program and buffers; confirm the sprite program source is byte-identical to pre-change (diff) so sprite pixels cannot shift

## 4. Shading probe

- [x] 4.1 Implement the SH probe in `src/runtime/` (9 RGB coefficients from a downsampled equirect scan or the procedural env eval; provenance resolution: first resolvable bundle env, else built-in default); verify coefficients are finite and rotationally plausible (lit side matches env sun direction)
- [x] 4.2 Wire the probe + key/ambient uniforms into the mesh fragment path so dynamic-light changes affect meshes and the dynamic-light-off state shows environment-only shading; verify visually in the world editor against side-by-side sprites

## 5. World integration (character brush)

- [x] 5.1 Add the in-memory mesh placement kind to the world document/world model (asset ref, position, height, yaw; depth key via `depthOf`) — no serialization; verify save writes unchanged `isoinfinity-world/3` JSON and load ignores meshes
- [x] 5.2 Wire the built-in character brush into `WorldEditor.tsx`: place/erase (topmost across kinds), height control, ghost preview at the cursor, contact-shadow ellipse; verify ghost occlusion and erase topmost against mixed sprite/character scenes
- [x] 5.3 Confirm surface snap works for the character brush unchanged (sprite g-buffer path) and animated playback loops in place at wall-clock pace; verify in the browser

## 6. Verification and docs

- [x] 6.1 Extend `/scratch-verify.html` with a fixed mesh-in-scene golden hash (CesiumMan placed among test sprites, fixed camera/light) so future renderer changes diff against it; run the harness and record the hash (browser run by user)
- [x] 6.2 Run the full gates: `npm run build`, `npm run verify:bundles` (must stay green — no bake/format code touched), and the scratch-verify bake checks; record results
- [x] 6.3 Update docs: `docs/runtime.md` (renderer batch list, world editor brush, lighting section), `docs/glossary.md` (joint palette, SH probe, mesh placement), `docs/roadmap.md`; write `docs/decisions/0007-dynamic-meshes-in-the-compositor.md` per design D1 and add it to the ADR index
