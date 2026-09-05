# Integrated editor

`index.html` hosts the integrated editor — a single React application
(`src/app/`) hosting the sprite (bake) editor and the world editor behind a
shared shell. Camera and bake conventions are defined in
`docs/bake-pipeline.md`; this doc covers the shell, the document model, and
how the world editor consumes baked sprites. Rendering details (compositor
batches, occlusion, lighting math) still apply and are described below.

## Shell layout

Five regions: the **top bar** (app name, build version, workspace
connect/reconnect/disconnect control), the **tab bar**, the **project
browser** on the left, the context-sensitive **properties panel** on the
right, the **editor area** in the center, and the **status bar** at the
bottom. All status messages (workspace ops, bake progress, saves, errors)
land in the status bar.

## Tabs and documents

Opening a resource — workspace model, `.sprite` bundle, or world JSON —
opens (or focuses) a tab. Each tab holds an **in-memory document**,
independent of any render context:

- a **sprite document** carries its source (primitive or model + scale),
  path-trace settings, environment, and the baked passes per view slot
  (N in `result`/`render`, E/S/W in `extraViews`; `BakeResult` float
  arrays, `PtImage` bytes) plus in-memory editor state (active slot, view,
  zoom/pan, box overlay);
- a **world document** carries its sprite layers, placements (`World`),
  and light/sun state.

Documents are render-agnostic data, so switching tabs never loses unsaved
work: activating a tab re-creates its editor view from the stored document
(pass canvases redraw from buffers — no re-bake; the world compositor
re-uploads the layer set). One live editor context exists per editor kind;
closing a tab disposes its engine objects (glTF source, path tracer). A
dirty dot marks unsaved documents; closing a dirty tab asks for
confirmation. Documents become clean only on save. The state-layer split
(persisted / in-memory / engine objects) is
`docs/decisions/0006-three-layer-state-model.md`.

The React layer owns chrome only: editor components mount engines through
refs, state lives in Zustand stores (`src/app/store/`), and the long-running
path-traced passes are store actions guarded by generation tokens.

## Project browser

Lists the workspace's convention folders when connected — `sprites/`
(bundles), `models/` (glTF files), and `worlds/` (JSON) —
extension-filtered, with a refresh action. Activate an entry to open it;
buttons offer "Import glTF file…" (dialog; drag-drop is not wired) and "New
world". The browser does not list built-in primitives — primitives enter the
pipeline only as world-editor brushes. Without a workspace the import dialog
still starts sprite documents.

## Sprite editing

The sprite viewport shows one of four views at a time (toolbar order):
**Realtime 3D**, **Normals** (g-buffer rgb), **Depth** (g-buffer alpha) and
**Render**. All views share per-view zoom/pan state (`src/app/bakeView.ts`).
A view-slot switcher (N/E/S/W, top-left overlay) selects which slot's
passes the 2D views display and which slot bake actions target; baked
slots fill, the active slot is outlined, and unbaked non-N slots are
disabled when the document is view-only.

- **Realtime 3D** (`src/app/realtime.ts`) is a classic three.js lit mesh
  preview of the document's source — geometry inspection, not a shading of
  any baked pass. Its lighting is fixed (not look-matching), the camera
  reuses the bake's fixed isometric frame, and it applies the active
  slot's model yaw so the preview shows the asset exactly as that slot
  bakes.
- **Box overlay** (per-document toggle in the view-controls row): the
  baked asset box from the world origin with origin-adjacent edges colored
  per axis (X red, Y green, Z blue) and an origin marker — drawn as a
  hairline overlay in the 2D views (`projectBoxFrame`, `src/bake/iso.ts`)
  and as scene-space `LineSegments` in the realtime view.
- **Human reference** (per-document toggle in the view-controls row,
  Realtime 3D only): the bundled base mesh (`free_base_mesh.glb`,
  `src/app/assets/`), normalized at load to exactly 1.8 m with feet on
  the ground plane, standing beside the asset — fixed in the bake camera
  frame, so it does not rotate with the model across view slots
  (`src/app/realtime.ts`). Its default spot is just outside the
  yaw-rotated box's camera-facing corner; it can be dragged anywhere on
  the ground plane (a left press on the figure drags it, a press
  elsewhere pans the view), and the dragged spot is kept per document in
  memory. A scale aid only: never baked into any pass, never serialized.
