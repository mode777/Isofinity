# 0017 — Texture passes upload from decoded bitmaps, not CPU readbacks

Status: Accepted (2026-09-14, change `speed-up-texture-decode`)

## Context

Decoding a bundle render pass used to be `createImageBitmap` → 2D-canvas
`drawImage` → `getImageData` → `Uint8Array`, after which the renderer
uploaded those bytes to the sprite texture array. The render pass is only
ever a texture — picking and shadow points read the g-buffer, never the
render — so the `getImageData` step was a synchronous GPU→CPU copy purely to
re-upload. Browser traces showed it as an erratic multi-second stall (a
4412 ms `sprite.png` for one extra view whose north PNG decoded in 9 ms),
while the ground-material path already uploaded `ImageBitmap`s directly.

## Decision

A bundle's render pass is decoded to the bitmap itself
(`decodePngBitmap`, `src/runtime/assets.ts`) and retained on the layer:
`SpriteLayer.render` is `Uint8Array | ImageBitmap`. The sprite texture upload
(`Renderer.uploadSpriteLayerAt`) branches on `instanceof Uint8Array` and, for
a bitmap, uses the `TexImageSource` `texSubImage3D` overload — the same
overload the ground material path already uses. Boot-baked passes, produced
as byte buffers, keep uploading from bytes, and the sprite editor's preview
path keeps the byte-returning `decodePng`. No canvas readback is involved in
the runtime load path.

Decoded ground-material maps are likewise retained in a workspace-scoped
session cache (`loadGroundMaterial`), so re-opening a world does not re-parse
and re-decode them.

## Consequences

- The runtime never copies decoded render pixels through a canvas; the
  `ImageBitmap` is uploaded where it is.
- `SpriteLayer.render` is a union; the renderer handles both and the
  boot-bake path is unchanged.
- Decoded bitmaps are held by the session caches (sprite views and materials
  already were); they are read-only after decode and are never `close()`d
  while cached.
- The editor's byte-path decoder (`decodePng`) remains for callers that need
  CPU pixels (the sprite editor preview).

## Rejected alternatives

- **WebCodecs `ImageDecoder`** — removes the canvas but adds an API surface
  and still yields a frame to copy; the bitmap union is smaller.
- **`OffscreenCanvas` + `getImageData`** — same synchronous readback.
- **Change `decodePng` globally to return a bitmap** — breaks the sprite
  editor's preview, which needs CPU pixels; a separate runtime decoder keeps
  both paths correct.
- **Half-float g-buffer storage to shrink bundles** — a format change
  requiring a re-bake and dual-encoding readers; it targets file size, not
  the readback stall this ADR removes (deferred to a separate change).
