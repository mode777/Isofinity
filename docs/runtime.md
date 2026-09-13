# Integrated editor

`index.html` hosts the integrated editor — a single React application
(`src/app/`) hosting the sprite (bake) editor and the world editor behind a
shared shell. Camera and bake conventions are defined in
`docs/bake-pipeline.md`; this doc covers the shell, the document model, and
how the world editor consumes baked sprites. Rendering details (compositor
batches, occlusion, lighting math) still apply and are described below.

## Shell layout

Six regions: the **top bar** (app name, build version, workspace
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
extension-filtered, with a refresh action. Each section renders as a
collapsible tree: nested subfolders inside a convention folder appear as
expandable nodes and files as leaves at their relative path; activating a
file opens it regardless of its depth. Buttons offer "Import glTF file…"
(dialog; drag-drop is not wired) and "New world". The browser does not
list built-in primitives — primitives enter the pipeline only as
world-editor brushes. Without a workspace the import dialog still starts
sprite documents.

### Workspace file dialog

With a workspace connected, the sprite and world **Save As** buttons open a
custom modal (`src/app/components/WorkspaceFileDialog.tsx`) modeled on
native file dialogs: a folder tree on the left, the current folder's files
on the right, a breadcrumb, and a name field in save mode (accept is
disabled while the name is empty). Accepting a save writes to
`<folder>/<subfolders>/<name>`, creating missing subfolders on demand;
double-activating a file in load mode opens it. The last-used folder per
convention folder is remembered in memory only — it is editor chrome and
never serialized (ADR 0006). The plain **Save** button opens the same
dialog only for a document that has no workspace file backing yet; an
already-saved (or opened) document is written back to its backing file in
place, with no dialog. Without a workspace both buttons keep the previous
prompt/download fallbacks unchanged.

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
  list / delete / import), the source (model scale), the **origin** (the
  authored 3D placement anchor, ADR 0008), the path-trace
  settings, and environment controls (HDRI file or workspace `hdri/`,
  rotation/intensity/exposure/saturation). Model scale can be entered as a
  **height in meters** — derived from the model's native extent (`scale =
  height / extentY`); the scale stays the canonical stored value and
  provenance keeps recording it, so the meters value itself is never
  persisted. The panel shows a px-size warning when the active slot's
  projected sprite would exceed the 8192 px cap before baking. The Origin
  section's X/Y/Z inputs (asset units from the box corner) and its
  **Set to ground center** button are editable only in the north view —
  the other slots show the value with a hint — and every baked view's
  `originPx` re-projects immediately on edit (the passes themselves never
  depend on the anchor, so no re-bake is needed). A scale change rescales
  the anchor with the box.
- The panel has no bake or render buttons: the sprite editor toolbar —
  icon buttons like the world editor — holds save and save as, the render
  pass action (plus **Bake All** over N→E→S→W and **Remove view** for
  non-N slots). The render action implicitly
  re-bakes the raster g-buffer from the current source and settings before
  accumulating, so both passes stay current and pixel-aligned. Opening a
  model auto-bakes the raster pass; the render pass runs from the toolbar.
- A picked preset applies immediately — a failed application (missing
  HDRI, unknown format) reports a named error and reverts the dropdown.

### Provenance (isoinfinity-bake/6)

Saved bundles carry a `provenance` manifest section: the source (primitive
name, or workspace model file + scale), the path-trace settings, the
environment (procedural marker or `hdri/` file name + parameters), and —
when authored away from the box corner — the sprite's origin anchor.
Provenance is view-independent — all baked slots of a document share it.
Opening a `/6` bundle restores it into the document together with the
stored non-N views (`/4` and `/5` open as N-only); the document can then
be edited and re-baked in place, per slot, and saving writes updated
provenance. Bundles without provenance (`/4`), or whose model/HDRI
references no longer resolve, open **view-only** (passes visible,
save/export available) with the reason in the editor and status bar.

## World editor

The compositor is unchanged: see Display, Lighting, Renderer and Input
below. Available placement tools are the document's sprite layers. New
worlds are created only explicitly: the project browser's **New world**
action opens a small dialog for the ground plane's width × depth (whole
world units, 1–128 per axis, defaults 12 × 12; blank/non-numeric input
falls back to the default, out-of-range clamps), and accepting creates
the world with a ground of exactly that size. Existing worlds resize from
the properties panel's Ground section (same range and input conventions):
the resize keeps the ground's (0, 0) origin corner — the plane grows and
shrinks toward +x/+z — never removes or moves a placement (things outside
the new bounds stay in the scene and can be dragged back), refits the
view, marks the document dirty, and is not undoable (like the other
ground-state edits). The ground size is persisted world state, not chrome.
World save/load works against
the workspace `worlds/` folder as described in Worlds.

The world editor is full-bleed: like the sprite editor it fills the
center region without the generic document padding, with only a thin
inset around the toolbar, viewport, and hint line. The toolbar row keeps
Save, save as, undo, and redo as icon buttons, a divider, then the active
tool's contextual controls — the brush dropdown and the surface-snap
toggle (an icon button whose highlighted state shows snap is on), shown
only while a placement (pencil) tool is active; hiding them never
resets the chosen brush or snap state. Tool selection itself lives in a
thin vertical icon bar docked inside the viewport's top-left corner
(Photoshop-style): Select, pencil, point light, and eraser, one icon per
tool with the active tool highlighted. The bar overlays the canvas
without touching the view transform — canvas input outside the bar is
unaffected. All of this is editor chrome; the tool, brush, and snap
state stay per-document in-memory editor state (ADR 0006).

The viewport's top-right corner mirrors the tool bar with a
**layer-visibility control**: an icon button opening a small dropdown of
three check rows — Ground, Sprites, Meshes. Toggling a row hides/shows
that whole layer immediately: hidden placements (and their baked grounding
shadows) stop being drawn, a hidden ground also empties the contact-shadow
stage (no floor remains), and hidden placements stop participating in
picking (Select/eraser pass through them) and surface snap. Point lights
are not a layer and stay visible; ghost previews stay visible (they
preview the next action, not world content). A selection on a hidden layer
is kept but its highlight only draws while the layer is visible. Visibility
is per-document in-memory editor state — never saved, never dirty, never
undoable, all layers visible by default (ADR 0006). Implementation note:
sprites/meshes are gated by simply not emitting them into the frame's
batches, while the ground stage takes a per-frame `groundVisible` flag on
`Renderer.render()` so the ground-apply cache stays untouched.

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
transform defaults to fit (whole ground plane letterboxed) and is per-document
in-memory editor state — it survives tab switches and is never written
into world JSON. The projected world image itself is a memoized pure
function of the ground size (`worldFrame` in `src/app/components/
WorldEditor.tsx`): a resize re-anchors the image and the view refits.

With a brush (pencil) active and its layer loaded, the viewport renders
that brush's sprite as a ghost at the exact position the next click
would place (cursor-centered, like `placeAt`). The ghost is an ordinary
depth-tested sprite instance slotted into the painter-sorted batch, so
per-pixel occlusion shows exactly how the placement would sit among its
neighbors; it is preview-only (never placed, never marks the document
dirty) and yields the hover feedback to the eraser's placement
highlight. Placement is free-form — there are no cells: the asset's
origin anchor lands exactly at the mouse position, meaning the anchor's
world position is `(mouse ground x, brush height, mouse ground z)` —
the cursor acts as a point hovering `brush height` above its ground
track (height 1 = the cursor hovering 1 unit above the ground), and the
sprite is drawn so its `originPx` lands on that point. The height
arithmetic follows: the anchor sits on the ground exactly when the brush
height is 0, and the asset's base rides at (brush height − anchor y), so
an asset anchored above its base (a hook) sinks at height 0 and stands
on the ground when the brush height equals its anchor y. A sprite
authored with a ground-center origin pivots around its center when its
facing changes; placement stays free-form at the cursor's ground
position regardless of the anchor (ADR 0008). Per-pixel
occlusion stays truthful for anchored sprites: the baked g-buffer depth
is measured from the box corner while the image is drawn from the anchor,
so the compositor subtracts `dot(VIEW_DIR, anchor)` from each instance's
depth offset — without it, an anchored sprite composites at its
box-corner depth while drawn at its anchored position (a ground-center
stool perches on geometry it merely stands behind/inside).

The toolbar's **character** brush places the built-in animated character
(Khronos CesiumMan, committed with attribution) as a *mesh placement*:
place/erase/height behave exactly like a sprite brush (the ghost shows
the bind pose at the cursor, a contact shadow follows raised
placements), and erase resolves the placement picked under the cursor
across kinds (same pixel pick as Select).
Characters animate in place, one draw call each; placements are
editor-session state — never written into world files (ADR 0006) — so a
saved/reloaded world simply has none.

A multi-view sprite brush can face any direction it baked: the
properties panel's **Brush** section lists the brush's available view
slots (N/E/S/W order; enabled only when the brush is a multi-view sprite)
and pressing `E` cycles through them with wrap. The ghost immediately
shows the chosen view; already-placed sprites keep their direction. Brush
direction is per-document in-memory editor state — never saved. The same
Brush section holds the brush's placement height (a precise field with a
−2…+2 slider) and grounding-shadow strength, and appears only while the brush
tool is active; the toolbar
keeps only the icon save/save-as/undo/redo buttons, the brush dropdown,
and the surface-snap toggle (the dropdown and snap hidden outside
placement mode). The selected-placement section likewise appears only
while the Select tool is active.

### Select tool

The viewport tool bar's **Select** tool inspects and moves existing placements.
Clicking selects the placement under the cursor — a sprite, a character,
or a point light — clicking empty space or pressing Escape clears the
selection, and one placement is selected at a time. Sprite selection is
**pixel-accurate**: the picker reads the placement's baked g-buffer
silhouette at the cursor pixel from the document's in-memory sprite set
(`src/runtime/selection.ts`, the same padded-stride texel indexing
`surfaceSnap.ts` uses) and resolves overlaps by the per-fragment depth
the compositor uses (ADR 0012), so a sprite's transparent margin is not
selectable and the visually topmost sprite wins. Characters and point
lights are picked by screen-space proximity to their projected anchor.
A selected sprite is outlined by a bounding box around its drawn extent
(the projected quad of its baked view at its position, height, and
facing); a selected character or light keeps the height gizmo or radius
ring. The properties panel shows the selection's editable properties —
position, height, grounding shadow, and (for a multi-view sprite) its
facing — each height row pairing its precise field with a −2…+2 slider
relative to the height at drag start (the selected light's height
included) — and the `E` key rotates a
selected sprite through its available
directions with wrap (falling back to the active brush's direction when
no sprite is selected). A selected sprite's section also offers **Delete**
next to Deselect: the same undoable erase the eraser performs, without
switching tools. Dragging a selected placement moves it free-form
along the ground plane (a sprite or character keeps its height; a light's
emitter follows the cursor); the drag is one undoable command. Selection
is per-document in-memory editor state (ADR 0006) — never serialized —
and clears automatically when its target is erased or removed by
undo/redo.

### Undo/redo

Every mutating world operation records a command pair on the document's
undo stack (`src/runtime/history.ts`): placing/erasing sprites, meshes and
point lights, point-light edits and deletions, selected-placement property
edits, and each select-tool move drag. Undo (Ctrl/Cmd+Z) and redo
(Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y) run via the toolbar buttons or the
keyboard, both disabled at their stack ends, and mark the document dirty —
after taking an edit back, the in-memory scene differs from the last save.
Commands are inverse deltas, not snapshots: removals re-insert the exact
placement object (mesh/light ids are stable keys held by the engine's
animation players), so undo/redo never renumbers ids. History lives on the
world document — per document, surviving tab switches — and is in-memory
editor state only (ADR 0006): it never reaches a world file, and viewport/
brush state stays un-undoable.

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
free `world-<n>`; saving an existing name overwrites it) as
`isoinfinity-world/8`: every placement (asset id + continuous ground
position + height, always written; facing direction and grounding-shadow
strength, each only when not the default — north and full strength), every
point light (emitter position, optional height, radius, energy, color —
the `/6` additive fields), the full light state (manual azimuth/elevation,
intensity, key and ambient colors, dynamic-light switch, sun-position
values), and the additive optional ground state — up to four material slot
bindings + tile scale and a user-selected world HDRI (`/4`), the ground
plane's `width`/`depth` (`/7`), and the painted-coverage descriptor
(`/8`, the sidecar PNG written first beside the JSON), all omitted at
their defaults; the shadow strength rides the same optional-field pattern,
set per placement from the toolbar's shadow field before placing.

Loading validates the file completely first — a corrupt file fails with a
named error and opens nothing. While it loads, the status bar shows a
determinate progress bar over the unique sprite assets referenced (north
views decode during this phase) plus each referenced non-north direction
resolved afterwards; the world is rendered as soon as the assets are in, so
the direction phase runs with the viewport already visible. Formats `/8`
back to `/1` are accepted;
missing fields restore defaults (placements at ground level, facing
north, full shadow strength; `/5`-and-older files carry no lights, `/6`-and-older
grounds at 12 × 12, `/7`-and-older ground materials load as slot 0); a
malformed light entry, a non-finite ground size, a malformed material-slot
array, or a malformed coverage descriptor rejects the file. A valid file
then restores the sun values (re-applying
the saved manual angles, so hand-tweaked directions round-trip), loads
every referenced sprite bundle's north view from `sprites/` and registers
its extra view slots as lazy directions (each extra slot decodes and
depth-validates the first time that direction is used; a view without a
render pass or with stale depth is then skipped with a note and falls back
to north; a placement whose saved direction is still decoding draws north
until it lands; placements referencing missing bundles are skipped and
named in the status line), and resolves the ground
material slots against `materials/` (missing or unparseable = skipped with
a notice while the rest of the scene loads), and restores painted coverage
from its PNG beside the JSON (missing/unreadable = fall back to slot 0
over everything with a notice).

### Loading sprite bundles

Opening a `.sprite` (or legacy `.zip`) goes through one parser family
(`src/bake/bundle.ts`): `parseBake()` unpacks manifest + every pass in one
shot (used by the sprite editor), while the world runtime uses
`parseBakeManifest()` to read only `manifest.json` plus the per-view pass
file names, then `readBakeEntry()` to inflate exactly the passes of a view
it is about to decode (formats `isoinfinity-bake/4`,
`/5` and `/6` accepted; anything else is rejected by name; `/6`'s extra
views are listed but not decoded until requested), the render PNG decodes
via `createImageBitmap` and the EXR via `EXRLoader.parse`. Decoded views
are cached per source file for the session (invalidated when the file's
size or last-modified changes), so re-opening a world or re-picking a
brush does not re-read or re-decode it. Placing into a
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
image shaded by the dynamic lights through the unified deferred pass (see
Lighting). Blending uses the render pass's
antialiased alpha; fragment discard uses g-buffer emptiness
(`normal == 0`, the hard raster coverage of the bake draw), never the
render pass's soft edges — with one addition: g-buffer-empty render pixels
carrying the baked **grounding shadow** (blue-dominant near-black tint,
`r < b`) composite as the shadow, while empty pixels of any other color
(the object's AA fringe) keep the historical discard, so sprites without
the feature are pixel-unchanged. The shadow blends into the albedo·AO
surface and maps to the ground plane in the screen-space g-buffer (up
normal, ground-plane depth — the deferred pass lights it as floor); it
stays visible with the **Dynamic light** switch off (it is part of the
prerendered image) and is suppressed for placements off the
ground plane, where the contact-shadow ellipses still apply. Shadow
fragments write their true ground-plane depth, not the object's and not
none — the z-buffer resolves every shadow/sprite interleaving
pixel-accurately (`docs/decisions/0010`). The **Dynamic light**
checkbox pins the factor to identity: sprites show the pure prerendered
image and the ground its flat vertex color.

## Lighting (unified deferred)

The compositor is **two-phase** (ADR 0011): a geometry pass draws ground,
meshes and sprites into an offscreen framebuffer — a screen-space g-buffer
(RT1, RGBA16F: world normal + linear reference-plane depth, the same
channel layout as the per-sprite bake g-buffer), a display-referred
albedo·AO surface (RT0, RGBA8), and a linear-depth texture (RT2, RGBA16F, depth in r — RGBA16F, not R16F, so it also renders under EXT_color_buffer_half_float) —
and one fullscreen **deferred light pass** applies every dynamic light
over the composite:

- `color = linearToSrgb(srgbToLinear(RT0) * (ambient + key * max(dot(N, L), 0) * shadow + point lights))`
  — the multiplicative factor (ADR 0003) is applied **exactly once, in the
  light pass, for every surface kind**. For sprites this reproduces the old
  forward per-fragment formula bit-for-bit (a sprite's RT0 texel *is* its
  baked render texel; ADR 0003's "treat baked light as AO" formalized);
  meshes and the ground bake their environment ambient (SH irradiance) into
  their RT0 texel at write time and receive the same factor.
- **Directional shadow** (ADR 0015): the `key` term is scaled by a per-pixel
  visibility from a ray marched through a world-space occluder reconstructed
  from the placed sprites' baked g-buffers (`src/runtime/shadowField.ts`).
  Characters splat their live skinned vertices into the same field, so sprite
  and character shadows compound as one region. The key-light direction is
  confined to a **shadow-valid domain** (`src/shared/lightDomain.ts`: within
  65° of the camera view ray and at least 10° elevation) because the
  camera-facing relief is the occluder. The editor's azimuth/elevation
  sliders are bounded to a window inscribed in that cone (azimuth 45°±60°,
  elevation 15°–85°) so a drag never snaps back, and typed or sun-computed
  values clamp into the same window. It is automatic — no asset or
  world setup — and is inert when the occluder is empty or the Dynamic light
  switch is off. `npm run verify:shadows` covers the domain clamp, the
  occluder build and the CPU march.
- Shadowing needs **no setup**: it derives from whatever bundles a world
  already references, chooses its resolution from the ground size, and
  rebuilds on load and placement edits. The only authoring knobs that affect
  its fidelity are optional and already exist: material **alpha mode** (MASK
  keeps foliage outlines; BLEND bakes opaque and shadows as a block), the
  origin anchor and model scale, which baked **view slots** exist, and the
  bake environment. Occluder detail follows the fixed bake resolution
  (`PX_PER_UNIT = 128`); no per-asset shadow setting exists.
- **World position** is reconstructed per pixel from the g-buffer depth
  (ADR 0001) — `worldPos = sx·screenRight + sy·screenUp + depth·viewDir`,
  the fixed-camera orthonormal frame — so point lights can evaluate
  distance/attenuation anywhere on the composite.
- `L` is a world-space direction toward the key light, parametrized by
  azimuth/elevation sliders; key color (color picker) and intensity are
  uploaded as uniforms every frame — all realtime-tweakable in the
  "Key light" panel. The **Dynamic light** checkbox pins the factor to
  identity (key zero, ambient one, point lights dropped): the composite
  shows the pure prerendered image.
- **Point lights** are placements (light tool): position (emitter at the
  placed cell center + height), radius (world units), energy, and color
  (sRGB picker → linear). Evaluated in the light pass with a quadratic
  window attenuation to exactly zero at the radius and the same
  `max(dot(N, L), 0)` gating. At most **16** lights render concurrently
  (`MAX_POINT_LIGHTS`, a std140 UBO); placements beyond the cap are legal
  state that renders dark.
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
  color, there is no separate ambient scalar), evaluated in the light pass
  for every surface kind.
- **Dynamic meshes** write their env-lit tonemapped texel
  (`sRGB(ACES(albedo × E_env(N)))` — an SH diffuse-irradiance probe
  (`E_env`) projected from the sprites' bake environment, taken from bundle
  provenance, else the built-in default) into RT0 and their live skinned
  normals into RT1; the light pass applies the same factor the sprites
  receive — a character and a sprite of equal material/light now respond
  identically to every dynamic light. Same double-shading trade (ADR 0003),
  same identity behavior under the **Dynamic light** switch.

## Dynamic meshes

Skinned, animated characters (ADR 0007): three.js is used as CPU-side
libraries only — GLTFLoader parses the committed CesiumMan asset,
AnimationMixer samples the clip, and the pose engine
(`src/runtime/meshAsset.ts`) writes a per-character joint palette
(`bone.matrixWorld · boneInverse`, ≤ 64 joints) each frame. The raw-GL
mesh batch (`src/runtime/renderer.ts`) skins in the vertex shader against
that palette (GPU mode, the default) or draws CPU-skinned vertices
(`setSkinningMode('cpu')` — same draw call, same result; the bring-up
fallback, see the change's design.md D2); shading per the Lighting
section. Geometry is bind-transformed at load and re-anchored by a
per-asset world offset (first rendered pose's feet at y = 0, centered
over x/z, applied by the draw origin). Ambient probe:
`src/runtime/shProbe.ts`. Bring-up rule learned the hard way: **never
leave a declared shader varying unwritten**, and keep mesh attribute
buffers plain and separate — an undefined `vUv` varying plus an
interleaved dynamic VBO once shredded every mesh (even unskinned ones)
on one driver while all diagnostics showed the data exact.

## Ground plane

The world spans a flat ground plane (`y = 0`, world extent = the ground
plane's width × depth, chosen at creation and resizable in the panel).
Without any bound material it is the flat checkerboard batch (below); with
one to four **material slots** bound it becomes a real world-space quad
drawn by its own program, blending the slots per pixel. Each slot samples a
layer of four `TEXTURE_2D_ARRAY`s (diffuse/normal/arm/displacement, four
layers each) plus the RGBA **coverage splat** — five texture units, so the
ground never exceeds WebGL2's guaranteed fragment sampler budget. Shading
is lean PBR: linearized diffuse albedo, tangent-space normal-map
perturbation (gl convention, analytic plane tangents), arm-map red channel
as ambient occlusion, composited by the coverage weights; the SH ambient
probe, ACES fit and display saturation bake into the albedo·AO texel, and
the deferred light pass applies the same dynamic factor the meshes and
sprites receive. Roughness/metal are decoded but not applied yet; specular
and reflections are later work.

The coverage splat stores the four material weights: rgb are slots 0–2 and
alpha is slot 3 (derived as `1 - r - g - b`, so the weights sum to 1). The
**terrain paint tool** (viewport tool bar) paints them with a
cursor-anchored brush — adjustable radius (world units), hardness (soft to
hard edge), and per-stroke opacity, plus an **Accumulate** toggle (off:
opacity caps a single stroke; on: repeated dabs build up) — as a
normalized replace (painting a material over another replaces it), one
undoable command per stroke. Where coverages meet, each
material's optional `disp`/`displace`/`displacement` map is used as a
per-pixel surface height and the higher material wins the seam (no geometry
moves). Coverage is persisted as a PNG beside the world JSON in `worlds/`
(the engine keeps a CPU mirror as the source of truth for painting, undo,
save and resize) and restored on load; the plane writes the shared linear
depth (`gl_FragDepth`, same mapping as meshes), so sprites occlude against
it per pixel. It is backdrop only — never pickable or erasable. Tiling is
one shared world-unit scale (tiles per world unit, REPEAT wrap), adjustable
in the properties panel. Ground materials are zip files with a `.material`
extension in the workspace's `materials/` folder; maps are identified by
`<name>_(diff|diffuse|arm|nor_gl|disp|displace|displacement)_*.(exr|png|jpg)`
(diffuse required — `diffuse` is an alias for `diff`, which takes
precedence; the rest degrade with a notice; module
`src/app/groundMaterial.ts`). All maps of all bound slots are normalized to
one size and RGBA8 so they fit the texture arrays (EXR diffuse is
converted, an accepted loss). The world environment
(pickers in the properties panel: workspace `hdri/` or a raw `.hdr`/
`.exr` file) sets the ambient probe for meshes and ground; note the
one-way relationship: baked sprite texels keep the environment they were
baked with — a user-selected HDRI changes the dynamic ambient only
(re-baking a sprite re-captures its provenance environment).

## Renderer

Raw WebGL2, no scene graph, no matrices. Because the camera is fixed and
orthographic, all projection happens once on the CPU
(`src/shared/iso.ts` — same constants as the bake); the GPU side is a pure
2D compositor with a geometry pass (three MRT targets), a deferred light
pass, and an overlay batch (dynamic meshes are ADR 0007; the invariants
refine to "no camera matrices — object transforms are per-instance
data"). A single `uView` scale+offset uniform (backing-store pixels)
applies the editor viewport's zoom/pan to every batch at draw time — the
world data itself stays in world-image pixels. The flat batches (ground,
shadows, overlay) carry per-vertex RGBA (`[x, y, r, g, b, a]`, 6 floats
per vertex). The offscreen geometry framebuffer (recreated on resize)
holds RT0 (RGBA8 display texel = albedo·AO), RT1 (RGBA16F: world normal +
linear depth — the bake g-buffer layout), and RT2 (RGBA16F: linear depth in r, for
the light pass's position reconstruction); blending is per-attachment
straight alpha (each output's own alpha is its blend weight), with the
light pass sampling all three afterwards:

1. **Ground** — the ground's cell top faces (y=0) as a static vertex-color
   triangle batch, CPU-projected from the per-size world image (rebuilt
   when the ground size changes), written into RT0/RT1/RT2 with
   the up normal and per-vertex ground-plane depth (deferred lighting hits
   the floor). Still no window-depth interaction (it writes no
   `gl_FragDepth`, so sprites always composite over it); with a ground
   material selected, the textured plane (4) draws instead and does write
   window depth.
2. **Contact shadows** — for every placement (and ghost) standing above
   the ground: a soft black ellipse on the ground at the placement's
   ground cell, CPU-projected ground-plane circle, larger and fainter as
   the height grows. Blended into RT0 only (zero-weight g-buffer/depth
   outputs preserve the surface data behind), no window-depth
   interaction — all sprites composite over it. Editor chrome only.
3. **Meshes** (skinned characters) — one draw call per placed character:
   the vertex shader blends four joint influences against a per-character
   joint palette (uploaded per frame by the CPU pose engine) and projects
   the result with the same iso constants and depth map the sprite path
   uses (`gl_FragDepth = 0.5 − dot(worldPos, viewDir)/128`), so mesh and
   sprite texels at the same world point write the same window depth.
   Opaque, depth-writing, blend off — drawn before the sprites, whose
   LEQUAL test then resolves every character/sprite interpenetration
   pixel-accurately. With no character placed the batch is skipped and
   the frame is unchanged.
4. **Ground material plane** (when any slot is bound) — a world-space
   quad that samples the four material texture arrays plus the coverage
   splat, height-blends the slots (displacement seam), and composites
   their diffuse/normal/AO into its RT0 texel (linearized albedo, AO, SH
   ambient through the ACES fit), the blended surface normal into RT1, and
   the shared window depth (`gl_FragDepth`), so sprites occlude against it
   per pixel.
5. **Sprites** — one instanced quad per placed object (per-instance quad
   size + sprite texel size, 8 floats per instance; a ninth float carries
   the placement height for grounding-shadow suppression), painter-sorted by
   the 3D depth key `dot(cell-center, viewDir)` (far → near) for blend
   correctness, alpha-blended using the render pass's (antialiased)
   alpha, with **per-pixel occlusion**: each fragment samples the baked
   g-buffer once (normals in rgb for emptiness-based coverage, depth in
   alpha), adds the per-object constant
   `dot(origin + height, viewDir)` — the placement's full `(x, y, z)`
   offset, height included — and writes `gl_FragDepth`
   (`windowZ = 0.5 - d / 128`, see `DEPTH_LINEAR_RANGE` in the
   renderer); a LEQUAL depth buffer then resolves interpenetrations
   pixel-accurately, regardless of draw order — stacking and sinking
   included, at any height. The linear map keeps the whole reachable
   placement range inside [0,1] with ample 24-bit precision. The same
   fragment routes its data into the MRT targets: baked render texel →
   RT0, baked normal + offset depth → RT1/RT2. Grounding-shadow fragments
   (g-buffer-empty, blue-tinted render pixels) instead write the analytic
   ground-plane depth of their screen position — the GLSL twin of the
   shared `groundFromWorldImagePx`/`groundDepth` helpers, biased a hair
   toward the camera to settle coplanar comparisons against the ground
   plane's own depth — plus the up normal, so the deferred pass lights
   them as floor (`docs/decisions/0010`).
6. **Deferred light pass** — a fullscreen quad over the default
   framebuffer sampling RT0/RT1/RT2 plus the reconstructed occluder
   height field (an `R32F` texture, `texelFetch`): reconstructs world
   position (ADR 0001), marches the key-light shadow ray, and applies the
   ambient picker + key directional (× shadow visibility) + point-light UBO
   once (see Lighting). The **Dynamic light** switch pins the factor to
   identity, which presents RT0·AO unmodified — the pure prerendered
   composite.
7. **Overlay** — eraser hover target, the height gizmo
   (landing diamond at a raised ghost + plumb line down to the ground
   cell), the select-tool highlight for the selected placement, the
   point-light tool's ghost/selection radius rings, the per-light **light
   icons** (constant-size diamonds at each emitter, tinted with the
   light's color — the visible click/drag handle of the light pick), and
   the light icons' hover radius ring, as a per-frame vertex batch drawn
   unlit over the finished frame. No depth interaction. Editor chrome
   only — never serialized (ADR 0006).

## Input

Placements are **free-form** (continuous x/z, cursor-centered) — not
grid-snapped — so overlapping objects exercise the per-pixel occlusion.
The brush anchor always projects exactly onto the cursor: its position is
the cursor's view ray intersected with the horizontal plane at the
effective placement height (the ground plane at height 0), so raising the
height slides the placement along the view ray instead of displacing it
up-screen. Placements also carry a **height**: holding shift
and moving the mouse vertically over the viewport raises/lowers the brush
height in free-form steps (up = raise, negative heights sink below the
ground plane), and the properties panel's Brush height field sets it
exactly (precise-input conventions: Enter/blur commits, negative values
apply verbatim, invalid input reverts, Escape cancels) with a −2…+2 slider
alongside as a pointer shortcut relative to the height at drag start (the
thumb rests centered and recenters on release, so repeated drags compound;
typed values still apply verbatim). The toolbar's
**surface snap** toggle overrides both —
the placement then takes its height from the visible surface under the
cursor, computed CPU-side from the world document's in-memory g-buffers
(max composite depth among the covering placements' texels, unprojected
via the orthonormal frame — `surfaceHeightAt` in
`src/runtime/surfaceSnap.ts`; texel indexing uses the sprite set's
padded stride `maxW`, matching the GPU upload). While snap is on the
height field displays the height snap read under the cursor (an
eyedropper read, transient in-memory state — the stored brush height is
kept and applies again when snap goes off). Height level and snap are
per-document in-memory editor state, never saved. The **`E` key** cycles the brush
through its available directions (N → E → S → W, wrapping, skipping
views the sprite does not provide; no-op for single-view brushes and
while a form control has focus, or rotates the selected sprite with the
Select tool). Left-click/drag places the selected brush. The **eraser**
(and right-click with any other tool), the **Light** tool, the
**Select** tool, and the light icons use the pick and behave as described
in the World editor and Select tool sections above. Ground picking
inverts the shared projection analytically (`screenToGround`) after
inverting the viewport's zoom/pan transform, no hit-testing. The
checkerboard is a visual reference only. Viewport navigation mirrors the
sprite viewport (see World editor above); the left/right placement
bindings never move.

## Source layout

- `src/shared/iso.ts` — dependency-free camera constants + ground-plane
  projection/picking (single source of truth, shared with the bake)
- `src/shared/workspace.ts` — workspace folder binding (File System Access
  connection lifecycle, IndexedDB handle persistence, convention folders,
  list/read/write helpers, `.sprite` constant)
- `src/shared/sun.ts` — NOAA-style sun azimuth/elevation from local solar
  time (dependency-free, shared style with `iso.ts`)
- `src/runtime/assets.ts` — `SpriteLayer` type, bundle loading (with
  provenance), procedural environment, layer-set padding/normalization
- `src/runtime/renderer.ts` — WebGL2 batches, per-pixel occlusion + shading,
  `dispose()` for tab teardown
- `src/runtime/meshAsset.ts` — skinned character assets + CPU pose engine (mixer → joint palettes)
- `src/runtime/shProbe.ts` — environment → SH diffuse-irradiance probe (CPU + GLSL basis twins)
- `src/runtime/surfaceSnap.ts` — CPU surface-height read under the cursor for surface snap
- `src/runtime/world.ts` — placement state, depth sort, id-keyed removal
- `src/runtime/history.ts` — undo/redo command-pair stacks (world-edit history; `npm run verify:history`)
- `src/runtime/selection.ts` — CPU placement picking for the Select tool (g-buffer silhouette + per-fragment depth; `npm run verify:selection`)
- `src/runtime/*-verify.ts` — Node check entry points (`npm run verify:mesh/history/selection`)
- `src/app/document.ts` — document/tab types and defaults
- `src/app/store/` — Zustand stores: editor (tabs + documents + status),
  workspace adapter, project listings, bake actions, world actions
- `src/app/bakeView.ts` — viewport view modes/availability, per-slot pass
  resolution, shared zoom/pan constants
- `src/app/realtime.ts` — realtime 3D mesh preview (three.js over the
  bake's fixed iso frame, box overlay)
- `src/app/bundleView.ts` — bundle → in-memory pass buffers (decoder
  conventions above)
- `src/app/presets.ts` — bake-setting preset format + strict parser
- `src/app/worldFile.ts` — world JSON payload: `isoinfinity-world/8`
  save/parse/validate (pure, Node-checkable)
- `src/app/groundMaterial.ts` — `.material` zip parsing (diff/arm/nor_gl/disp
  slots)
- `src/shared/splat.ts` — pure coverage-splat math (resolution, brush stamp,
  resample, derived alpha)
- `src/shared/png.ts` — raw-channel PNG codec for the coverage sidecar
  (canvas premultiplies, so data textures cannot round-trip through it)
- `src/app/light.ts` — light state → compositor uniforms (sRGB → linear, identity when off)
- `src/app/hdr.ts` — equirect HDRI decode (`.hdr`/`.exr`) for the SH probe
- `src/app/mesh-debug.ts` — the `/mesh-debug.html` staged mesh diagnostic
- `src/app/components/` — shell, tab bar, project browser, properties
  panels, sprite/world editors
