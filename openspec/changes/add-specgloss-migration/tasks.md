## 1. Groundwork

- [x] 1.1 Add `@gltf-transform/core`, `@gltf-transform/extensions`,
  `@gltf-transform/functions` as dependencies and confirm `npm install` +
  `npm run build` stay clean
- [x] 1.2 In `src/bake/gltf.ts`, export a detection helper that takes the
  parsed container JSON and returns `{ used: boolean; materialCount: number }`
  for `KHR_materials_pbrSpecularGlossiness` (reusing `readContainerJson`);
  verify with a small Node-runnable scratch check on a synthetic JSON
  (used/unused/partial-materials cases) and `npm run build`

## 2. Conversion module

- [x] 2.1 Spike the exact `@gltf-transform` v4 browser API: read a GLB
  `File` via blob URL with `WebIO`, run `metalRough()`, get GLB bytes back;
  record the confirmed call shapes in the module's header comment (fallback
  if a step is unsupported: build a `JSONDocument` from container JSON +
  BIN chunk instead)
- [x] 2.2 Implement `convertSpecGlossToMR(file: File): Promise<Uint8Array>`
  in a new module, dynamically imported so gltf-transform stays out of the
  main chunk; wrap conversion errors with the file name; verify `npm run
  build` pulls it into a separate lazy chunk (check `dist/` output)
- [x] 2.3 Add a guard that the conversion module refuses non-GLB inputs
  (name-based) so future callers cannot misuse it; verify with the Node
  scratch check from 1.2 (assert the guard rejects a `.gltf` name)

## 3. Open-flow wiring (`openModelDoc`, workspace GLB only)

- [x] 3.1 In `src/app/store/bake.ts` `openModelDoc`, for `.glb` names read
  the file, run the detection helper on its container JSON, and when
  specGloss is used show a `window.confirm` naming the file and material
  count; declining proceeds with the existing load path unchanged
- [x] 3.2 On accept: set status text, convert, `writeWorkspaceFile('models',
  fileName, bytes)`, then build the sprite document from a `File` wrapping
  the converted bytes via `loadGltf`; any throw reports in the status bar,
  opens no document, and happens before the write (or leaves the write
  failed) so the original file stays untouched
- [x] 3.3 Refresh an already-open document for the same file: on accept,
  dispose its glTF source (existing dispose path) and re-run the open flow
  on the converted bytes; verify the tab shows the fixed model without a
  reload
- [x] 3.4 Confirm by inspection that picker/drop (`openGltfFiles`) and
  `.gltf`-set workspace opens reach no offer or conversion code; `npm run
  build` green

## 4. End-to-end verification (browser, user-assisted)

- [ ] 4.1 Produce a specGloss `.glb` fixture (Node script in the
  scratch-verify style that writes one into `/tmp/opencode`) and walk every
  scenario in `specs/model-material-migration/spec.md`: offer with count,
  decline, spec-free no-offer, picker no-offer, `.gltf` no-offer, convert +
  save + load, reopen without re-offer, refresh of an open tab, and the
  two failure paths (simulate a write failure via a read-only file)
- [ ] 4.2 Bake the converted fixture and sanity-check the render pass
  against the original asset's materials (MeshPhysicalMaterial from
  `KHR_materials_specular` flowing through `WebGLPathTracer`); if the
  tracer mishandles it, apply the design fallback (plain-MR conversion
  output) and re-verify

## 5. Wrap-up

- [x] 5.1 Update `docs/bake-pipeline.md` with a short note that workspace
  `.glb` models using the deprecated specular-glossiness workflow are
  offered an in-place metallic-roughness conversion on open; verify the
  doc renders the new section sensibly
