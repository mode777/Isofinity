# Editor height sliders

## Why

Every height in the world editor — the brush height, a selected sprite's or
character's height, and a point light's emitter height — is edited by typing
into a precise numeric field. Height tweaks are the most common placement
adjustment and live almost entirely in a narrow band around the ground plane
(−2 to +2 world units), so pointing at the value with a slider is much faster
than typing, while the exact numeric entry stays available for precise work.

## What Changes

- A shared slider-plus-precise-number row control is added to the properties
  panel control set (`src/app/components/controls.tsx`): a range slider and
  the existing precise-numeric text field on one row.
- The four height fields in the world-editor properties panel
  (`WorldProperties.tsx`) gain that slider, all spanning **−2 to +2** world
  units:
  - Brush height (Brush section, applies to the next placements).
  - Selected sprite height.
  - Selected character (mesh) height. *(Assumption: the request named sprites
    and lights; the character height field is the same height-editing pattern
    in the same panel and is included for consistency. Drop it from scope
    here if unwanted.)*
  - Selected point light height.
- The numeric fields keep their exactness and their range rules: typed values
  apply exactly and stay unclamped (brush/sprite/character heights, per the
  unclamped-height requirement); the light field joins the other three on
  precise input. The slider is **relative**: it offsets the height current at
  drag start by −2…+2, the thumb rests centered and recenters on release, and
  repeated drags compound — stored heights stay unclamped and any value
  remains reachable by typing.
- Slider behavior when surface snap is on follows the existing height-field
  rule: the read-only snap display replaces the whole height row, slider
  included.
- No model, persistence, or rendering changes: heights keep their semantics
  and ranges in `src/runtime/world.ts`; store actions
  (`setHeightLevel`, `patchSprite`, `patchMesh`, `setLightPlacement`) are
  reused unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the **Unclamped placement height control** requirement
  gains a slider alongside the manual numeric input in the Brush section —
  the slider is bounded to −2…+2 while the typed field stays exact and
  unclamped; both adjust the same stored brush height.
- `world-editor-selection`: the **Selected placement property editing**
  requirement — the height controls for a selected sprite or character, and a
  selected light's height control, each gain a −2…+2 slider alongside the
  numeric field; edits remain immediate, undoable, and dirty-marking.

## Impact

- Code: `src/app/components/controls.tsx` (new/extended shared row),
  `src/app/components/WorldProperties.tsx` (four height rows), possibly a few
  lines in `src/app/app.css` if the shared `.row` layout needs no change.
- Undo behavior follows the existing slider rows (each slider step commits
  through the same store actions as today).
- Docs: `docs/runtime.md` (world-editing sections mention the sliders),
  `docs/roadmap.md` (Done line). No glossary change. No ADR — a UI affordance
  with no durable cross-cutting trade-off.
- Format-version impact: none. No bake-bundle or world-file format change;
  the brush height remains in-memory editor state (never serialized), and
  placement/light heights round-trip exactly as before.

## Non-goals

- No clamping of stored heights to −2…+2 (the slider band is UI-only).
- No sliders for x/z ground positions or other panel fields.
- No change to shift+mouse-move height adjustment, surface-snap semantics,
  ghost preview, or the keyboard `E` direction cycling.
- No new verify script: the change is browser UI only; `npm run build` plus
  a manual browser check are the gates.
