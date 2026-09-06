## 1. Shared math

- [x] 1.1 Add the ground-plane unprojection helper (ray∩ground cell from sprite pixel + placement offset) as a CPU reference twin next to the existing iso helpers in `src/shared/iso.ts`, with the GLSL expression planned alongside; verify `npm run build` passes
- [x] 1.2 Add a small pure-TS box-blur utility (separable, float arrays) usable from Node; verify with a quick inline round trip (impulse → known kernel spread)

## 2. Bake: grounding-shadow derivation and composition

- [x] 2.1 Implement footprint splat: unproject each covered g-buffer pixel's world position to the decal grid (respecting the slot's presentation); verify on a primitive that the decal matches the projected footprint shape (Node check)
- [x] 2.2 Implement blur + proximity falloff over the decal grid (uses 1.2); verify determinism (two runs → identical arrays) in a Node check
- [x] 2.3 Compose the decal into the render pass: post-tonemap RGBA8, alpha-0 pixels only, dark-blue grounding tint, alpha = mask·strength; verify object pixels and AA fringe are byte-untouched (Node check on `BakeResult` arrays)
- [x] 2.4 Generalize sprite rect derivation to the projected box ∪ projected decal extent and reproject `originPx` into the grown rect; verify toggle-off bakes reproduce the old rect/bytes and toggle-on rects contain the patch
- [x] 2.5 Run the grown rect through the pixel-cap check so the pre-bake warning covers the shadow reach; verify the warning appears for an oversized case

## 3. Bake editor: toggle + provenance

- [x] 3.1 Add the per-document grounding-shadow toggle (default on) to the sprite properties panel; verify toggling marks the document dirty and the next bake adds/drops the patch
- [x] 3.2 Write `groundShadow: false` into provenance when disabled (omitted at the default) and restore the toggle on open; verify `/6` save → open round trip keeps the flag and that bundles without the field restore to on
- [x] 3.3 Verify each stored view slot derives its own shadow (bake N+E with the toggle on; E's patch is the rotated asset's)

## 4. Runtime compositing

- [x] 4.1 Add the shadow pixel class to the sprite fragment shader: classify empty+alpha>0+tint as shadow, blend without shading, suppress when per-instance height ≠ 0; verify object/empty behavior is unchanged for legacy sprites
- [x] 4.2 Implement the ground-plane depth write for shadow fragments (GLSL twin of 1.1); verify in `scratch-verify.html` that a shadow patch darkens a farther sprite and is overwritten by a nearer one
- [x] 4.3 Verify interleaving matrix in the scratch harness: shadow vs bare ground, vs farther sprite, vs nearer sprite, vs overlapping second placement, vs a placed character mesh; capture golden hashes

## 5. Verification, docs, re-baseline

- [x] 5.1 Extend `npm run verify:bundles` (`src/bake/views-verify.ts`) with grounding-shadow cases: manifest flag round trip, toggle-off byte compatibility, unknown-field tolerance; all green
- [x] 5.2 Re-baseline `scratch-verify.html` primitive bundle hashes (render bytes shift by design); `npm run build` + `npm run verify:mesh` green
- [x] 5.3 Update docs: `docs/bake-pipeline.md` (pass convention + format-history note for the optional provenance field), `docs/runtime.md` (Display/Renderer: shadow class + depth rule), `docs/glossary.md` (grounding shadow), `docs/roadmap.md` (Done entry)
- [x] 5.4 Write ADR 0010 (transparent-pixel depth rule: shadow pixels write true ground-plane depth, never object depth) in `docs/decisions/` with an index row
