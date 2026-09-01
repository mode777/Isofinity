# Bake pipeline

How Isofinity assets are authored: a primitive (or later, arbitrary geometry)
is rendered once from the fixed isometric camera into per-pixel data passes
and stored as a sprite set plus a manifest.

Run `npm run dev` and open `/bake.html` (also built to `dist/bake.html`).
Pick a primitive, hit Bake, inspect the passes, download the files.

## Conventions

### Camera

- Orthographic, fixed for the whole engine (POE-style fixed view).
- Orbit rotated **45° around world up (+Y)**: the camera sits on the
  `(+,+,+)` body diagonal direction `(cos el · cos 45°, sin el, cos el ·
  sin 45°)` looking at the cube center, with `camera.up = (0,1,0)` and
  therefore **no roll**. This is the classic late-90s isometric setup
  (Diablo/Fallout-style 2:1 dimetric).
- Elevation **30°**: at azimuth 45° the projected ground diagonals of a
  cube have pixel slope `sin(elevation)` = `sin(30°)` = 0.5 — the exact 2:1
  tile grid of classic isometric games — and the world +Y axis stays exactly
  vertical on screen. Constants: `src/bake/iso.ts`.
- The sprite rect is computed by projecting the 8 corners of the unit cube
  into view space — no hand-tuned dimensions; any camera angle keeps working.

### Asset bounds

- An asset occupies an axis-aligned world-space box with the minimum corner
  at `(0,0,0)` and its extent recorded as `cube.size` in the manifest. The
  1×1×1 unit cube is the default cell (bigger assets can still be grids of
  cube sprites blitted together), but any cuboid bakes directly — the test
  set includes a 2×0.5×1 slab.
- Asset-space position is **not stored**; it is derived from pixel + depth
  (see below). The box origin is tracked by the asset layout, so assets
  tile losslessly.
- The **g-buffer pass** stores world-space normals. Boxes are axis-aligned,
  so asset-local and world normals are identical; only the position offset
  differs per asset.

### Depth instead of position

The stored format does **not** contain a position pass. With the fixed
orthographic camera, every pixel's ray has the same known direction and a
known origin, so full 3D position is exactly reconstructible from the pixel
coordinate plus a single scalar depth — the standard deferred-rendering
trade (store depth, unproject), and it saves two channels per pixel.
Depth lives in the **alpha channel of the g-buffer pass** (rgb = normal,
a = depth), the classic packed-G-buffer layout and exactly the texture the
planned KTX2/UASTC delivery would carry.

- Definition: `depth = dot(worldPos, viewDir)` — linear ray distance from
  the global reference plane through the world origin, perpendicular to the
  view direction. Chosen over distance-from-camera so that depths stay
  comparable **across cube sprites** in multi-cube assets (the camera is
  repositioned per cube, the reference plane is not).
- Range for an asset of size `s`: `depthRange(s) = [0, Σ|viewDirᵢ·sᵢ|]`
  (`src/shared/iso.ts`) — `[0, 1.725]` for the unit cube. Depths are absolute
  (global reference plane), so they stay comparable across assets of any
  size; the range only drives preview normalization and the manifest.
- Reconstruction: `worldPos = rayOrigin(pixel) + (depth - dot(rayOrigin,
  viewDir)) * viewDir`, implemented in `reconstructWorldPos()` next to the
  camera constants so bake-time and runtime can never drift apart.
- Cube-space position is derived, never stored: `cubePos = worldPos -
  cubeOrigin` with the per-cube origin known to the compositor.
- A debug-only `position-debug.png` (reconstructed cube-space position,
  8-bit) is exported for golden-image diffs; sub-pixel lateral error (~half
  a pixel) is expected and harmless there.
- Normals remain baked — deriving them from depth derivatives breaks at
  silhouettes and interior edges (the donut hole).

### Passes (one MRT draw call, `count: 2`, half-float RGBA targets)

| Pass    | RGB                             | A                | File                |
| ------- | ------------------------------- | ---------------- | ------------------- |
| albedo  | surface color, **sRGB-encoded** | coverage         | `<id>-albedo.png`   |
| gbuffer | world-space normal              | linear ray depth | `<id>-gbuffer.exr`  |

- Coverage: `a = 1` on rendered albedo pixels, `0` on background (clear color
  `(0,0,0,0)` lands in every MRT attachment). The engine uses this for
  hit-testing and occlusion.
- G-buffer emptiness: background pixels are all-zero, and since the g-buffer
  alpha is depth (not coverage), empty pixels are detected as
  `length(normal) == 0`. Testing `a == 0` alone would be wrong — depth 0 is
  a real value at the cube's `(0,0,0)` corner.
- Albedo is stored sRGB-encoded (standard texture convention) — the engine
  converts to linear at sample time. The g-buffer EXR is linear float32.
- Precision: the MRT targets are half-float, so depth carries half precision
  through the whole pipeline regardless of the EXR's float32 container —
  worst-case error ≈ 0.0008 units (~0.1 px at 128 px/unit), accepted for the
  fixed-range unit-cube layout.
- Pixels outside the cube bounds are discarded in the fragment shader — this
  is the cube-clipping rule future CSG/authoring builds on.
- Row order: GL readback is bottom-up; PNG gets flipped to top-down, EXR
  does not (the exporter compensates for GL order internally).

### Sprite placement

`sprite.originPx` in the manifest is the projected box min corner `(0,0,0)`
in sprite pixel coordinates. Compositing a multi-cube asset = blit each
cube's sprite offset by the projected difference of their origins; no per-
asset alignment work is needed. Sprites of different assets may differ in
pixel size (`pxPerUnit` is fixed, the box is not): the runtime pads every
sprite into a shared max-size texture array (data anchored bottom-left) and
moves quad size + sprite texel size into per-instance attributes.

### Manifest (`<id>-bake.json`)

Records camera angles and view direction, `pxPerUnit`, sprite size, origin,
depth semantics/range and per-pass channel semantics
(`format: "isoinfinity-bake/3"`; v1 stored a redundant cube-space position
pass instead of depth, v2 stored depth and normals as two separate EXRs).

## Current state / next steps

- Done: sphere, donut, cube, cylinder, capsule, plane and slab (2×0.5×1)
  test primitives, box-frame camera math (arbitrary cuboids), MRT bake
  (albedo + merged g-buffer), PNG + EXR export, debug position dump,
  manifest, visual pass preview.
- Planned: supersampling (render at N× and box-downsample), multi-cube
  composite assets, geometry-level clipping (CSG) instead of shader discard,
  KTX2/UASTC packaging for delivery (the merged g-buffer is already in the
  packed delivery layout), raytraced golden-image diff as a validator.
