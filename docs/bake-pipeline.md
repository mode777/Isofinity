# Bake pipeline

How Isofinity assets are authored: a primitive (or a glTF model) is rendered
from the fixed isometric camera into per-pixel data passes and stored as a
sprite set plus a manifest. Two renderers produce passes over the **same
scene and camera**: a raster draw (merged g-buffer: normals + depth) and a
GPU path tracer (`three-gpu-pathtracer`) for the optional lit `render` pass.

Run `npm run dev` and open the integrated editor (`index.html`). Open a
primitive or model from the **project browser** (or "Import glTF file…")
— a sprite editor tab opens and raster-bakes immediately — then inspect
the passes, bake the path-traced render pass, and save the bundle
(into a connected workspace folder, or as a browser download). With an
HDRI environment loaded (file dialog, or pick one from the workspace's
`hdri/`) the render pass can accumulate; environment and pass settings sit
in the properties panel. See `docs/runtime.md` for the editor shell.

### Workspace folder

The editor binds a local folder through the File System Access API
("Open workspace…" in the top bar): the picked folder is expected to hold
(and is created with, if missing) the convention subfolders `hdri/`,
`models/`, `sprites/`, `worlds/`. The connection is remembered locally
(IndexedDB), so a reload only needs one permission click ("Reconnect
workspace…"). While connected, the project browser lists `models/`,
`sprites/` and `worlds/`, the sprite properties panel gains an `hdri/`
listing (a `.gltf`'s external resources resolve against the folder's
contents), and bundle saves write `sprites/<id>.sprite` directly. Without
a workspace — or in browsers without the API (Firefox/Safari) —
everything falls back to file dialogs and downloads exactly as before
(feature-detected, never UA-sniffed).

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
- **Albedo**: per-pixel surface color is not stored as a pass; the render
  stage consumes each material's base-color texture (sRGB-decoded at
  sample time) multiplied by the linear base-color factor. Materials
  without a texture render their factor as a flat color.
- **Coverage**: glTF `MASK` materials discard fragments whose sampled alpha
  (× factor alpha) falls below the alpha cutoff at raster-bake time, so
  those pixels read as empty in the g-buffer (hit-testing/occlusion stay
  correct); `BLEND` materials bake opaque.

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

### Passes (one raster draw call, half-float RGBA target)

| Pass    | RGB                             | A                | File                | Renderer |
| ------- | ------------------------------- | ---------------- | ------------------- | -------- |
| gbuffer | world-space normal              | linear ray depth | `<id>-gbuffer.exr`  | raster   |
| render  | tone-mapped lit color (ACES, sRGB) | coverage (AA) | `<id>-render.png`   | path traced, optional |

- Coverage: there is no separate coverage pass. A pixel is "rendered" when
  its g-buffer normal is non-zero; background pixels are all-zero (clear
  color `(0,0,0,0)`). The engine uses this for hit-testing and occlusion,
  and the render pass's alpha is the antialiased display coverage.
- G-buffer emptiness: since the g-buffer alpha is depth (not coverage),
  empty pixels are detected as `length(normal) == 0`. Testing `a == 0`
  alone would be wrong — depth 0 is a real value at the cube's `(0,0,0)`
  corner.
- Per-pixel color ships exclusively through the path-traced `render` pass
  (the runtime requires it before a sprite can be placed). The g-buffer EXR
  is linear float32.
- Precision: the raster target is half-float, so depth carries half precision
  through the whole pipeline regardless of the EXR's float32 container —
  worst-case error ≈ 0.0008 units (~0.1 px at 128 px/unit), accepted for the
  fixed-range unit-cube layout.
- Pixels outside the cube bounds are discarded in the fragment shader — this
  is the cube-clipping rule future CSG/authoring builds on.
- Row order: GL readback is bottom-up; PNG gets flipped to top-down, EXR
  does not (the exporter compensates for GL order internally).

### Path-traced pass (`render`)

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
  0/1 g-buffer emptiness: occlusion and hit-testing keep consuming the
  raster g-buffer; only display uses the render alpha.
- **Illumination**: `scene.environment` (equirect `.hdr` via `HDRLoader`)
  is the sole light source, with rotation/intensity/exposure/saturation
  controls; changing any of them restarts accumulation. No background image is ever
  captured into the pass.   Without an environment the render pass is simply not produced.
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
- **Determinism**: the library resets its RNG seed per bake and seeds per
  sample. A fixed settings set reproduces a bake bit-for-bit on the same
  hardware/driver; cross-GPU byte equality is not a goal.
