# Runtime renderer

`index.html` hosts the first runtime milestone: baked primitives placed on
an isometric grid. Camera and bake conventions are defined in
`docs/bake-pipeline.md`; this doc covers only how the runtime consumes them.

## Assets

There is no asset file pipeline yet. At page load the runtime calls
`bakePrimitive(prim, RUNTIME_PPU)` (64 px/unit) for every test primitive and
uploads the **albedo + coverage** result into a WebGL2 `TEXTURE_2D_ARRAY`
(one layer per primitive). Depth/normal passes are not consumed yet —
lighting and occlusion are future milestones.

## Renderer

Raw WebGL2, no scene graph, no matrices. Because the camera is fixed and
orthographic, all projection happens once on the CPU
(`src/shared/iso.ts` — same constants as the bake); the GPU side is a pure
2D compositor with three draw batches per frame:

1. **Ground** — the grid's cell top faces (y=0) as a static vertex-color
   triangle batch, CPU-projected at startup.
2. **Sprites** — one instanced quad per placed object, painter-sorted by
   `dot(cubeCenter, viewDir)` (far → near), alpha-blended using the baked
   coverage alpha. Blit anchor: `toPx(cubeMinCorner) - originPx`, both sides
   from the shared projection math.
3. **Highlight** — hovered cell overlay quad.

No depth test: sprite-vs-sprite occlusion (per-pixel, using the baked
depth) is a later milestone; painter order is correct for ground-plane
placements.

## Input

Placements are **free-form** (continuous x/z on the ground plane,
cursor-centered) — not grid-snapped — so overlapping objects can exercise
per-pixel intersection tests later. Left-click/drag places the selected
tool, right-click erases the nearest placement whose unit-cube footprint
contains the cursor, toolbar or eraser tool selects. Ground picking
inverts the shared projection analytically (`screenToGround`), no
hit-testing. The 12×12 checkerboard is a visual reference only.

## Source layout

- `src/shared/iso.ts` — dependency-free camera constants + ground-plane
  projection/picking (single source of truth, shared with the bake tool)
- `src/runtime/assets.ts` — bake-at-boot sprite set
- `src/runtime/renderer.ts` — WebGL2 batches
- `src/runtime/world.ts` — placement state, depth sort, footprint erase
- `src/runtime/main.ts` — camera-to-canvas mapping, input, toolbar
