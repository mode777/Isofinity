# Runtime renderer

`index.html` hosts the first runtime milestone: baked primitives placed on
an isometric grid. Camera and bake conventions are defined in
`docs/bake-pipeline.md`; this doc covers only how the runtime consumes them.

## Assets

At page load the runtime bakes every test primitive itself, asynchronously
("Baking sprites…" shows in the status line): `bakePrimitive(prim,
RUNTIME_PPU)` (64 px/unit) produces the merged g-buffer (RGBA16F, NEAREST —
`rgb = world-space normal`, `a = linear ray depth`; NEAREST keeps background
zero-normals and neighboring depths from bleeding across silhouettes), and
`PtBaker` path-traces the lit render pass (32 samples, 5 bounces) lit by a
**built-in procedural environment** — an equirect gradient sky with a warm
sun disc aimed at the default key light direction, so no HDRI asset is
needed and boot bakes are reproducible. The runtime uploads two WebGL2
`TEXTURE_2D_ARRAY`s: the render pass (RGBA8, LINEAR) and the g-buffer.
Assets may be arbitrary cuboids, so sprites differ in pixel size: every
layer is padded into a shared max-size rect (sprite data anchored
bottom-left, zero padding elsewhere), and each sprite's pixel size + origin
travel out of the uniforms — quad size, UV window and origin offset are
per-instance/per-layer data now. UVs are computed from texel centers
(`mix(0.5, size - 0.5, corner) / maxSize`) so LINEAR-filtered render texels
never bleed across the padding boundary.

### Workspace folder

The editor shares the bake tool's workspace convention (see
`docs/bake-pipeline.md`; module: `src/shared/workspace.ts`): after
"Open workspace…" (or one-click "Reconnect workspace…" on a later visit)
the toolbar gains a listing of the `sprites/` folder (`.sprite` and `.zip`
bundles — loading goes through exactly the same parser and rules as the
file dialog, including the render-pass requirement and unique-id handling),
and a worlds row offers save/load of the scene against the `worlds/`
folder. In browsers without the File System Access API the workspace
controls explain their absence and the file dialog keeps working.

### Worlds

**Save world** writes `worlds/<name>.json` (name defaults to the first free
`world-<n>`): the format marker `isoinfinity-world/1`, every placement
(asset id + continuous ground position) and the full light state — manual
azimuth/elevation, intensity, key and ambient colors, dynamic-light switch,
plus the sun-position inputs. Saving an existing name overwrites it.
Loading a world validates the file completely first (format marker,
placements, light/sun fields) so a corrupt file fails with a named error
and leaves the scene untouched; a valid file then clears the scene,
restores the sun inputs, recomputes the sun, and re-applies the saved
manual angles (so hand-tweaked directions round-trip), and places every
sprite whose asset id is currently loaded — placements referencing missing
assets are skipped and named in the status line.

### Loading sprite bundles

