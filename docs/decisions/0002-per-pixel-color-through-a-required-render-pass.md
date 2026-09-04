# 0002 — Per-pixel color ships through a required path-traced render pass

Status: Accepted (2026-09, `isoinfinity-bake/5`; tolerant parsing in every
version since `/4`)

## Context

The original pass set was albedo (unlit base color) + g-buffer + a
path-traced `render` pass + a path-traced `ao` pass. Two problems: nothing
downstream read the stored albedo (the world compositor shades the *render*
image by the g-buffer normals), and the AO pass accumulated empty output on
tested hardware — known-broken.

## Decision

One authoritative pass set end to end: the raster g-buffer plus the
optional-but-required-for-placement path-traced `render` pass.

- The unlit `albedo` pass is removed (no runtime consumer): per-pixel color
  ships exclusively through the `render` pass, and the runtime requires it
  before a sprite can be placed into a world.
- The broken `ao` pass is deleted end to end (baker, settings, UI,
  manifest fields) rather than shipped behind a flag; a future change may
  reintroduce occlusion with a different approach.
- Materials keep feeding the path tracer (base-color textures/factors, PBR
  inputs) — albedo is a material *input*, never a stored pass.
- The manifest's `passes` table is self-describing: `parseBake()` resolves
  only the g-buffer (required) and render (optional) entries and ignores
  legacy albedo/ao entries, so old bundles keep loading unchanged. A
  format bump would have invalidated every bundle reference for zero
  parsing benefit.

## Consequences

- Bundle bytes shrink by one PNG per sprite; no dead code paths or UI.
- Sprites without a render pass open view-only-ish: visible in the sprite
  editor, not placeable into worlds (`loadBundleLayer()` hard-requires
  render).
- Re-saving a legacy bundle drops its ignored albedo/ao entries —
  intended; the passes have no consumers.
- G-buffer emptiness (`length(normal) == 0`) is the sole hard coverage
  signal for hit-testing and occlusion; the render pass's alpha is display
  coverage (antialiased, softer) only.

## Rejected alternatives

- Keeping albedo for relighting (POE-style albedo-driven shading): the
  runtime shades the already-lit prerender (see ADR 0003); no consumer
  existed.
- Keeping AO behind a flag: known-broken, unreplaceable as written.
- Bumping the format to drop the fields: parser tolerance achieves the
  same for free.
