## Context

Bundles (`isoinfinity-bake/6`) already store up to four view slots: the
north view as the main passes, extra E/S/W views in `manifest.views[]`,
each with its own sprite rect, origin, g-buffer and render pass
(`parseBake` exposes them as `ParsedBundleView[]`). Everything downstream
consumes only the north view: `loadBundleLayer` decodes N, `Placement`
has no direction, `isoinfinity-world/2` stores none, and the renderer
draws one texture-array layer per `SpriteLayer` with instances
referencing a layer index. Each slot's view is baked by rotating the
model against the fixed iso camera (ADR 0005), so a slot's passes are
exactly the world-facing image, g-buffer included — a placement may use
a slot's layer as-is. Views may differ in size and origin from N (the
rotated model projects differently). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Per-placement direction, chosen per brush before placing, persisted
  with the world.
- Direction switchable via a toolbar dropdown next to the brush select
  and by cycling with `E`.
- Reuse the multi-view bake output without touching the bundle format,
  the renderer, or the lighting/occlusion model.

**Non-Goals:**

- No rotate tool for already-placed sprites; no dragging a placed
  sprite's direction (future change if wanted).
- No changes to the bake pipeline, bundle format, or sprite editor.
- No world-file editor chrome beyond the placement's own direction
  (brush direction stays in-memory per ADR 0006).
- No camera/azimuth changes — the fixed iso camera stays fixed.

## Decisions

### One layer per view, direction-tagged layer ids

Each placeable view of an asset becomes its own `SpriteLayer` in
`WorldDocument.layers`, with id `viewLayerId(asset, slot)`: the plain
asset id for north (unchanged from today), `<asset>@<slot>` for extras.
Placements keep `primId` = base asset and gain `dir: ViewSlot` (default
`'n'`); rendering resolves `(primId, dir)` → layer index.

*Why:* the renderer, `layersToSet`, ghost preview, depth keys and
surface snap already treat layers as independent images with their own
size/origin — exactly what per-slot views are. The alternative, extending
`SpriteLayer` to hold four views and teaching the renderer/upload path
about view selection, touches the engine for no behavioral gain and
complicates `SpriteSet` consumers. The plain north id keeps every
existing code path (legacy placements, place-in-world, erase, tool
checks) working unchanged.

*Conventions:* a shared helper (next to `src/shared/iso.ts` consumers,
e.g. in `src/runtime/assets.ts`) owns both the id convention and
`(asset, dir)` parsing, so the `@` encoding lives in exactly one place.
Asset ids come from sanitized sprite file names; a collision with a
literal `@` id is theoretically possible and accepted (documented in the
helper) — worst case a second sprite's layer shadows an extra view,
caught by the per-view smoke test.

### Placement gains `dir`; world format bumps to `/3`

`Placement` carries `dir: ViewSlot` (`'n'` default). `World.place`
accepts it; save writes `dir` per sprite only when it is not `'n'` (so
north-only worlds stay byte-similar to `/2`); the parser reads `/1`,
`/2`, `/3` per the world-persistence delta. `depthOf` and the painter
sort are direction-independent — correct, because every view is rendered
from the same fixed camera and world-space depth frame.

*Why a format bump:* the project's convention pins evolving layouts with
format markers (`isoinfinity-world/N`); an optional field is still a
layout change. Old files load unchanged (tolerance table per
`docs/bake-pipeline.md`'s world equivalent).

### Brush direction is per-document in-memory editor state

`WorldDocument` gains `brushDir: ViewSlot` (default `'n'`), never
serialized, never marking dirty — same class as `heightLevel` and
`surfaceSnap` (ADR 0006). `placeAt` and the ghost resolve the brush
layer as `viewLayerId(tool, brushDir)`; the toolbar dropdown and the `E`
key mutate it. Availability of a direction = a loaded layer with that
tag exists for the current brush; the dropdown disables below two
available directions.

*Why not extend `tool` to carry the direction* (e.g. tool = `foo@e`):
`tool` doubles as the asset id for `placeAt`'s layer check, status
messages, and save-time asset ids; encoding direction into it would leak
the layer-id convention into persistence paths and break
`resolveBundleFile`. Keeping them orthogonal keeps save round-tripping
`(asset, dir)`.

### Multi-view loading in the acquisition paths

A new loader beside `loadBundleLayer` (in `src/runtime/assets.ts`) parses
a bundle into all placeable views: N (render required, as today) plus
each `ParsedBundleView` whose render blob exists, each decoded to its own
`SpriteLayer` (own width/height/origin). `selectBrush` and `openWorldDoc`
append every view and report skipped render-less views in the status bar.
Primitives stay north-only (boot bake is single-view).

*Why load all views eagerly:* brush switching must be instant and the
editor already re-uploads all layers on `layers` change; lazy per-view
loading would add async paths into placement rendering for memory the
editor scale does not need. Cost: up to 4× texture memory for multi-view
sprites (see Risks).

### `E` key cycles; listener lives in the world editor

A `keydown` listener (window-scoped, bound in `WorldEditor`'s effect
like its pointer handlers) advances `brushDir` N → E → S → W across the
brush's available directions, wrapping. Guards: no ctrl/meta/alt, key
`e`/`E`, event target not an `input`/`textarea`/`select`/contentEditable,
pencil tool with a multi-view sprite active. Only one world editor is
mounted at a time (one live context per kind), so the active tab's
editor owns the shortcut.

*Why `E` and not `R`:* user-requested; `E` collides with nothing today —
the app has no other global shortcuts (only input-field Enter/Escape
handling).

### Renderer and shading: no changes

Instances reference layer indices; per-view layers slot into the existing
sprite set, and each view's g-buffer already carries world-space
normals/depth from the fixed camera, so occlusion and multiplicative
shading (ADR 0003) work per direction with zero engine changes.

## Risks / Trade-offs

- [Texture memory grows by one layer per extra view] → accepted at
  editor scale (sprites are small, padded to one shared max size); noted
  here so a future budget can switch to lazy view loading without
  spec changes.
- [`@` in a literal asset id could shadow an extra-view id] → single
  helper owns the encoding; the per-view smoke test catches a collision;
  sprite names in practice are sanitized stems.
- [`brushDir` can point at a direction whose layer is gone (tab
  switch after layers change)] → availability is derived from loaded
  layers each render; `placeAt` falls back to north when the tagged
  layer is missing and the dropdown clamps to available values.
- [Eager extra-view load doubles work on world open for multi-view
  assets] → same order as today (one bundle parse, more decodes);
  skipped views are reported, not fatal.

## Migration Plan

No data migration: `/3` is additive and `/1`+`/2` read as before. Worlds
saved by the new build load in older builds only as far as those builds
read formats — pre-existing project stance (no released API).

## Open Questions

None — scope, format, and controls are pinned by the proposal and
specs.
