# Runtime renderer

`index.html` hosts the first runtime milestone: baked primitives placed on
an isometric grid. Camera and bake conventions are defined in
`docs/bake-pipeline.md`; this doc covers only how the runtime consumes them.

## Assets

There is no asset file pipeline yet. At page load the runtime calls
`bakePrimitive(prim, RUNTIME_PPU)` (64 px/unit) for every test primitive and
uploads the **albedo + coverage** and the **linear ray depth** into two
WebGL2 `TEXTURE_2D_ARRAY`s (RGBA8 and R32F, one layer per primitive). The
normal pass is not consumed yet — dynamic lighting is the next milestone.

## Renderer

Raw WebGL2, no scene graph, no matrices. Because the camera is fixed and
orthographic, all projection happens once on the CPU
(`src/shared/iso.ts` — same constants as the bake); the GPU side is a pure
2D compositor with three draw batches per frame:

1. **Ground** — the grid's cell top faces (y=0) as a static vertex-color
   triangle batch, CPU-projected at startup. No depth interaction.
2. **Sprites** — one instanced quad per placed object, painter-sorted by
   `dot(cubeCenter, viewDir)` (far → near) for blend correctness,
   alpha-blended using the baked coverage alpha, with **per-pixel
   occlusion**: each fragment samples the baked depth texture, adds the
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
- `src/runtime/assets.ts` — bake-at-boot sprite set
- `src/runtime/renderer.ts` — WebGL2 batches
- `src/runtime/world.ts` — placement state, depth sort, footprint erase
- `src/runtime/main.ts` — camera-to-canvas mapping, input, toolbar
