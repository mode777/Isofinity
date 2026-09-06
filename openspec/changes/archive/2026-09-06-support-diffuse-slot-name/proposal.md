## Why

Ground material zips identify maps by the file-name pattern
`<name>_(diff|arm|nor_gl)_*`. Common PBR material sets (e.g. ambientCG
older releases) name the diffuse map with `diffuse_` instead of `diff_`,
so those materials are rejected as "no diffuse map" even though they are
well-formed. The fix is a strict widening of the accepted diffuse slot
name; nothing about baking, rendering or persistence changes.

## What Changes

- The material-zip slot matcher accepts `diffuse` as an alias for the
  `diff` slot, so `<name>_diffuse_*.(exr|png|jpg)` files satisfy the
  required diffuse map.
- `diff` keeps precedence: if a zip contains both a `diff_` and a
  `diffuse_` map, the `diff_` one wins and the other is reported as a
  duplicate, matching existing first-match-per-slot behavior.
- Error messages and the workspace hint text mention both spellings.
- No change to the bundle format, bake pipeline, or world serialization.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-ground-rendering`: the "Ground materials load from the
  workspace" requirement now accepts `diffuse` as an additional
  accepted file-name component for the diffuse map slot, with `diff`
  taking precedence when both are present.

## Impact

- `src/app/groundMaterial.ts` — slot regex, slot type/mapping, invalid-
  material error text, module doc comment.
- `src/bake/scratch-verify.ts` — the Node-runnable fixture covers the
  alias (browser harness /scratch-verify.html).
- `src/app/components/WorldProperties.tsx` — user-facing hint text.
- Docs: `docs/glossary.md` (material slot term) if it pins the exact
  pattern; no format-version impact — materials are workspace files,
  not bundles, and no stored state changes shape. No ADR needed (not a
  durable cross-cutting trade-off).

## Non-goals

- No support for other slot aliases (e.g. `albedo`, `basecolor`,
  `normal` vs `nor_gl`).
- No change to the bake pipeline's own map conventions or the
  `isoinfinity-bake` format.
- No automatic renaming or migration of existing material zips.
