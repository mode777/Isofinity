# 0016 — Sprite layers upload tight and incrementally

Status: Accepted (2026-09-14, change `fix-sprite-load-structure`)

## Context

Loading a world padded every sprite layer to the largest sprite's
dimensions with per-pixel JS loops and re-uploaded every layer whenever the
layer set changed, and the world viewport disposed and reconstructed the
whole renderer on each added layer. Measured on a 12-layer world, that
padding/rebuild loop cost ~3 s even after the disk reads were made fast,
because a 208x150 grass sprite was stored and uploaded as a 2028x1880
rectangle and every direction resolve rebuilt every texture. The sprite
vertex shader samples only each layer's own `w x h` sub-rect of its slice
(`vUv` is scaled by the layer's texel size), so the padded region was never
read.

## Decision

`SpriteLayer` passes stay **tight** per layer: `layersToSet` passes the
layers' own g-buffer/render buffers through (`src/runtime/assets.ts`), and
every CPU consumer indexes a layer with **its own width** — `surfaceSnap.ts`,
`selection.ts`, and `buildLayerShadowPoints` use `sizes[i][0]`, not a shared
maximum. `maxW`/`maxH` remain informational only.

`Renderer` (`src/runtime/renderer.ts`) holds one `TEXTURE_2D_ARRAY` per pass
and uploads each layer with `texSubImage3D` at `(0, 0)` using the layer's
own `w x h`. The array is allocated with power-of-two dimension and slice
headroom; `addSpriteLayer` appends and uploads only the new slice while it
fits, and reallocates (re-uploading the layers it retained references to)
only when a layer exceeds the allocation or the slice capacity grows.
`setSprites` is the construction/full-rebuild path. The world viewport keeps
one `Renderer` for the document's lifetime and applies layer changes through
the delta method instead of reconstructing the renderer
(`src/app/components/WorldEditor.tsx`).

## Consequences

- Adding a layer no longer copies or re-uploads existing layers; a small
  sprite no longer costs the largest sprite's texture bandwidth.
- The loaded set carries no padded copies, so its memory is the layers'
  own passes. `SpriteSet.maxW` is no longer a stride and must not be used as
  one.
- GPU texture slices are still allocated at the capacity (uniform slices are
  a texture-array property); only the upload is tight. Capacity headroom can
  waste uninitialized slice area, which is never sampled.
- The renderer must retain references to the uploaded CPU arrays to be able
  to reallocate; those references are the document's own buffers (no copy).

## Rejected alternatives

- **Keep padding but copy rows with `TypedArray.set`** — still a full CPU
  pass and full-size buffers per layer; only the constant factor improves.
- **One `TEXTURE_2D` per layer with a sampler index** — WebGL2 cannot
  dynamically index a sampler array without a branch cascade, and it would
  break the single instanced draw.
- **Reconstruct the renderer per layer** — recompiles programs, recreates
  VAOs/UBOs, rebinds listeners, and re-uploads every layer; measured
  ~250–540 ms per layer.
