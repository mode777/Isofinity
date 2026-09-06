## Context

Sprites ship two passes: a raster g-buffer (rgb = world normal, a = linear
ray depth against the global reference plane) and the path-traced `render`
pass (ACES/sRGB RGBA8, alpha = antialiased coverage). Empty render pixels
are `(0,0,0,0)`; the runtime discards g-buffer-empty fragments and writes
`gl_FragDepth = 0.5 − dot(worldPos, viewDir)/128` per fragment, so the
single painter-sorted instanced batch resolves occlusion pixel-accurately.
The world ground plane writes no depth and is backdrop only. The bake
camera, depth semantics and ground unprojection live in `src/shared/iso.ts`
/ `src/bake/iso.ts` (`reconstructWorldPos`, `screenToGround`). Motivation:
see proposal.md — Why. Behavior contracts: the two delta specs.

## Goals / Non-Goals

**Goals:**

- Grounding shadow computed entirely from already-baked data (g-buffer →
  mask → render-pass pixels); no new renderer, no PT involvement, no
  format bump.
- Runtime compositing correct in every interleaving case using the
  existing batch, blend state and LEQUAL depth test — one new depth rule.
- Optional at bake time (editor toggle, default on) and reproducible from
  provenance.

**Non-Goals:**

- Directional cast shadows; shadows received by sprites/meshes; separate
  shadow pass or format `/7`; world-space accumulated shadow maps;
  preset support for the toggle; changes to the boot-time procedural bake
  (its sprites carry no shadow pixels; the runtime class simply never
  fires); changes to ellipses, hit-testing, or Dynamic-light semantics.

## Decisions

### D1 — Derive the mask from the g-buffer, not a new render

Splat each covered g-buffer pixel's unprojected world position onto a
ground-plane (x/z) decal grid, then blur (separable box, two passes) with a
proximity falloff. Rationale: the g-buffer already holds exact world
positions per pixel — a top-down raster would re-derive coverage the bake
already has; pure array math is Node-testable, deterministic, and runs on
`BakeResult` floats without GPU round trips. Alternatives: PT shadow
catcher (rejected: library lacks the material, needs dual accumulations,
couples the look to the HDRI) and a light-space depth render (rejected:
needs a directional light the diffuse bake doesn't have).

### D2 — Flatten the decal into the render pass's empty pixels

Composite after ACES tonemap/sRGB encode: for each render pixel with
alpha 0, sample the decal at that pixel's ray∩ground (x,z) and write the
grounding tint with alpha = mask·strength. Black+alpha is tonemap-invariant,
but compositing post-tonemap keeps the change a pure post-step on the
finished RGBA8 and needs no PT-pipeline surgery. The tint is very dark
**blue** rather than pure black (POE shadow-color-matching) — and doubles
as the classifier bit (D5). Only pixels that were fully empty receive
values; object pixels and AA fringe are untouched.

### D3 — Rect = projected box ∪ projected shadow extent

`frameIsoBox`'s corner projection generalizes to a point-cloud union: the
8 box corners plus the decal rect's ground corners projected. `originPx`
reprojects into the grown rect; placement math (origin-anchored) is
untouched. The 8192 px cap check runs on the grown rect so the existing
pre-bake warning covers the shadow reach. Alternative (rejected): separate
decal rect in the manifest — that is the format `/7` path deliberately
deferred (keeps A upgradeable to B without wasting it: the mask is already
ground-space data internally).

### D4 — Runtime: shadow pixels write true ground-plane depth

Fragment classification in the sprite shader: g-buffer empty + render
alpha 0 → discard (as today); g-buffer non-empty → object path (as
today); g-buffer empty + alpha > 0 → shadow path: no key/ambient shading,
blend the texel, and write `gl_FragDepth` from the ray∩ground-cell
intersection (`y = 0`, placement x/z + texel ground offset; GLSL twin of
`screenToGround`).

Why ground-plane depth (the crux — alternatives rejected):

- *Object depth*: a fake occluder in empty space; later-drawn fragments
  testing LEQUAL against it punch holes in the world.
- *No depth*: `glDepthMask` is per-draw state, so object and shadow
  pixels could not share one batch without draw-splitting and painter
  hacks.
- *Ground-plane depth*: a shader-written depth is used for both the test
  and the write, and being physically true for the shadow, both are
  correct — farther sprites get darkened (shadow passes), nearer sprites
  overwrite (they pass), overlapping shadows resolve to the nearer ground
  point (no double-darkening). The depth buffer does the interleaving;
  zero new batches or state changes.

The 2:1 ground projection is affine, so the per-fragment unproject is a
few fused multiplies against constants already in the shader.

### D5 — Classification uses the tint, not alpha alone

"G-buffer empty + alpha > 0" also matches the render pass's soft AA fringe
(fringe pixels lie outside the raster coverage). Baking the tint as dark
blue (not `(0,0,0)`) lets the shader classify shadow pixels as
empty + alpha>0 + blue-dominant near-black; remaining empty+alpha>0 pixels
(fringe) take the shadow path's *blend* behavior but not the tint —
acceptable: they blend as an unshaded, ground-depth fringe (marginally
softer edges, an acceptable side effect recorded here). Misclassification
risk is limited to genuinely black object-edge texels, which get ground
depth ≈ their base depth — invisible in practice.

### D6 — Raised-height suppression in the shader

The batch's per-instance data already carries the placement height; shadow
pixels discard when `height != 0`. No CPU branch, no second batch; the
existing contact-shadow ellipses (which only appear for raised placements)
keep covering that case. Negative heights suppress likewise.

### D7 — Toggle lives on the document, flag rides provenance

Default on; disabling records `groundShadow: false` in provenance
(omitted at the default, per the `bake.tiles`/origin-anchor precedents —
no format bump; `/6` readers ignorant of the field ignore it). The toggle
is per-document (like path-trace settings), not per-slot; each slot's
shadow derives from its own presentation. It does not join bake presets
(presets capture the lighting look; the shadow is geometry-derived, not
environment-derived).

## Risks / Trade-offs

- [AA-fringe conflation (D5)] → blue-tint classifier + the harmless
  fringe side effect documented; `scratch-verify` hashes shift — re-baseline
  in the same change.
- [Rect growth eats texture-array space] → diffuse reach is bounded
  (footprint + blur radius); cap check warns before bake. If real-world
  assets prove too greedy, the decal-rect format path (D3 alternative) is
  the escape hatch.
- [Ground-depth substitution on fringe pixels in deep stacks] → rare;
  accept, and revisit only if visible artifacts appear (would push toward
  the D5 tint-only classification being strict).
- [Shadow pixels below the object's sort key interacting with the mesh
  batch] → meshes draw earlier with true depth and opaque blending; the
  shadow tests against them correctly. Verified in the scratch harness.
- [Boot-procedural bake divergence (no shadow)] → accepted; boot bake is
  a legacy bring-up path.

## Migration Plan

No data migration: old bundles load unchanged (no shadow pixels → class
never fires); re-bakes via provenance reproduce or drop the patch per the
flag. Rollback = revert; the format field is ignorable by design.
Verification: `npm run build`, `npm run verify:bundles` (extended),
`npm run verify:mesh` (untouched paths), `scratch-verify.html` re-baseline
for the render-hash shift; browser visual pass on shadow/sprite/mesh
interleaving left to the user.

## Open Questions

- Blur radius and strength defaults — tune visually during bring-up;
  constants only, spec pins nothing beyond "soft, fading to zero".
- Whether the decal grid resolution (currently planned ~32 px/unit before
  blur) needs to scale with `pxPerUnit` — decide on visual evidence.
