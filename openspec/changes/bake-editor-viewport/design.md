# Design — bake-editor-viewport

## Context

`SpriteEditor.tsx` renders two `<figure>` canvases (g-buffer with a
normal/depth caption toggle, and the path-traced render) inside the
scrolling `.center` grid area; images render at native size capped by
`max-width: 100%`, so large sprites shrink and small ones sit in a huge
empty column. Pass actions (Re-bake raster, Bake/Re-render pass) already
live in `SpriteProperties.tsx`, so the figcaption render button is
duplicated UI today.

Sources for a realtime 3D view already exist on the document:
`BakeDocument.source` + `gltf` resolve through `primitiveFor()` in
`store/bake.ts` to a `Primitive` carrying three.js `BufferGeometry`
(either `geometry` or `groups[]` with albedo texture/factors). The bake
camera is a fixed orthographic isometric view (`frameIsoBox`,
`ISO_AZIMUTH_DEG`/`ISO_ELEVATION_DEG` in `bake/iso.ts`). Three.js is a
runtime dependency. The environment cannot run a browser; verification is
`tsc --noEmit` + `vite build` plus user browser checks.

## Goals / Non-Goals

**Goals:**

- One viewport per sprite tab that fills the remaining space, with a clean
  component split (viewport shell vs. per-view renderers).
- Realtime 3D view driven by the same `Primitive` the bake uses — one
  geometry source, two renderers (path tracer vs. realtime).
- Zoom/pan model shared by all four views so the corner controls behave
  identically everywhere.
- View state survives tab switches like the rest of the document.

**Non-Goals:**

- No orbit/rotation controls; the project's fixed isometric view stands.
- No light editing for the realtime view (fixed default light).
- No changes to bake output, bundle format (`isoinfinity-bake/5`), or the
  world editor.
