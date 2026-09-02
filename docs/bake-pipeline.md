# Bake pipeline

How Isofinity assets are authored: a primitive (or a glTF model) is rendered
from the fixed isometric camera into per-pixel data passes and stored as a
sprite set plus a manifest. Two renderers produce passes over the **same
scene and camera**: a raster MRT draw (unlit albedo + merged g-buffer) and a
GPU path tracer (`three-gpu-pathtracer`) for the optional lit `render` and
`ao` passes.

Run `npm run dev` and open `/bake.html` (also built to `dist/bake.html`).
Pick a primitive or load a glTF file, hit Bake, inspect the passes, download
the bundle. With an HDRI environment loaded (drag-drop an equirect `.hdr`)
you can also bake the path-traced render and AO passes; environment and pass
settings sit below the source controls.

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

### glTF sources

- **Load**: a self-contained `.glb`, or a plain `.gltf` whose external
  `.bin` buffer and texture images are provided together with it
  (multi-select or drag-drop onto "Load glTF"); resources resolve by
  percent-decoded relative path, falling back to a unique basename match —
  ambiguity or absence is a named error, never a guess.
- **Scope**: static meshes only. Skins, animations, and multi-material
  meshes are skipped with a status note; DRACO, Meshopt, and KTX2/Basis
  payloads are rejected by name (no decoder dependencies).
- **Placement**: the model is translated so its bounding-box minimum corner
  sits at `(0,0,0)`; native dimensions are preserved. A uniform scale
  control rescales at bake time (applied as the mesh transform, so the box
  still starts at the origin); `cube.size` records the scaled extent. A
  projected sprite larger than 8192 px on either axis is rejected — scale
  the model down.
- **Geometry**: each material's meshes are merged into one draw group
  (world transforms baked in); meshes without normals are rejected — the
  g-buffer needs real normals and never derives them from depth.
- **Albedo**: per pixel, the material's base-color texture (sRGB-decoded at
  sample time) multiplied by the linear base-color factor, re-encoded to
  sRGB before storage — matching the primitive flat-color path, which writes
  sRGB hex values as-is. Materials without a texture bake their factor as a
  flat color.
- **Coverage**: glTF `MASK` materials discard fragments whose sampled alpha
  (× factor alpha) falls below the alpha cutoff, so those pixels read as
  empty in both passes (hit-testing/occlusion stay correct); `BLEND`
  materials bake opaque.

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

| Pass    | RGB                             | A                | File                | Renderer |
| ------- | ------------------------------- | ---------------- | ------------------- | -------- |
| albedo  | surface color, **sRGB-encoded** | coverage         | `<id>-albedo.png`   | raster   |
| gbuffer | world-space normal              | linear ray depth | `<id>-gbuffer.exr`  | raster   |
| render  | tone-mapped lit color (ACES, sRGB) | coverage (AA) | `<id>-render.png`   | path traced, optional |
| ao      | ambient occlusion (linear, white = unoccluded) | coverage | `<id>-ao.png`  | path traced, optional |

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

### Path-traced passes (`render`, `ao`)

The path tracer (`three-gpu-pathtracer`, WebGL2 + BVH; see `src/bake/pt.ts`)
renders the same scene through the **same** `frameIsoBox` orthographic
camera as the raster pass, so all passes align pixel-for-pixel. The library
detects ortho cameras from the projection matrix and jitters NDC per sample
for anti-aliasing, so sprite edges converge to true AA.

- **Transparency**: `scene.background = null` puts the library into
  `backgroundAlpha = 0` mode — miss pixels accumulate alpha 0 and the
  accumulation switches to its manual-blend path (no `EXT_float_blend`
  requirement). Object pixels converge to alpha 1; the pass alpha is the
  antialiased coverage. Note it is *softer* than the raster pass's hard
  0/1 coverage: occlusion and hit-testing keep consuming **raster**
  coverage; only display uses the render alpha.
- **Illumination**: `scene.environment` (equirect `.hdr` via `HDRLoader`)
  is the sole light source, with rotation/intensity/exposure/saturation
  controls; changing any of them restarts accumulation. No background image is ever
  captured into the pass. Without an environment the render pass is simply
  not produced (AO does not need one).
- **Tonemapping/export**: the accumulated linear float target is composited
  through a fullscreen quad using three's `<tonemapping_fragment>`
  (ACES filmic) plus an explicit sRGB transfer and a display-referred
  saturation adjust (mix toward Rec.709 luminance, 0 = gray, 1 = neutral)
  into RGBA8 — the preview
  canvas is drawn from exactly those bytes, so the exported PNG is
  pixel-identical to the preview by construction.
