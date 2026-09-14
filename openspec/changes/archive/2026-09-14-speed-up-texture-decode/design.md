## Context

See `proposal.md` — Why. The measured decode path is
`decodePng` (`src/runtime/assets.ts:625`): `createImageBitmap` →
`canvas.drawImage` → `ctx.getImageData` → `Uint8Array`, and the renderer then
uploads those bytes (`Renderer.uploadSpriteLayerAt`). The render pass is
never read on the CPU for anything but the upload — picking and shadow points
read the g-buffer, not the render. Materials (`parseGroundMaterial`,
`src/app/groundMaterial.ts`) decode every map with `createImageBitmap` and are
re-invoked on each world open from `applyGroundMaps`
(`src/app/store/world.ts`), with no cache. The ground renderer already uploads
`ImageBitmap`s directly (`Renderer.setGroundMaterials`'s `uploadLayer`
TexImageSource branch), so the direct-upload path is proven in this codebase.

## Goals / Non-Goals

**Goals:**

- Remove the canvas/`getImageData` readback from the sprite render path.
- Retain decoded ground-material maps for the session, workspace-scoped.
- Attribute the remaining decode stalls using the `sprite.bitmap` span and
  the `material.*` spans.

**Non-Goals:**

- No bundle/manifest/format change; no half-float g-buffer storage (see
  proposal Non-goals — a separate re-bake/format change).
- No worker/off-thread decode, no cross-session cache.
- No change to ground-material resampling (all traced maps already match the
  array size), lighting, occlusion, or picking.

## Decisions

### D1 — The render pass stays an `ImageBitmap`

`decodePng` returns the `ImageBitmap` (with the existing dimension
validation) and never touches a canvas. `SpriteLayer.render` widens to
`Uint8Array | ImageBitmap`: bundle loads carry a bitmap, boot-baked
primitives (`bakePrimitiveLayer` → `ptImageToLayerBytes`) keep their byte
buffers. `layersToSet` passes either through unchanged.

*Alternatives:* keep `Uint8Array` and decode via WebCodecs `ImageDecoder`
(removes the canvas but adds an API and a copy); decode into an
`OffscreenCanvas` and still `getImageData` (same readback). The union is the
smallest change that removes the readback and matches the ground path.

### D2 — Sprite upload accepts a `TexImageSource`

`Renderer.uploadSpriteLayerAt` branches on `instanceof Uint8Array`: the
typed-array overload for boot bakes, the `TexImageSource` overload (the
bitmap) for bundle loads, at the layer's own `w × h` — the same shape the
ground `uploadLayer` already uses. If a browser rejects an `ImageBitmap`
source in `texSubImage3D`, the fallback is a same-size 2D canvas source
(`drawImage` the bitmap, upload the canvas) which still avoids `getImageData`.
Capacity/reallocation logic is unchanged, so no new allocation is introduced.

### D3 — A workspace-scoped material cache

Add `loadGroundMaterial(source)` to `src/app/groundMaterial.ts` beside the
pure `parseGroundMaterial`, where `source` is `{ key, size, lastModified,
read }` (the same shape as `BundleSource`). A module-level `Map` caches the
decoded `GroundMaterialMaps` keyed by `key`, invalidated by `size` /
`lastModified`. `applyGroundMaps`/`selectGroundMaterialFile` build the source
from the workspace epoch (`materials/<name>`) or, without a workspace, the
file name; `parseGroundMaterial` stays for pure/Node callers and
`terrain-verify`. Decoded maps (including their `ImageBitmap`s) are shared
across documents — they are read-only after decode and are only sampled.
`clearMaterialCache()` is exported for tests; no byte budget is needed (maps
are small). In-memory only (ADR 0006).

*Alternatives:* cache inside the world document (does not survive a close),
or key by name only (cross-workspace collision, the same bug fixed for sprite
views).

### D4 — Bound concurrent decodes (implemented after attribution)

D1/D2 shipped first and were re-measured: `world.open` 7917 → 4698 ms, north
render decodes 0.3–27 ms, materials ~3.7 → ~1 s. The remaining large span is
a single `sprite.bitmap` (`createImageBitmap`) of 1662 ms for one extra view,
which meets the "still dominates" condition — so the limiter is implemented,
not just deferred: `withDecodeSlot` (`src/shared/decodeQueue.ts`) bounds
concurrent `createImageBitmap` calls (sprite render + material maps) to four,
so a burst cannot starve the decoder. Caveat recorded: the world-open
resolves are sequential, and the stall coincides with the initial
renderer build/upload scheduled by `addDoc`, so if it persists the cause is
likely contention with that bulk upload rather than a decode backlog — a
separate follow-up.

### D5 — Docs and ADR

`docs/runtime.md` (render retained as a bitmap; material cache),
`docs/glossary.md` (sprite layer/material cache wording), `docs/roadmap.md`,
and a short ADR `docs/decisions/0017-…` recording that texture passes upload
from decoded bitmaps without a CPU readback.

## Risks / Trade-offs

- **`SpriteLayer.render` becomes a union** → all layer constructors must
  compile; boot bakes keep bytes, so the union is narrow and the browser
  tests plus `npm run build` cover it.
- **Holding `ImageBitmap`s may be GPU/decoder-backed** → comparable to the
  bytes they replace, and the decoded views were already cached for the
  session; bitmaps are never `close()`d while cached.
- **Cached material bitmaps are shared across worlds** → they are read-only
  and only uploaded; an edited material re-decodes on size/mtime change.
- **No-readback may not be the 4.4 s cause** → the split spans attribute it;
  D4 is the fallback. The readback removal is a strict improvement either way.
- **Half-float is tempting but out of scope** → it is a format change
  requiring a re-bake of every bundle and dual-encoding reader tolerance; its
  measured win here is file size, not the decode stalls.
