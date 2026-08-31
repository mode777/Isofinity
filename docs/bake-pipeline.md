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

### Cube space

- One asset cell is a 1×1×1 world-space cube spanning `[0,1]³` with the
  minimum corner at `(0,0,0)`. Bigger assets are grids of cubes.
- The **position pass** stores position *normalized within the cube*, so
  cubes tile losslessly; world position is reconstructed as
  `cubeOrigin + cubePos * cubeSize`.
- The **normal pass** stores world-space normals. Cubes are axis-aligned, so
  cube-local and world normals are identical; only the position offset
  differs per cube.

### Passes (one MRT draw call, `count: 3`, half-float RGBA targets)

| Pass     | RGB                                | A        | File                  |
| -------- | ---------------------------------- | -------- | --------------------- |
| albedo   | surface color, **sRGB-encoded**    | coverage | `<id>-albedo.png`     |
| position | normalized cube-space pos `[0,1]³` | coverage | `<id>-position.exr`   |
| normal   | world-space normal                 | coverage | `<id>-normal.exr`     |

- Coverage: `a = 1` on rendered pixels, `0` on background (clear color
  `(0,0,0,0)` lands in every MRT attachment). The engine uses this for
  hit-testing and occlusion.
- Albedo is stored sRGB-encoded (standard texture convention) — the engine
  converts to linear at sample time. Position/normal EXRs are linear float32.
- Pixels outside the cube bounds are discarded in the fragment shader — this
  is the cube-clipping rule future CSG/authoring builds on.
- Row order: GL readback is bottom-up; PNG gets flipped to top-down, EXR
  does not (the exporter compensates for GL order internally).

### Sprite placement

`sprite.originPx` in the manifest is the projected cube min corner `(0,0,0)`
in sprite pixel coordinates. Compositing a multi-cube asset = blit each
cube's sprite offset by the projected difference of their origins; no per-
asset alignment work is needed.

### Manifest (`<id>-bake.json`)

Records camera angles, `pxPerUnit`, sprite size, origin and per-pass channel
semantics (`format: "isoinfinity-bake/1"`).

## Current state / next steps

- Done: sphere + donut test primitives, cube-frame camera math, MRT bake,
  PNG + EXR export, manifest, visual pass preview.
- Planned: supersampling (render at N× and box-downsample), multi-cube
  composite assets, geometry-level clipping (CSG) instead of shader discard,
  KTX2/UASTC packaging for delivery, raytraced golden-image diff as a
  validator.