- **Materials**: the render stage consumes full PBR materials (glTF
  base-color/metallic-roughness/normal maps via `MaterialGroup.pbrMaterial`;
  primitives and legacy groups fall back to base-color fields). MASK
  materials apply their cutoff through `alphaTest` in the path tracer.
  All scene textures are normalized to shared wrap/filter flags (library
  requirement) and repacked into a texture array capped by the
  `tex-size` setting (default 1024) — larger albedo maps downscale.
- **AO pass** (KNOWN BROKEN): `AmbientOcclusionMaterial` + shared BVH
  uniform; N cosine-hemisphere rays per pixel against the asset geometry
  (radius control), accumulated with a running average and seeded sub-pixel
  view jitter. Despite per-frame renders and readbacks verifying correct
  (audit logs in `[pt-audit]`), the accumulated output comes back empty on
  tested hardware; this approach will be replaced in a future change, so
  the pass ships labeled broken rather than fixed.
- **Determinism**: the library resets its RNG seed per bake and seeds per
  sample; the AO jitter uses a fixed-seed PRNG. A fixed settings set
  reproduces a bake bit-for-bit on the same hardware/driver; cross-GPU
  byte equality is not a goal.
- **Manifest provenance**: when either path-traced pass is included, the
  manifest records an `environment` block (hdri name, rotation, intensity,
  exposure, saturation) and a `renderer` block (name/version, samples, bounces,
  denoise, seed, AO settings) so a bake is reproducible from its bundle.

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
(`format: "isoinfinity-bake/4"`; v3 and earlier stored only albedo +
g-buffer; v4 adds the optional path-traced passes plus `environment` /
`renderer` provenance blocks — the g-buffer EXR and albedo PNG keep the v3
byte conventions exactly).

### Bundle (`<id>-bake.zip`)

The bake tool ships all parts as a single deflate zip (written with fflate —
three's vendored copy, no extra dependency):

```
<id>-bake.zip
├─ manifest.json          deflated
├─ <id>-albedo.png        stored (PNG is already compressed)
├─ <id>-gbuffer.exr       deflated (raw float + zero padding compress well)
├─ <id>-render.png        stored, when baked
└─ <id>-ao.png            stored, when baked
```

Entry names are exactly the file names the manifest's `passes` table
references, and the parts are byte-identical to the loose passes — the
container is pure transport, so any zip tool opens it and each pass stays
individually diffable. Entries carry a fixed mtime so re-baking the same
primitive with the same settings yields identical bytes. `parseBake()`
(`src/bake/bundle.ts`) is the matching reader: unzip, validate the `format`
prefix (`/3` and `/4` accepted, anything else rejected by name), resolve
entries via the manifest, return Blobs ready for the PNG/EXR decoders, and
expose which optional passes are present. The runtime editor consumes
bundles through **Load zip**.

## Current state / next steps

- Done: sphere, donut, cube, cylinder, capsule, plane and slab (2×0.5×1)
  test primitives, box-frame camera math (arbitrary cuboids), MRT bake
  (albedo + merged g-buffer), PNG + EXR export, single-file zip bundle,
  debug position dump, manifest, visual pass preview.
- Done: glTF sources (`.glb` and `.gltf` + `.bin` + textures) — static
  meshes only, per-material merged draw groups, textured albedo (sRGB
  texture × linear factor), alpha-mask coverage, origin normalization with
  a UI uniform-scale control, compressed-payload rejection, same bundle
  output. `scratch-verify.html` (dev server) exercises the GPU-side checks
  and prints primitive bundle hashes (note: the v4 format bump changed all
  hashes — re-baseline before comparing across format versions).
- Done: path-traced `render` + `ao` passes (`three-gpu-pathtracer` 0.0.24)
  over the same ortho camera — HDRI environments with rotation/intensity/
  exposure, full PBR materials for glTF sources, ACES export identical to
  the preview, deterministic accumulation, bundle format `isoinfinity-bake/4`
  with optional passes and provenance blocks.
- Broken: the path-traced `ao` pass accumulates empty output despite healthy
  per-frame renders (see the AO section above) — labeled broken in the UI,
  slated for replacement with a different approach.
- Planned: supersampling (render at N× and box-downsample), multi-cube
  composite assets, geometry-level clipping (CSG) instead of shader discard,
  KTX2/UASTC packaging for delivery (the merged g-buffer is already in the
  packed delivery layout), raytraced golden-image diff as a validator,
  Draco/Meshopt/KTX2 decode for glTF inputs, skinned bind-pose extraction,
  bake "application" shell (sessions/projects, batch queue, HDRI library),
  screen-space denoiser option (field exists, wired off), OIDN-class
  denoising for low-sample bakes.