The editor's **Load sprite** button ingests bundles saved or downloaded
from the bake tool (`.sprite` and legacy `.zip` names both accepted):
`parseBake()` unpacks manifest + passes (formats `isoinfinity-bake/3` and
`/4` accepted; anything else is rejected by name), the render PNG decodes
via `createImageBitmap` and the EXR via `EXRLoader.parse`. A bundle **must**
carry the render pass — `/3` bundles and `/4` bundles without one fail with
a named error, because the runtime has no other way to display a sprite.
Row order differs per decoder and both must end top-down (row 0 = sprite
top) for upload: the PNG decodes top-down and is padded **as-is**, while
`EXRLoader` writes rows bottom-up in GL texture order (it re-flips the
file's top-down scanlines for `flipY:false` DataTextures) — so the EXR gets
the **same flip as a boot bake**. Getting this wrong mirrors the object
vertically; the two decoders are deliberately asymmetric. Loaded layers
re-pad the whole set (max size may grow, `Renderer.setSprites` rebuilds all
texture arrays), get a toolbar tool button, and are placed once
immediately. Per-layer `pxPerUnit` from the manifest drives the instance
scale, so bundles baked at any resolution land at the correct world size.

Row-order warning: GL pixel readback is bottom-up and all texture arrays
are sampled with the same UV, so **every** uploaded pass must be flipped to
top-down (`ptImageToLayerBytes` and `bakeFloatToHalf` both flip).
A pass uploaded unflipped pairs each pixel's data with its mirrored twin —
this exact bug made baked-depth occlusion look vertically mirrored on the
live site.

## Display

There are no display modes: every sprite — boot-baked or bundle-loaded —
shows its prerendered lit image shaded by the dynamic key + ambient lights
(multiplicatively, over the baked g-buffer normal; see Lighting). Blending
uses the render pass's antialiased alpha; fragment discard uses g-buffer
emptiness (`normal == 0`, the hard raster coverage of the bake draw), never
the render pass's soft edges. The **Dynamic light** checkbox pins shading
to identity: sprites show the pure prerendered image and the ground its
flat vertex color.

## Lighting

POE-style key + ambient over the baked G-buffer, shaded per pixel in the
fragment shader:

- `color = linearToSrgb(srgbToLinear(render) * (ambient + key * max(dot(N, L), 0)))`
  — the prerendered texel is sRGB-encoded (bake convention), shading
  happens in linear space, the default framebuffer is sRGB. The prerender
  already carries its own baked light, so the result double-shades — that
  trade is the accepted experiment (additive compositing was tried first
  and rejected).
- `L` is a world-space direction toward the key light, parametrized by
  azimuth/elevation sliders; key color (color picker) and intensity, are
  uploaded as uniforms every frame — all realtime-tweakable in the
  "Key light" panel. The **Dynamic light** checkbox pins the factor to
  identity (key zero, ambient one): sprites render the pure prerendered
  image.
- **Sun position** sliders (time of day 0–24 h, day of year 1–365,
  latitude −66°…+66°) compute the sun's azimuth/elevation via
  `src/shared/sun.ts` (NOAA-style declination + hour angle; local solar
  time — the sun transits at 12:00, no timezone/longitude input) and
  write through to the manual azimuth/elevation sliders and readouts.
  Computed elevation clamps into the elevation slider's range, so nights
  settle at the slider minimum (a grazing light) rather than pointing up
  from underground; azimuth wraps into [0°, 360°). Manual az/el edits
  keep overriding the direction until a sun slider moves again. The
  sun-disc in the boot-baked procedural environment still aims at the
  built-in default key direction — it does not follow the sliders.
- The ambient term is a **color**: an ambient color picker (sRGB,
  converted to linear per channel — brightness comes from the picked
  color, there is no separate ambient scalar).
- The ground shades with `N = (0,1,0)` so it responds to the same light.

## Renderer

Raw WebGL2, no scene graph, no matrices. Because the camera is fixed and
orthographic, all projection happens once on the CPU
(`src/shared/iso.ts` — same constants as the bake); the GPU side is a pure
2D compositor with three draw batches per frame:

1. **Ground** — the grid's cell top faces (y=0) as a static vertex-color
   triangle batch, CPU-projected at startup. No depth interaction.
2. **Sprites** — one instanced quad per placed object (per-instance quad
   size + sprite texel size, 8 floats per instance), painter-sorted by
   `dot(origin, viewDir)` (far → near) for blend correctness,
   alpha-blended using the render pass's (antialiased) alpha, with
   **per-pixel occlusion**: each fragment samples the baked g-buffer once
   (normals in rgb for shading and emptiness-based coverage, depth in
   alpha), adds the per-object constant `dot(origin, viewDir)` and writes
   `gl_FragDepth` (`windowZ = 0.5 - d / 128`, see `DEPTH_LINEAR_RANGE` in
   the renderer); a LEQUAL depth buffer then resolves interpenetrations
   pixel-accurately, regardless of draw order. The linear map keeps the
   whole reachable placement range inside [0,1] with ample 24-bit
   precision.
3. **Highlight** — hovered footprint overlay quad, no depth interaction.

## Input

Placements are **free-form** (continuous x/z on the ground plane,
cursor-centered) — not grid-snapped — so overlapping objects exercise the
per-pixel occlusion. Left-click/drag places the selected tool, right-click
erases the nearest placement whose unit-cube footprint contains the
cursor, toolbar or eraser tool selects. Ground picking inverts the shared
projection analytically (`screenToGround`), no hit-testing. The 12×12
checkerboard is a visual reference only.

## Source layout

- `src/shared/iso.ts` — dependency-free camera constants + ground-plane
  projection/picking (single source of truth, shared with the bake tool)
- `src/shared/workspace.ts` — workspace folder binding (File System Access
  connection lifecycle, IndexedDB handle persistence, convention folders,
  list/read/write helpers, `.sprite` constant), shared with the bake tool
- `src/shared/workspace-ui.ts` — workspace header control + picker
  `<select>` filling, shared by both pages
- `src/runtime/assets.ts` — bake-at-boot sprite set (merged g-buffer +
  path-traced render via a procedural environment) and bundle loading
- `src/runtime/renderer.ts` — WebGL2 batches, per-pixel occlusion + shading
- `src/runtime/world.ts` — placement state, depth sort, footprint erase
- `src/runtime/main.ts` — async boot, camera-to-canvas mapping, input,
  toolbar, light panel wiring, workspace sprite/world pickers and world
  save/load
