# Fix surface-snap height

## Why

Surface snap does not land placements on the surface the cursor points at:
hovering the top of a height-1 cube places the ghost/placement higher than 1,
while typing `1` into the height field places it exactly. The user cannot see
what height snap read either, so the error is invisible and hard to reason
about.

## What Changes

- Fix the CPU-side surface-height reconstruction used by surface snap
  (`effectiveHeight` in `src/app/components/WorldEditor.tsx`) so the height it
  reports equals the world-space height of the visible surface under the
  cursor — the top of a height-1 cube yields exactly 1, within render
  precision.
- Treat the snapped value as an eyedropper read: compute it once per pointer
  position, keep it in editor state, display it in the toolbar height field
  while surface snap is on (read-only indication), and use that exact value
  for the ghost and placements — the same path a manually entered height
  takes.
- Over empty ground the read height is 0 and the height field shows that,
  consistent with existing behavior.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: the surface-snap requirement gains precision and
  visibility guarantees — the snapped height SHALL equal the visible surface
  height under the cursor (a unit cube's top reads exactly 1), and the height
  field SHALL display the snap-read height while surface snap is on.

## Impact

- `src/app/components/WorldEditor.tsx` — surface-height reconstruction
  (g-buffer depth unprojection + anchor correction) and height-field wiring.
- `src/app/store/world.ts` / `src/app/document.ts` — only if the read height
  needs a per-document store slot (in-memory editor state, never serialized).
- No bundle-format impact: `isoinfinity-bake/6` unchanged, no new fields, old
  bundles unaffected. No ADR needed — this repairs conformance with the
  existing depth-not-position invariant (docs/decisions/), it does not settle
  a new cross-cutting trade-off.
- Docs: update `docs/runtime.md` surface-snap description if it states the
  height semantics; `docs/roadmap.md` gains a done entry. Glossary: no new
  term ("surface snap" already exists).
- Verification: `npm run build`; browser check of the read height in
  `/scratch-verify.html` or the editor itself (no headless browser available).

## Non-goals

- Changing the bake pipeline, depth semantics, or bundle format.
- A click-to-pick "pick height" tool; surface snap stays a live hover behavior.
- Character (mesh) brush snapping beyond benefiting from the same corrected
  read; its spec lives in `runtime-mesh-rendering` and is not modified.
- Height quantization/snapping to a grid.