- The properties panel offers, top to bottom: preset management (save /
  list / delete / import), the source (model scale), the path-trace
  settings, and environment controls (HDRI file or workspace `hdri/`,
  rotation/intensity/exposure/saturation). Model scale can be entered as a
  **height in meters** — derived from the model's native extent (`scale =
  height / extentY`); the scale stays the canonical stored value and
  provenance keeps recording it, so the meters value itself is never
  persisted. The panel shows a px-size warning when the active slot's
  projected sprite would exceed the 8192 px cap before baking.
- The panel has no bake or render buttons: the sprite editor toolbar holds
  the render pass action (plus **Bake All** over N→E→S→W and **Remove
  view** for non-N slots), which implicitly re-bakes the raster g-buffer
  from the current source and settings before accumulating, so both passes
  stay current and pixel-aligned. Opening a model auto-bakes the raster
  pass; the render pass runs from the toolbar.
- A picked preset applies immediately — a failed application (missing
  HDRI, unknown format) reports a named error and reverts the dropdown.

### Provenance (isoinfinity-bake/6)

Saved bundles carry a `provenance` manifest section: the source (primitive
name, or workspace model file + scale), the path-trace settings, and the
environment (procedural marker or `hdri/` file name + parameters).
Provenance is view-independent — all baked slots of a document share it.
Opening a `/6` bundle restores it into the document together with the
stored non-N views (`/4` and `/5` open as N-only); the document can then
be edited and re-baked in place, per slot, and saving writes updated
provenance. Bundles without provenance (`/4`), or whose model/HDRI
references no longer resolve, open **view-only** (passes visible,
save/export available) with the reason in the editor and status bar.

### Place in world

A sprite document with baked passes (including a render pass) can be
placed into a world document — the **N view's** passes convert to a
`SpriteLayer` in memory (row-flip + half-float g-buffer, same helpers as
the old boot bake; non-N views are editor-side only until a
placement-orientation change lands, see `docs/roadmap.md`), become a
placement tool, and one instance is placed. No bundle is
written; the world document turns dirty. With no world tab open, a new
world document is created. Saving the world records the sprite's asset id;
reloading resolves it against `sprites/<id>.sprite` (missing bundles are
skipped and named).

## World editor

The compositor is unchanged: see Display, Lighting, Renderer and Input
below. Available placement tools are the document's sprite layers; new
world documents start with an empty grid. World save/load works against
the workspace `worlds/` folder as described in Worlds.

The world viewport is one zoomable panel: it shows the fixed projected
world image (the bake's isometric projection, CPU-computed once) through
a 2D view transform — two-finger scroll (or a mouse wheel) pans, pinch
(ctrl+wheel) zooms around the cursor, middle-drag pans (left paints,
right erases), and corner `− / % / + / Fit` controls
mirror the sprite viewport (shared `ViewTransform`/zoom constants in
`src/app/bakeView.ts`). On touch screens, a three-finger drag pans by
its centroid (one finger keeps tap-to-place/drag-paint, two fingers are
a neutral pre-gesture; trackpad three-finger gestures are OS-consumed
and unreachable). Picking inverts the same transform, so
placements land at the same ground position at every zoom level. The
transform defaults to fit (whole grid letterboxed) and is per-document
in-memory editor state — it survives tab switches and is never written
into world JSON.

With a brush (pencil) active and its layer loaded, the viewport renders
that brush's sprite as a ghost at the exact position the next click
would place (cursor-centered, like `placeAt`). The ghost is an ordinary
depth-tested sprite instance slotted into the painter-sorted batch, so
per-pixel occlusion shows exactly how the placement would sit among its
neighbors; it is preview-only (never placed, never marks the document
dirty) and yields the hover feedback to the eraser's unit-cell
highlight.

## Assets

The world editor uploads two WebGL2 `TEXTURE_2D_ARRAY`s: the render pass
(RGBA8, LINEAR) and the g-buffer (RGBA16F, NEAREST — `rgb = world-space
normal`, `a = linear ray depth`). Assets may be arbitrary cuboids, so
sprites differ in pixel size: every layer is padded into a shared max-size
rect (sprite data anchored bottom-left, zero padding elsewhere), and each
sprite's pixel size + origin travel with the layer — quad size, UV window
and origin offset are per-instance/per-layer data. UVs are computed from
texel centers (`mix(0.5, size - 0.5, corner) / maxSize`) so LINEAR-filtered
render texels never bleed across the padding boundary.

### Workspace folder

The editor shares the workspace convention (see `docs/bake-pipeline.md`;
module: `src/shared/workspace.ts`): after "Open workspace…" (or one-click
"Reconnect workspace…" on a later visit) the convention folders are
surfaced through the project browser and the properties panel, and saves
write in place. In browsers without the File System Access API the
workspace control explains its absence and dialogs/downloads keep working.

### Worlds

**Save world** writes `worlds/<name>.json` (name defaults to the first
free `world-<n>`): the format marker `isoinfinity-world/2`, every placement
(asset id + continuous ground position + height, always written) and the
full light state — manual azimuth/elevation, intensity, key and ambient
colors, dynamic-light switch, plus the sun-position values. Saving an
existing name overwrites it. Loading a world validates the file completely
first (format marker `isoinfinity-world/2` or the older `/1`, placements
with optional finite height, light/sun fields) so a corrupt file fails with
a named error and opens nothing; `/1` placements and `/2` placements
without a height restore at ground level. A valid file then restores the
sun values, recomputes the sun, re-applies the saved manual angles (so
hand-tweaked directions round-trip), loads every referenced sprite bundle
from `sprites/`, and places the sprites whose asset ids loaded — placements
referencing missing bundles are skipped and named in the status line.

### Loading sprite bundles

Opening a `.sprite` (or legacy `.zip`) goes through exactly one parser:
`parseBake()` unpacks manifest + passes (formats `isoinfinity-bake/4`,
`/5` and `/6` accepted; anything else is rejected by name; `/6`'s extra
views decode into the document's slot set), the render PNG decodes
via `createImageBitmap` and the EXR via `EXRLoader.parse`. Placing into a
world **requires** the render pass. Row order differs per decoder and both
must end top-down (row 0 = sprite top) for upload: the PNG decodes top-down
and is padded **as-is**, while `EXRLoader` writes rows bottom-up in GL
texture order — so the EXR gets the **same flip as a live bake**. Getting
this wrong mirrors the object vertically; the two decoders are
deliberately asymmetric. Per-layer `pxPerUnit` from the manifest drives the
instance scale, so bundles baked at any resolution land at the correct
world size.

Row-order warning: GL pixel readback is bottom-up and all texture arrays
are sampled with the same UV, so **every** uploaded pass must be flipped to
top-down (`ptImageToLayerBytes` and `bakeFloatToHalf` both flip).
A pass uploaded unflipped pairs each pixel's data with its mirrored twin —
this exact bug made baked-depth occlusion look vertically mirrored on the
live site.

## Display

There are no display modes: every placed sprite shows its prerendered lit
image shaded by the dynamic key + ambient lights (multiplicatively, over
the baked g-buffer normal; see Lighting). Blending uses the render pass's
antialiased alpha; fragment discard uses g-buffer emptiness
(`normal == 0`, the hard raster coverage of the bake draw), never the
render pass's soft edges. The **Dynamic light** checkbox pins shading to
identity: sprites show the pure prerendered image and the ground its flat
vertex color.

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
  write through to the manual azimuth/elevation sliders. Computed
  elevation clamps into the elevation slider's range, so nights settle at
  the slider minimum (a grazing light) rather than pointing up from
  underground; azimuth wraps into [0°, 360°). Manual az/el edits keep
  overriding the direction until a sun slider moves again. The sun-disc in
  the procedural environment still aims at the built-in default key
  direction — it does not follow the sliders.
- The ambient term is a **color**: an ambient color picker (sRGB,
  converted to linear per channel — brightness comes from the picked
  color, there is no separate ambient scalar).
- The ground shades with `N = (0,1,0)` so it responds to the same light.

## Renderer

Raw WebGL2, no scene graph, no matrices. Because the camera is fixed and
orthographic, all projection happens once on the CPU
(`src/shared/iso.ts` — same constants as the bake); the GPU side is a
pure 2D compositor with four draw batches per frame. A single `uView`
scale+offset uniform (backing-store pixels) applies the editor
viewport's zoom/pan to every batch at draw time — the world data itself
stays in world-image pixels. The flat batches (ground, shadows, overlay)
carry per-vertex RGBA (`[x, y, r, g, b, a]`, 6 floats per vertex):

1. **Ground** — the grid's cell top faces (y=0) as a static vertex-color
   triangle batch, CPU-projected at startup. No depth interaction (it
   writes no depth, so sprites always composite over it).
2. **Contact shadows** — for every placement (and ghost) standing above
   the ground: a soft black ellipse on the ground at the placement's
   ground cell, CPU-projected ground-plane circle, larger and fainter as
   the height grows. Blended, no depth interaction — all sprites
   composite over it. Editor chrome only.
3. **Sprites** — one instanced quad per placed object (per-instance quad
   size + sprite texel size, 8 floats per instance), painter-sorted by
   the 3D depth key `dot(cell-center, viewDir)` (far → near) for blend
   correctness, alpha-blended using the render pass's (antialiased)
   alpha, with **per-pixel occlusion**: each fragment samples the baked
   g-buffer once (normals in rgb for shading and emptiness-based
   coverage, depth in alpha), adds the per-object constant
   `dot(origin + height, viewDir)` — the placement's full `(x, y, z)`
   offset, height included — and writes `gl_FragDepth`
   (`windowZ = 0.5 - d / 128`, see `DEPTH_LINEAR_RANGE` in the
   renderer); a LEQUAL depth buffer then resolves interpenetrations
   pixel-accurately, regardless of draw order — stacking and sinking
   included, at any height. The linear map keeps the whole reachable
   placement range inside [0,1] with ample 24-bit precision.
4. **Overlay** — hovered footprint (eraser) and the height gizmo
   (landing diamond at a raised ghost + plumb line down to the ground
   cell), as a per-frame vertex batch. No depth interaction. Editor
   chrome only.

## Input

Placements are **free-form** (continuous x/z on the ground plane,
cursor-centered) — not grid-snapped — so overlapping objects exercise the
per-pixel occlusion. Placements also carry a **height**: shift+wheel
raises/lowers the brush height in free-form steps (clamped at the ground
plane; some browsers map shift+wheel to the horizontal axis, so both
deltas are read), and the toolbar's **surface snap** toggle overrides it —
the placement then takes its height from the visible surface under the
cursor, computed CPU-side from the world document's in-memory g-buffers
(max composite depth among the covering placements' texels, unprojected
via the orthonormal frame). Height level and snap are per-document
in-memory editor state, never saved. Left-click/drag places the selected
tool, right-click erases the nearest placement whose unit-cube footprint
contains the cursor — resolving to the **topmost** (greatest depth key) —
tool buttons or eraser selects. Ground picking inverts the shared
projection analytically (`screenToGround`) after inverting the viewport's
zoom/pan transform, no hit-testing. The 12×12 checkerboard is a visual
reference only. Viewport navigation: two-finger scroll pans, pinch
(ctrl+wheel) zooms around the cursor, middle-drag pans, shift+scroll sets
the placement height; on touch screens three fingers pan (one finger
paints/taps, two are neutral); the left/right placement bindings never
move.

## Source layout

- `src/shared/iso.ts` — dependency-free camera constants + ground-plane
  projection/picking (single source of truth, shared with the bake)
- `src/shared/workspace.ts` — workspace folder binding (File System Access
  connection lifecycle, IndexedDB handle persistence, convention folders,
  list/read/write helpers, `.sprite` constant)
- `src/runtime/assets.ts` — `SpriteLayer` type, bundle loading (with
  provenance), procedural environment, layer-set padding/normalization
- `src/runtime/renderer.ts` — WebGL2 batches, per-pixel occlusion + shading,
  `dispose()` for tab teardown
- `src/runtime/world.ts` — placement state, depth sort, footprint erase
- `src/app/document.ts` — document/tab types and defaults
- `src/app/store/` — Zustand stores: editor (tabs + documents + status),
  workspace adapter, project listings, bake actions, world actions
- `src/app/bakeView.ts` — viewport view modes/availability, per-slot pass
  resolution, shared zoom/pan constants
- `src/app/realtime.ts` — realtime 3D mesh preview (three.js over the
  bake's fixed iso frame, box overlay)
- `src/app/bundleView.ts` — bundle → in-memory pass buffers (decoder
  conventions above)
- `src/app/components/` — shell, tab bar, project browser, properties
  panels, sprite/world editors
