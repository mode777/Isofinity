## 1. Render pass uploads from a decoded bitmap

- [x] 1.1 Change `decodePng` (`src/runtime/assets.ts`) to return the `ImageBitmap` (keeping the width/height validation) with no canvas/`getImageData`; verify `npm run build` typechecks the new return type
- [x] 1.2 Widen `SpriteLayer.render` to `Uint8Array | ImageBitmap` (and `SpriteSet.renderLayers` accordingly), keeping `layersToSet` pass-through; verify boot-baked primitives still compile with their byte buffers
- [x] 1.3 In `src/runtime/renderer.ts`, branch `uploadSpriteLayerAt` on `instanceof Uint8Array` (typed-array overload) vs `TexImageSource` (bitmap), uploading at the layer's own dimensions; verify `npm run build` and that `document`/`scratch-verify` layer constructors still compile
- [x] 1.4 Confirm the sprite display is unchanged by running the Node gates (`npm run verify:selection`, `npm run verify:shadows`, `npm run verify:bundles`) and leaving the browser visual check to the user

## 2. Session-cache ground-material maps

- [x] 2.1 Add `loadGroundMaterial(source)` + `clearMaterialCache()` to `src/app/groundMaterial.ts`, caching decoded maps by a workspace-scoped key plus size/last-modified, leaving the pure `parseGroundMaterial` for Node callers; verify with a `terrain-verify.ts` case that a second load of the same source does not re-read/re-decode
- [x] 2.2 Wire `applyGroundMaps`/`selectGroundMaterialFile` (`src/app/store/world.ts`) to build the source (workspace epoch + `materials/<name>`) and use `loadGroundMaterial`; verify `npm run verify:terrain` passes
- [x] 2.3 Add a `terrain-verify.ts` case that a changed size/last-modified and a different workspace key re-decode, and that cache-clearing empties the cache; verify the cases pass

## 3. Attribute the remaining decode stalls

- [x] 3.1 Run `npm run dev` with `?loadtrace`, open a multi-direction world, and compare `sprite.bitmap` vs `sprite.readback` and the `material.image`/`material.parse` spans; record the attribution (left to the user — no browser here)
- [x] 3.2 If `sprite.bitmap`/`material.image` still dominates, bound concurrent `createImageBitmap` decodes (a small queue) so one decode cannot stall behind a backlog; verify the attributed span drops in a follow-up trace

## 4. Docs and ADR

- [x] 4.1 Add ADR `docs/decisions/0017-…` recording that texture passes upload from decoded bitmaps without a CPU readback, and add its index row to `docs/decisions/README.md`; verify the file and row render
- [x] 4.2 Update `docs/runtime.md` (render retained as a bitmap; material session cache) and `docs/glossary.md` (sprite layer / material cache wording), and add a `docs/roadmap.md` entry; verify the docs describe the shipped behavior

## 5. Verification

- [x] 5.1 Run `npm run verify:bundles`, `npm run verify:trace`, `npm run verify:selection`, `npm run verify:shadows`, `npm run verify:terrain`, and `npm run build`; confirm all pass
- [x] 5.2 Hand the user the browser recipe (`npm run dev` with `?loadtrace`) to open and re-open the world and confirm the render readback is gone and materials are not re-decoded on the second open
