## Why

After `fix-sprite-load-structure` removed the padding/rebuild/re-read costs,
the remaining time is dominated by texture decoding, not by our load
bookkeeping. Measured on a 12-layer world (fast local storage): `world.open`
is 7.9 s, of which a single `sprite.png` decode is **4412 ms** while the same
asset's north PNG is 9 ms; materials add **~3.7 s** (`material.parse` 2083 /
906 / 722 ms, `material.image` up to 1516 ms) and are re-decoded on every
open because there is no cache. Two avoidable costs are visible:

- the sprite render pass decodes to an `ImageBitmap`, bounces it through a 2D
  canvas, reads it back with `getImageData` (a synchronous GPU→CPU readback),
  and then re-uploads the bytes to GL — a full round trip for data that is
  only ever a texture;
- ground materials are parsed and image-decoded from scratch each open.

## What Changes

- **Render passes upload from the decoded bitmap.** A bundle's render pass
  stays an `ImageBitmap` (no canvas, no `getImageData`) and the sprite
  texture upload accepts it directly as a `TexImageSource`. Boot-baked
  passes keep uploading their existing byte buffers. Display is pixel-identical.
- **Ground-material maps are session-cached** under the same workspace-scoped
  identity rules as sprite views, so re-opening a world (or switching tabs and
  back) reuses decoded maps instead of re-parsing and re-decoding them.
- **Attribute the remaining stalls** with the existing `sprite.bitmap`
  (`createImageBitmap`) vs `sprite.readback` spans; if the dominant cost is
  decode scheduling rather than the readback, bound concurrent decodes.
- **Docs and ADR**: `docs/runtime.md` (decode/upload path + material cache),
  `docs/glossary.md`, `docs/roadmap.md`; a short ADR recording that texture
  passes are uploaded from decoded bitmaps without a CPU readback.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-sprite-rendering`: the render pass is retained as a decoded bitmap
  and uploaded to the sprite texture array without a CPU readback.
- `runtime-ground-rendering`: decoded ground-material maps are retained for
  the session and reused across opens.

## Impact

- Code: `src/runtime/assets.ts` (`decodePng` returns a bitmap;
  `SpriteLayer.render` becomes `Uint8Array | ImageBitmap`), `src/runtime/renderer.ts`
  (sprite upload accepts a `TexImageSource`; material decode/upload cache),
  `src/app/groundMaterial.ts` + `src/app/store/world.ts` (workspace-scoped
  material cache), and the layer constructors in `src/app/mesh-debug.ts`,
  `src/bake/scratch-verify.ts`, and the verifiers that build layers.
- Docs: `docs/runtime.md`, `docs/glossary.md`, `docs/roadmap.md`, new ADR
  (`docs/decisions/0017-…`).
- Format: **none.** The render pass stays a PNG and the g-buffer encoding is
  untouched; no re-bake is required.
- Verification: `npm run verify:bundles`, `npm run verify:trace`,
  `npm run verify:selection`, `npm run verify:shadows`, `npm run verify:terrain`,
  `npm run build`; the decode attribution and a world re-open remain the
  user's browser run (this environment cannot launch one).
- Non-goals (deliberately out of scope): **storing the g-buffer as half-float
  EXR** (a separate format change that requires re-baking every bundle and
  reader tolerance; its win is file size / retained memory, not the decode
  stalls this change targets — split into a follow-up), worker/off-thread
  decode, cross-session cache, parallel asset reads, the material map resample
  path (all traced maps already match the array size), and any lighting or
  occlusion behavior.
