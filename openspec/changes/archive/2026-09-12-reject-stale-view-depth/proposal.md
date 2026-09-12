# Reject stale view-slot depth data

## Why

Bundles saved during the first multi-view implementation (camera-rotating
slots, before ADR 0005's model-rotation fix) still load today: the format
did not change, so nothing distinguishes them at the manifest level. Their
E/S/W g-buffers store depth along the slot's *camera* direction instead of
the fixed world view direction, and the current runtime reads that as
0.61–1.22 units too far — those sprites silently sink into the ground
while north stays perfect. Re-baking fixes it, but nothing warns, detects,
or prevents the corruption from spreading into saved worlds.

## What Changes

- `loadBundleViews` validates every decoded view's g-buffer depth against
  the manifest's recorded `depth.range` (small half-precision epsilon).
  Depth outside the range — negative depth in particular, the unambiguous
  stale-slot signature — makes the view unplaceable.
- The north view failing the check fails the whole bundle load with a
  named error (same shape as the missing-render-pass rule).
- An extra view failing the check is **skipped with a named status note**
  ("stale depth — re-bake this sprite"), exactly like the existing
  no-render-pass skip; the remaining placeable views still load.
- `BundleViews.skipped` grows a reason string so callers (world open,
  brush pick) can surface which slots were dropped and why. Call sites
  updated to compose the note.
- `views-verify` gains a case: a bundle carrying a stale-depth extra view
  is rejected/skipped by name; a valid bundle still passes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-sprite-rendering`: the "Extra bundle views are placeable per
  view" requirement gains the depth-validity rule — a view whose baked
  depth falls outside the manifest's recorded range is not placeable and
  is skipped with a named note; north failing the check fails the load.

## Impact

- Code: `src/runtime/assets.ts` (`loadBundleViews`, `BundleViews`),
  `src/app/store/world.ts` (two call sites, status notes),
  `src/bake/views-verify.ts` (new case).
- Docs: `docs/bake-pipeline.md` (format-history tolerance note for `/6`),
  `docs/roadmap.md` (done entry). No new ADR — the durable *why* is
  ADR 0005; this change only enforces it at load time.
- Format version: unchanged (`/6` in, `/4`–`/6` tolerated). No new fields.
  Behavior tightens for one class of old bundles: they load with stale
  extras skipped instead of silently placeable — that is the point.

## Non-goals

- No migration or auto-re-bake of stale bundles: the sprite editor's
  provenance-driven re-bake already covers recovery manually.
- No change to the sprite editor's bundle *inspector* (`bundleView.ts`,
  display-only): it does not feed placements. Flagging stale passes there
  is a possible follow-on.
- No change to the bake itself or to `parseBake`'s container-level
  validation (the stale data is only visible after EXR decode).
- No detection of *wrong-but-in-range* depth (e.g. a hypothetical future
  bake bug that stays within bounds); this guard targets the known,
  unambiguous stale-slot signature.
