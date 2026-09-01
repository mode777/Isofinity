## 1. Source abstraction

- [x] 1.1 Refactor `Primitive` in `src/bake/primitives.ts` to carry optional material groups (`{ geometry, albedoTexture | null, baseColorFactor, alphaMode, alphaCutoff }[]`) alongside `albedoHex`, keeping all seven primitives compiling unchanged; verify `npm run build` typechecks and primitive bakes are pixel-identical
- [x] 1.2 Generalize `bakePrimitive` in `src/bake/bake.ts` to one MRT draw per material group (shared render target, depth test on, per-group uniforms); verify sphere/donut/cube previews and downloaded bundles are unchanged

## 2. glTF loading module

- [x] 2.1 Add `src/bake/gltf.ts`: parse `.glb` via `GLTFLoader.parseAsync`, traverse `gltf.scene`, collect visible `Mesh` nodes (reject `SkinnedMesh`/skinned nodes with a skip note), clone geometry, apply `node.matrixWorld`; verify with a small hand-made static GLB in the dev server
- [x] 2.2 Support plain `.gltf`: map the picked file set by percent-decoded relative resource path and resolve external `.bin`/texture URIs through a `LoadingManager.setURLModifier` blob-URL rewrite; verify a .gltf + .bin + textures set bakes identically to its .glb export, and a missing resource errors naming the file
- [x] 2.3 Group collected geometries by material and merge each group with `BufferGeometryUtils.mergeGeometries`; reject meshes missing normals with a clear error; verify merged groups render identical silhouettes to the unmerged scene
- [x] 2.4 Normalize placement: compute merged `Box3`, translate by `-min`, apply uniform scale about the origin, set `size = extent × scale`, `id` from sanitized filename; verify an off-origin model bakes into a box starting at `(0,0,0)` in the debug position dump
- [x] 2.5 Detect DRACO/KTX2/Meshopt extension use and fail with a specific status message; verify a compressed file shows that message and keeps the previous source

## 3. Textured albedo + alpha in the bake shader

- [x] 3.1 Set loaded base-color textures to `SRGBColorSpace`; extend the fragment shader to sample `uAlbedoMap` when bound, multiply by linear `uBaseColorFactor`, and encode sRGB via the exact transfer function; verify a solid known-color texture reproduces its hex in the albedo PNG
- [x] 3.2 Implement alpha semantics: discard when `alphaMode: MASK` and sampled alpha × factor alpha < `alphaCutoff`; bake `BLEND` opaque; verify a cutout-textured model leaves coverage-0, all-zero-g-buffer pixels where the texture is transparent

## 4. UI wiring

- [x] 4.1 Extend `bake.html` + `src/bake/main.ts`: "Load glTF" multi-select file button (accept `.glb,.gltf,.bin` + image types) with drag-drop of multiple files, source-name label, numeric scale input (default 1); glTF entry highlights like an active primitive and picking a primitive clears it; verify switching sources updates the preview each time
- [x] 4.2 Wire status/robustness: loading state, parse-error path (previous source stays active), missing-`.gltf`-resource error, skipped-content note (skins/animations), sprite-size cap >8192 px error telling the user to scale down, resource disposal on source replacement; verify each path via the status line in the dev server

## 5. End-to-end verification

- [ ] 5.1 Bake a multi-material textured glTF (.glb and the same model as .gltf + .bin + textures): download the bundles, confirm manifests `isoinfinity-bake/3` with correct `size`, feed them through `parseBake()` (`src/bake/bundle.ts`) from a scratch runtime page, and check the asset composites on the isometric ground with correct occlusion
- [ ] 5.2 Regression pass: re-bake all seven primitives, confirm previews and bundle bytes match pre-change outputs (zip determinism check), and `npm run build` passes clean
- [x] 5.3 Update `docs/bake-pipeline.md` "Current state" and conventions (glTF sources, textured albedo sRGB path, static-mesh scope, scale control) to match the implemented behavior
