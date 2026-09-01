# Runtime renderer

`index.html` hosts the first runtime milestone: baked primitives placed on
an isometric grid. Camera and bake conventions are defined in
`docs/bake-pipeline.md`; this doc covers only how the runtime consumes them.

## Assets

There is no asset file pipeline yet. At page load the runtime calls
`bakePrimitive(prim, RUNTIME_PPU)` (64 px/unit) for every test primitive and
uploads the two baked passes into WebGL2 `TEXTURE_2D_ARRAY`s: albedo +
coverage (RGBA8, LINEAR) and the merged g-buffer (RGBA16F, NEAREST —
`rgb = world-space normal`, `a = linear ray depth`; NEAREST keeps background
zero-normals and neighboring depths from bleeding across silhouettes).
Assets may be arbitrary cuboids, so sprites differ in pixel size: every
layer is padded into a shared max-size rect (sprite data anchored
bottom-left, zero padding elsewhere), and each sprite's pixel size + origin
travel out of the uniforms — quad size, UV window and origin offset are
per-instance/per-layer data now. UVs are computed from texel centers
(`mix(0.5, size - 0.5, corner) / maxSize`) so LINEAR-filtered albedo never
bleeds across the padding boundary.

Row-order warning: GL pixel readback is bottom-up and all texture arrays
are sampled with the same UV, so **every** uploaded pass must be flipped to
top-down (`albedoToBytes` and `gbufferToHalf` both flip).
A pass uploaded unflipped pairs each pixel's data with its mirrored twin —
this exact bug made baked-depth occlusion look vertically mirrored on the
live site.

## Lighting

POE-style key + ambient over the baked G-buffer, shaded per pixel in the
fragment shader:

- `color = linearToSrgb(srgbToLinear(albedo) * (ambient + key * max(dot(N, L), 0)))`
  — albedo is sRGB-encoded (bake convention), shading happens in linear
  space, the default framebuffer is sRGB.
- `L` is a world-space direction toward the key light, parametrized by
  azimuth/elevation sliders; key color (color picker) and intensity, plus a
  linear ambient scalar, are uploaded as uniforms every frame — all
  realtime-tweakable in the "Key light" panel.
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
   alpha-blended using the baked coverage alpha, with **per-pixel
   occlusion**: each fragment samples the baked g-buffer once (normals in
   rgb for shading, depth in alpha), adds the
   per-object constant `dot(origin, viewDir)` and writes `gl_FragDepth`
   (`windowZ = 0.5 - d / 128`, see `DEPTH_LINEAR_RANGE` in the renderer);
   a LEQUAL depth buffer then resolves interpenetrations pixel-accurately,
   regardless of draw order. The linear map keeps the whole reachable
   placement range inside [0,1] with ample 24-bit precision.
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
- `src/runtime/assets.ts` — bake-at-boot sprite set (albedo + merged
  g-buffer)
- `src/runtime/renderer.ts` — WebGL2 batches, per-pixel occlusion + shading
- `src/runtime/world.ts` — placement state, depth sort, footprint erase
- `src/runtime/main.ts` — camera-to-canvas mapping, input, toolbar, light
  panel wiring
