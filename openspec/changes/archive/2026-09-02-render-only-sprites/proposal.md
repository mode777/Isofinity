## Why

The multiplicative-lighting experiment (archived as
2026-09-02-additive-light-baked-sprites) settled how sprites are shaded:
the prerendered image multiplied by the dynamic key + ambient lights reads
well. Two display paths remain, but the unlit path (albedo re-lighting) is
now strictly worse than the shaded prerender — and keeping it forces every
sprite to carry two appearances. Removing the unlit option finishes the
experiment's arc: the runtime becomes a renderer of prerendered sprites,
which is also the shape the eventual asset-format pivot (dropping albedo)
needs.

## What Changes

- Per-sprite display modes are removed entirely: the `baked`/`unlit`
  choice, the per-sprite **Bake toggle** tool, and the Display panel's
  default-mode select all disappear. Every placed sprite displays its
  prerendered lit image shaded by the dynamic key + ambient lights (the
  current multiplicative path).
- The runtime's boot bake now produces a rendered pass for every test
  primitive: the page path-traces each primitive at load with a **built-in
  procedural environment** (equirect gradient sky plus a warm sun disc
  aligned with the default key light direction — no HDRI asset, fully
  deterministic). Boot sprites previously had no render pass and could only
  display unlit.
- The runtime renderer drops the albedo texture array entirely; sprite
  coverage for fragment discard switches from the albedo alpha to g-buffer
  emptiness (`normal == 0`) — the same hard raster coverage from the same
  MRT draw, so occlusion, `gl_FragDepth`, and footprint picking are
  unchanged. Sprite instance data shrinks accordingly (no baked flag).
- Bundles without a rendered pass are rejected at load with a named error
  (previously `/3` bundles and `/4`-without-render loaded as unlit-only).
  `/4` bundles with a render pass load exactly as before.
- Scope is runtime-only: bake tool, bundle format (`isoinfinity-bake/4`),
  passes, and manifests are unchanged. The albedo pass still exists in
  bundles; the runtime just stops consuming it.

Assumptions recorded:
- Boot path-tracing uses the bake tool's current default quality (32
  samples, 5 bounces) at 64 px/unit; sprites are small, so the added page
  latency is expected to be a few seconds. If it feels slow, lowering boot
  samples is a trivial follow-up.
- The procedural environment is a pure function (fixed sun direction
  matching the default light: azimuth 60°, elevation 45°; intensity and
  exposure 1), so boot bakes are reproducible.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-sprite-rendering`: display modes are removed (single shaded-
  prerender path), boot sprites gain path-traced renders via a procedural
  environment, render-pass-less bundles are rejected, and sprite coverage
  is defined by g-buffer emptiness instead of the albedo alpha.

## Impact

- `src/runtime/renderer.ts` — single-path sprite shader (no `uSprites`, no
  baked flag), discard on g-buffer emptiness, instance stride 8 floats,
  `setSprites` loses the albedo parameter.
- `src/runtime/assets.ts` — async boot bake producing a `render` layer per
  primitive via `PtBaker` + procedural environment; `SpriteLayer`/`SpriteSet`
  drop albedo fields; `layerFromBundle` requires the render pass and stops
  decoding the albedo PNG.
- `src/runtime/world.ts` — `DisplayMode`, `displayMode`, `toggleModeAt`
  removed.
- `src/runtime/main.ts` — async boot, mode tool/default-mode UI wiring
  removed, 8-float instances.
- `index.html` — Bake toggle button and Display panel removed; footer text
  updated.
- `docs/runtime.md` — display modes section collapses; boot bake and bundle
  requirements updated.