- **Manifest provenance**: when the render pass is included, the manifest
  records an `environment` block (hdri name, rotation, intensity, exposure,
  saturation) and a `renderer` block (name/version, samples, bounces,
  denoise, seed) so a bake is reproducible from its bundle.

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
(`format: "isoinfinity-bake/5"`; v4 and earlier stored an albedo PNG
alongside the g-buffer and their manifests may still record albedo/ao pass
entries — the parser resolves only the g-buffer and optional render entries
and ignores the rest, so old bundles keep loading unchanged; the g-buffer
EXR keeps the v3 byte conventions exactly). v5 adds the editor-facing
`provenance` block: the bake source (a primitive name, or a workspace model
file name + uniform scale), the path-trace settings, and the environment (a
`procedural` marker or an `hdri/` file name + parameters) — so the
integrated editor can re-open a sprite editable and re-bake it in place.
v5 without a `provenance` block is valid; the editor then opens it
view-only.

### Bundle (`<id>.sprite`)

The bake tool ships all parts as a single deflate zip (written with fflate —
three's vendored copy, no extra dependency). The file is named with the
`.sprite` extension — the bytes are an ordinary zip — so operating systems
(macOS in particular) do not auto-extract it on download; legacy
`<id>-bake.zip` files from earlier versions keep loading unchanged since
the parser never looked at extensions:

```
<id>.sprite
├─ manifest.json          deflated
├─ <id>-gbuffer.exr       deflated (raw float + zero padding compress well)
└─ <id>-render.png        stored, when baked
```

Entry names are exactly the file names the manifest's `passes` table
references, and the parts are byte-identical to the loose passes — the
container is pure transport, so any zip tool opens it and each pass stays
individually diffable. Entries carry a fixed mtime so re-baking the same
primitive with the same settings yields identical bytes. `parseBake()`
(`src/bake/bundle.ts`) is the matching reader: unzip, validate the `format`
prefix (`/4` and `/5` accepted, anything else rejected by name), resolve
entries via the manifest — the g-buffer entry is required, the render entry
is optional, and legacy albedo/ao entries are ignored — and expose which
optional passes are present plus the `provenance` block when recorded. The
integrated editor consumes bundles through the project browser's
`sprites/` listing.

## Current state / next steps

- Done: sphere, donut, cube, cylinder, capsule, plane and slab (2×0.5×1)
  test primitives, box-frame camera math (arbitrary cuboids), raster bake
  (merged g-buffer), PNG + EXR export, single-file zip bundle, debug
  position dump, manifest, visual pass preview.
- Done: glTF sources (`.glb` and `.gltf` + `.bin` + textures) — static
  meshes only, per-material merged draw groups, alpha-mask coverage,
  origin normalization with a UI uniform-scale control, compressed-payload
  rejection, same bundle output. `scratch-verify.html` (dev server)
  exercises the GPU-side checks and prints primitive bundle hashes (note:
  the albedo/ao pass removal changed all hashes — re-baseline before
  comparing across format versions).
- Done: path-traced `render` pass (`three-gpu-pathtracer` 0.0.24) over the
  same ortho camera — HDRI environments with rotation/intensity/exposure,
  full PBR materials for glTF sources, ACES export identical to the
  preview, deterministic accumulation, optional pass and provenance
  blocks.
- Removed: the unlit `albedo` pass (no runtime consumer — per-pixel color
  ships through the required render pass) and the path-traced `ao` pass
  (accumulated empty output on tested hardware; removed end to end rather
  than shipped broken — a future change may reintroduce occlusion with a
  different approach). Bundles carrying the legacy passes still load; the
  entries are ignored.
- Done: workspace folders (File System Access API, `src/shared/workspace.ts`)
  — `hdri/ models/ sprites/ worlds/` convention, workspace-backed model/
  HDRI listings, bundle saves to `sprites/<id>.sprite`, `.sprite` bundle
  naming everywhere (bytes unchanged), IndexedDB handle persistence with
  one-click reconnect, graceful degradation to dialogs/downloads elsewhere.
- Done: the integrated React editor (`src/app/`) replacing the separate
  `bake.html` + runtime pages — editor tabs over in-memory documents,
  project browser, context-sensitive properties panel, `isoinfinity-bake/5`
  provenance with re-bake, and in-memory place-into-world.
- Planned: supersampling (render at N× and box-downsample), multi-cube
  composite assets, geometry-level clipping (CSG) instead of shader discard,
  KTX2/UASTC packaging for delivery (the merged g-buffer is already in the
  packed delivery layout), raytraced golden-image diff as a validator,
  Draco/Meshopt/KTX2 decode for glTF inputs, skinned bind-pose extraction,
  bake "application" shell (sessions/projects, batch queue, HDRI library),
  screen-space denoiser option (field exists, wired off), OIDN-class
  denoising for low-sample bakes.
