# Add multi-view bake

## Why

Sprites bake from exactly one fixed camera direction, so a world can only
ever show an object from its north face: placing a rotated variant (a door
facing east, a wagon turned south) reuses the same pre-rendered image and
breaks the isometric illusion. Pre-rendered engines solve this by baking a
sprite per facing; Isofinity's per-pixel g-buffer + render-pass format can
carry those extra facings without giving up deferred lighting or accurate
occlusion.

## What Changes

- Four fixed view slots per sprite document — N, E, S, W — rotating the bake
  camera about the vertical axis in 90° steps. N is the default slot and is
  the existing camera; E/S/W add 90°/180°/270° of yaw. Elevation, projection
  and framing rules stay unchanged.
- Each slot is baked individually with the existing render-pass action
  (implicit g-buffer re-bake + path-traced render) against the document's
  current source and settings.
- The bake viewport gains a slot switcher in its top-right corner: one icon
  per slot, color-coded to show whether that slot already holds a baked
  render; switching slots swaps which view the viewport displays.
- The sprite editor toolbar gains two actions:
  - **Remove view** — discards the baked passes of the selected slot;
    unavailable for N (the default slot always exists once baked).
  - **Bake All** — batch-bakes all four slots in N→E→S→W order, creating
    missing E/S/W views and re-baking existing ones, switching the viewport
    to each slot as it renders.
- **BREAKING** — the sprite bundle format moves to `isoinfinity-bake/6`,
  storing per-view pass entries and per-view manifest data (camera, sprite
  rect, environment/renderer provenance per view). `/4` and `/5` bundles
  remain readable and behave as single-view (N) sprites; the editor no
  longer writes `/5`.
- Scope is bake-side only: rendering, storing, the format, and the bake
  editor UI. Selecting a view per world placement (and runtime rendering of
  non-N views) is explicitly out of scope and left to a later change.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `asset-baking`: multi-view bakes — rotated view slots, per-view bake and
  removal, batch baking, and the `isoinfinity-bake/6` bundle format that
  stores up to four view passes alongside per-view manifest data; `/5`-era
  provenance, re-bake and workspace-save requirements extended to views.
- `integrated-editor`: sprite editor toolbar gains Remove view and Bake All,
  and the bake viewport gains the view-slot switcher icons with baked-state
  coloring.

## Impact

- `src/bake/` — camera framing (`iso.ts`) generalized to parameterized
  azimuth; bake + path-trace passes (`bake.ts`, `pt.ts`) run per view;
  manifest/bundle (`export.ts`, `bundle.ts`) move to `/6` with per-view
  passes; `scratch-verify.ts` updated.
- `src/app/` — `BakeDocument` holds per-view state (results, renders,
  active slot); `store/bake.ts` gains per-view bake, remove-view and
  bake-all actions; `SpriteEditor.tsx`/`EditorToolbar.tsx`/`bakeView.ts`
  gain the slot switcher and new toolbar actions; `bundleView.ts` decodes
  `/6`.
- World-side placement and the runtime renderer (`src/runtime/`) are
  untouched — they keep consuming the N view.
- Saved `/6` sprites are not readable by older builds (expected — no
  released API); `/4`+`/5` inputs stay compatible.
