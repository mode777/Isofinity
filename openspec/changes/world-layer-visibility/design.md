# Design: World editor layer-visibility dropdown

## Context

The world viewport already hosts three corner panels: the vertical tool bar
(top-left, `.tool-bar`), the zoom cluster (bottom-right, `.zoom-controls`),
and — in the sprite editor only — the view controls (top-right,
`.view-controls`). The **world** viewport's top-right corner is free. The
renderer (`src/runtime/renderer.ts` `render()`) is stateless per frame: it
draws exactly the ground/material state it was given plus the instance,
shadow, overlay and mesh batches the editor hands it, in a fixed stage order
(ground → contact shadows → meshes → sprites → deferred light → overlay).
Everything this feature needs is therefore a caller-side concern in
`WorldEditor.renderFrame`, with one exception noted in D2 (the ground stage
reads renderer state set earlier via `setGround*`, so skipping the draw needs
a per-frame gate on the call). Motivation: see proposal.md — Why.

## Goals / Non-Goals

**Goals:**

- One transient per-document visibility state consumed identically by
  rendering, picking, and surface-snap inputs.
- Hide/show with zero content mutation: no world, placement, or file change;
  instant restore on show.
- Fit the existing viewport-chrome patterns (corner panel look, icon button
  with tooltip, store action without dirty/history).

**Non-Goals:** per-placement visibility; a light layer; persistence,
undo/redo, or shortcuts; any bake/world-format/renderer-architecture change.
(Full list: proposal.md — Non-goals.)

## Decisions

### D1 — State: one transient field on `WorldDocument`

`layerVisibility: { ground: boolean; sprites: boolean; meshes: boolean }`,
all `true` by default, lives on `WorldDocument` next to `tool`,
`surfaceSnap`, and `viewTransform`, with the same JSDoc contract: **in-memory
editor state only — never written into world files** (ADR 0006's
persisted/in-memory split). Defaults are added in both `newWorldDoc` and
`openWorldDoc`. A store action `setLayerVisibility(docId, layer, visible)`
uses `update()` and — like `setTool`/`setSurfaceSnap`/`setWorldViewTransform`
— deliberately neither calls `markDirty` nor pushes a history command.

- *Rejected: per-placement visibility flags.* A different, heavier feature:
  it would touch placement authoring, undo semantics, and tempt
  serialization; the request is three whole-layer toggles.
- *Rejected: React component state.* Must survive tab switches; only the
  store's document objects do.
- *Rejected: state on `World` / in the renderer.* `World` is pure scene
  content and the renderer is per-frame stateless; editor chrome belongs to
  the document (ADR 0006).

Because `renderFrame` already re-reads the live document every frame, a
toggle needs only the store action — no effect re-binding, no extra
subscription.

### D2 — Rendering: gate at emission; one per-frame ground flag

In `renderFrame`, read `live.layerVisibility` and:

- **Sprites** — skip `emit(...)` for placements (the depth-sorted loop)
  while keeping the loop order intact for the ghost. Their baked grounding
  shadows disappear with them (the shadow strength rides the instance).
- **Meshes** — build no `meshDraws` for placed characters; skip their
  `emitShadow`. Animation players keep advancing (toggling visibility is
  not a pause; showing restores mid-animation, matching "restore
  unchanged").
- **Contact shadows** — skip per hidden layer; when the **ground** is
  hidden, skip the whole contact-shadow stage (there is no floor to receive
  them).
- **Ground** — pass a per-frame flag to the renderer: extend
  `render(instances, count, shadows, overlay, view, meshes)` with an
  optional final options argument (`{ groundVisible?: boolean }`, default
  `true`) that gates only stage 1 (flat batch *and* material tiles).

- *Rejected: clearing ground via `setGround`/`setGroundMaterial` while
  hidden.* Fights the `groundKey` cache (hidden ≠ key change → stale
  re-apply on show; cleared buffers → re-upload on show). The per-frame
  flag leaves the cache untouched, so show restores instantly with no GPU
  work beyond the resumed draw.
- *Rejected: `if (layerHidden) continue` inside the renderer per instance.*
  Would push editor chrome state into the renderer and bloat the instance
  format; the caller-side filter is free.

**Ghost previews stay visible while their layer is hidden.** The sprite
ghost and character ghost preview the *next action*, not world content, and
placement stays allowed while a layer is hidden; the spec's hide scenarios
cover placements only. Ghost shadows follow the ghost, not the layer.

### D3 — Picking and surface snap: filter at the two call sites

`pickAt` filters `live.world.list()` and `live.world.listMeshes()` by
`layerVisibility` before calling `pickPlacementAt`; `effectiveHeight`'s
placement list gets the same filter (hidden sprites supply no snap
heights). Lights are never filtered. `src/runtime/selection.ts` and
`src/runtime/world.ts` stay untouched — hidden-ness is editor state, and
both modules should not know about it (ADR 0006).

- *Rejected: a `world.listVisible(viz)` API on `World`.* Couples pure scene
  content to editor chrome for one caller's filter.

The selection highlight (overlay batch) skips the outline while the
selected ref's layer is hidden; the selection itself is kept, so showing
the layer restores the highlight. Light icons/rings are unaffected.

### D4 — UI: a `.layer-controls` corner panel with a custom dropdown

New absolutely-positioned sibling of the canvas inside `.world-viewport`,
styled after the shared floating-panel look (`.slot-switcher` /
`.view-controls` / `.zoom-controls`): `top: 0.6rem; right: 0.6rem;
z-index: 2`. The button is an `icon-btn` with a new `IconLayers`
(stacked-layers glyph, sibling of `IconBakeAll` in `icons.tsx`) and a
tooltip. Activating toggles a small menu of three rows — Ground, Sprites,
Meshes — each a check row reflecting `layerVisibility`; clicking a row
dispatches `setLayerVisibility`. The dropdown closes on outside click
(document-level pointerdown listener while open), on re-clicking the
button, and on Escape.

- *Rejected: native `<select>`.* One select cannot express three
  independent booleans; the brush selector's select pattern does not
  transfer.
- *Rejected: a properties-panel section.* The request is viewport-anchored
  chrome; the panel is for content properties.

Input safety comes for free: `WorldEditor` binds its pointer listeners to
the **canvas**, so a positioned sibling at `z-index: 2` shields it (the
`SpriteEditor`-style `.closest()` guard is only needed for viewport-div
listeners and is not required here, though adding it costs nothing).

## Risks / Trade-offs

- [Deferred light pass over an empty g-buffer when every layer is hidden]
  → The pass already tolerates degenerate scenes (empty world, no sprites);
  verify once in the browser that the background stays clean with all
  layers off.
- [Ghost visible over a hidden layer can look inconsistent with "the layer
  is hidden"] → Accepted: the ghost previews the next click, and placement
  remains allowed; documented in D2 rather than specced as hidden.
- [Users expect visibility toggles to be undoable] → Accepted and recorded:
  visibility follows the tool/snap precedent (chrome, not content); undo
  history stays about the world.
- [Dropdown outside-click listener leaks] → Attach the document listener on
  open, remove on close/unmount (the existing engine `useEffect` cleanup
  pattern).

## Migration Plan

None required: no format, persistence, or API change — worlds old and new
load with all layers visible. Rollback is reverting the commit.

## Open Questions

None.