- No deferred shading of the render pass in the editor (that remains the
  world compositor's job).

## Decisions

### D1: Viewport state lives on `BakeDocument`, not React state

Add in-memory fields to `BakeDocument`: `view: BakeViewMode | null`
(default `'render'`, falling back to the first available view) and
`viewTransforms: Partial<Record<BakeViewMode, ViewTransform>>` where a
missing entry means fit for that view. Mutators in `store/bake.ts`
(`setBakeView`, `setViewTransform`) keep documents the single source of
truth, matching the existing "documents survive tab switches"
architecture. `SpriteEditor` is keyed by `docId`, so component state would
reset on every tab switch; per-document state does not. Not persisted by
`buildBundle()` — bundles stay unchanged. The transform is stored per view:
the 2D views baseline zoom at image-native pixels (100%) while Realtime 3D
baselines at the framed mesh (100%), so one shared transform moves the
framing on every view switch. Alternative: one shared transform — shipped
first, rejected after browser testing showed exactly that framing jump;
a second alternative, a module-level `Map<docId, state>` — rejected as a
second source of truth next to the store.

### D2: One zoom/pan model, applied per view

`zoom` is image-native scale (1 = 100%), clamped to [0.1, 8]. Fit computes
zoom/pan from the image size vs. viewport size on demand (button) and for
the default. 2D views (Normals/Depth/Render) draw the pass canvas into a
display canvas with a `drawImage(src, …)` transform — image pixels map 1:1
at zoom 1; `imageSmoothingEnabled = false` keeps texels crisp above 100%.
Wheel zoom multiplies around the cursor: `pan' = cursor - (cursor - pan) *
(z'/z)`; buttons step ×1.25; the readout shows `Math.round(zoom * 100)%`.
Drag pans with pointer capture. The Realtime 3D view maps the same zoom to
the orthographic frustum half-height (`fit / zoom`) and pan to camera
offset in the view plane, so the corner controls read identically in all
views. Alternative: CSS transforms on the canvas — rejected; resolution
would not improve when zooming in.

### D3: Realtime 3D view is a small three.js scene, not the runtime `Renderer`

`runtime/renderer.ts` is built for multi-layer worlds (texture arrays,
ground, highlight, depth compositing) — reusing it for one mesh means
fighting its instance model. Instead a dedicated `RealtimeView` module:
`WebGLRenderer` on the viewport canvas, `OrthographicCamera` positioned by
`isoDirection(ISO_AZIMUTH_DEG, ISO_ELEVATION_DEG)` looking at the
primitive's bounding-sphere center, `AmbientLight` + `DirectionalLight`
with fixed defaults (warm key from upper-left-front, neutral ambient —
constant, not derived from any document state). Mesh material:
`MeshStandardMaterial`-lite via `MeshLambertMaterial`-class lighting is
insufficient for albedo textures with alpha cutout — use
`MeshStandardMaterial` built from the `MaterialGroup` fields
(`albedoTexture` → `map`, `baseColorFactor` → `color`, `alphaMode: 'mask'`
→ `alphaTest`), one mesh per group. Render on demand (effect runs when
doc/transform/size change), not a permanent rAF loop — nothing animates.
Alternative: raw WebGL2 like the compositor — rejected; three.js is already
loaded and the geometry is three.js `BufferGeometry`.

### D4: Availability and placeholders per view

- Realtime 3D: needs `primitiveFor(doc)` to resolve (primitive; or model
  with loaded `doc.gltf`). View-only bundles without provenance disable it.
- Normals/Depth: need `doc.result`; Render: needs `doc.render`. Buttons
  disabled with `title` explaining what is missing. If the active view's
  data disappears (e.g. re-render invalidated), the viewport shows the
  placeholder text until data returns. Default view on open: first
  available in order Realtime 3D → Render → Normals → Depth so a fresh doc
  with a raster bake doesn't show an empty panel.

### D5: Layout and lifecycle

`.center` keeps its grid area; `SpriteEditor` becomes
`height: 100%; display: flex; column` (toolbar / optional view-only note /
viewport `flex: 1; min-height: 0; position: relative`), and `.center` gets
`overflow: hidden` for bake docs via a wrapper class so panning isn't
fought by page scroll. Both control clusters overlay the viewport itself
with one floating-panel look: the view-mode switcher in the top-right
corner, the zoom cluster (`− <n>% + Fit`) in the bottom-right. The sprite
toolbar keeps only Save and Place in world. Because the drag-to-pan
handler lives on the viewport container, its pointerdown handler MUST
ignore events originating inside the control overlays — capturing the
pointer there retargets pointerup and swallows the buttons' clicks. The
realtime renderer is created only while the Realtime 3D view is active and
disposed on view switch, tab switch, or close (`useEffect` cleanup),
preserving the one-live-context-per-editor-kind rule: WebGL context count
stays bounded (sprite realtime view + world compositor at most). The
`.passes` figure CSS and the g-buffer caption toggle are removed.

## Risks / Trade-offs

- [Extra WebGL context while Realtime 3D is active] → created lazily per
  active view and disposed on switch/close; at most one sprite viewport
  exists at a time because only the active tab renders.
- [Zooming a canvas redraw per pointer event could stutter on huge
  sprites] → redraw is one `drawImage` into a panel-sized canvas (not
  per-texel work); recompute the backing-store size only when zoom crosses
  integer scale or the panel resizes (via `ResizeObserver`).
- [Fixed realtime light may disagree with the baked environment look] →
  accepted: the view is for geometry inspection; comparability comes from
  the shared isometric camera, not matching lighting.
- [View state on the document widens `BakeDocument`] → optional fields
  with defaults; no persistence or format impact.

## Migration Plan

Single-branch UI change, no data migration. Old bundles and view-only
documents keep loading; they simply show the new viewport with their
passes. Rollback is reverting the commit.

## Open Questions

None — the fixed-light realtime render (user-confirmed) and the isometric
camera reuse are settled.
