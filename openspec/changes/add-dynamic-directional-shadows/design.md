## Context

See `proposal.md` — Why. The design builds on state the engine already has:

- The deferred light pass (`src/runtime/renderer.ts`, ADR 0011) reconstructs
  each receiver's world position from `RT2` linear depth plus the fixed-camera
  frame (ADR 0001) and evaluates `ambient + key·N·L + point lights`.
- The runtime already holds every placed sprite's baked g-buffer as an
  in-memory half-float layer (`SpriteSet` in `src/runtime/assets.ts`) and
  already reconstructs world positions from it on the CPU for surface snap
  (`src/runtime/surfaceSnap.ts`) and pixel picking (`src/runtime/selection.ts`).
- The bake produces a single front-most surface per pixel, and the fixed
  isometric camera never changes. Alpha-mask materials leave empty g-buffer
  coverage; there is no hidden or back-side data.
- `src/bake/shadow.ts` currently bakes a direction-agnostic grounding patch
  into the render pass; the runtime classifies and composites it (ADR 0010).
  It remains in place for this change (see Non-Goals).

The defining constraint for the approach: a sprite's baked g-buffer is a
2.5D relief seen from one camera. It is a valid occluder for a light on the
camera's side and a poor one for a light behind or edge-on to it. The light
domain decision turns that into a guarantee.

## Goals / Non-Goals

**Goals:**

- Cast a direction-correct key-light shadow from sprite and mesh geometry
  reconstructed from data the engine already ships, with no bundle or world
  format change and no source-model decimation.
- Keep one shadow test for sprites, meshes, and the ground so their shadows
  compound seamlessly.
- Bound the key-light direction to a domain where the reconstructed relief is
  a well-conditioned occluder, and make the editor controls respect it.
- Work out of the box: no required per-asset or per-world shadow setup, and no
  mandatory tuning for the system to produce sensible shadows.

**Non-Goals:**

- Removing the baked grounding shadow, the per-placement shadow strength, or
  the `groundShadow` provenance toggle. Follow-on change (see Migration Plan).
- Overhangs / true 3D volumes (voxels, layered depth images, baked occluder
  proxies). Recorded as future work.
- Point-light shadows, soft/area shadows, cascades, and any bake-pipeline
  format addition.

## Decisions

### D1 — Occluder representation: a world-space vertical height field

Unproject each placed sprite's covered g-buffer texels to world positions
(applying the placement offset, as `surfaceSnap.ts` does), then splat the
maximum surface height per ground cell into a world-space height texture.
Meshes add a second, per-frame height texture (their animated geometry).
The shadow march samples `max(staticHeight, dynamicHeight)`.

Alternatives considered:

- **Voxel grid / layered depth image (LDI).** Handles overhangs and arches,
  but costs far more memory and needs a 3D DDA in WebGL2, and a single-layer
  g-buffer only populates the front shell regardless. Lost to cost/risk; the
  domain constraint makes a single layer acceptable. Future upgrade.
- **Baked occluder proxy mesh per asset.** Highest fidelity and removes the
  2.5D limit, but requires a new bundle pass/format and source-model
  simplification. Decimation is actively wrong for alpha-card foliage (grass),
  and the shipped g-buffer already *is* a resampled occluder. Lost to
  pipeline cost and the foliage failure mode.
- **Light-space shadow map rasterized from reconstructed geometry.** See D2.

In-memory/engine state only: the height field is rebuilt from loaded bundles
and is never serialized (ADR 0006).

### D2 — Technique: per-pixel ray march in the deferred pass, not a shadow map

Extend the deferred light pass with a height-field DDA: from each receiver's
reconstructed world position, march horizontally along the key light's
horizontal direction, comparing the ray's rising height against the field.
Visibility is binary (hard shadow) with a small normal-offset bias; the key
term is multiplied by it.

Alternatives considered:

- **Light-space depth map from reconstructed geometry.** Direction-dependent,
  so every sun move re-rasterizes all reconstructed sprite geometry; at low
  sun the ortho frustum must cover ~10× object heights, blowing up resolution
  and causing peter-panning; point-splatting the relief into it leaves holes.
  Lost on low-sun quality and per-move cost.
- **Precomputed horizon map (per-cell max elevation by azimuth).** Cheapest at
  runtime and interpolates smoothly, but bakes azimuth discretization into
  the world and still needs a separate dynamic-mesh path. The ray march is
  direction-continuous, shares one code path with the mesh layer, and is
  cheap enough for one light. Kept as a performance fallback (Open Questions).
- **Screen-space ray march (SSS) against `RT2`.** Uses the existing screen
  g-buffer and no build step, but only knows the camera-visible frame: at
  isometric sun angles long shadows leave the screen and leak badly. Lost.

### D3 — Light domain: a cone around the camera view ray plus an elevation floor

The key-light direction (toward the light) is constrained so the angle to the
camera's view direction (toward the camera, `VIEW_DIR`) is at most a constant
`MAX_OFF_AXIS_DEG` (default **65°**) and its elevation is at least
`MIN_ELEVATION_DEG` (default **10°**). Out-of-domain values clamp to the
nearest valid direction; the same clamp wraps the sun-position computation
(`src/shared/sun.ts`) and the editor controls.

Rationale: the relief is well-conditioned when the light comes from the
camera's side. The cone keeps every allowed direction in that hemisphere and
away from grazing, while the floor keeps the sun off the horizon (long but
finite shadows). There is a genuine tension: light near the camera axis makes
shadows hide behind objects (less readable), light near the ±65° edge makes
them visible but lowers relief fidelity. 65° is the chosen balance; both
constants are single-source tunables so they can move without a spec change
(the specs say "configured", not a literal).

Alternatives considered:

- **The discussed 5° altitude / 170° arc.** 5° produces ~11× shadow lengths
  and the arc ends sit nearly edge-on to the relief — precisely the
  ill-conditioned cases. Lost as too permissive.
- **Separate azimuth and elevation ranges.** Equivalent in effect but the
  conditioning property is inherently angular; one cone bound expresses it
  directly and cannot be violated by an unlucky az/el combination.

### D4 — Mesh compounding: a per-frame dynamic layer sampled by the same march

Mesh geometry feeds the same height field through a dynamic layer updated each
frame from the CPU pose engine's world-space vertices, and the march samples
`max(static, dynamic)`. Sprite and mesh shadows therefore resolve as a union
along the same direction from the same receiver; no separate overlay and no
double darkening.

Alternatives considered:

- **Ray/triangle test against a per-character BVH.** Exact for overhangs but a
  second, differently-biased test that can seam against the sprite field.
- **Rendering meshes into a light-space map and compositing.** Reintroduces
  D2's direction-dependence for only the characters.
- **Multiplying the two visibilities.** Squared darkening where shadows
  overlap — explicitly rejected by the spec.

### D5 — Build and update triggers

The static field rebuilds on world load and after any placement edit; the
dynamic layer updates every frame a mesh exists. Build on the CPU (chunked
off the render path) reusing the `surfaceSnap.ts` reconstruction and the
`SpriteSet` layer data, uploaded to an `R32F`, `NEAREST` texture; this keeps
the math Node-verifiable in the house style. A GPU point-splat build is the
performance upgrade if CPU rebuild cost shows on large worlds.

### D6 — Zero-tuning defaults; no new author controls

The shadow system is fully automatic: it derives its occluder from whatever
bundles a world already references, clamps the light into the valid domain,
chooses the field resolution from the ground extent under a fixed texel
budget, and rebuilds on its own. No new property, toggle, bake action, or
world field is introduced for shadows, and placement height/facing/origin
already feed the build as they feed rendering.

Consequently the only author-visible inputs are knobs that already exist:
the bake's material alpha mode, the origin anchor, model scale, the view
slots, the grounding-shadow bake toggle, and the environment. None of them is
required to turn shadows on; they only affect fidelity. The environment and
foliage interactions are documented as caveats rather than gated behind new
settings (see Risks).

Alternatives considered:

- **Per-world shadow toggle / quality setting.** Adds UI and a world field for
  no default benefit; the Dynamic-light switch already forces the identity
  frame. Lost to the zero-tuning goal.
- **Per-asset shadow-caster flag / shadow resolution control.** Requires a
  manifest or provenance field and author decisions; the g-buffer at the
  fixed `PX_PER_UNIT` is enough for the first cut. Lost to format simplicity.

## Risks / Trade-offs

- **[Long CPU rebuild on large worlds]** → cap field resolution to a texel
  budget (e.g. ≤ 2048²) scaling cells-per-unit to the ground extent; rebuild
  asynchronously; upgrade to GPU splat if needed.
- **[Per-pixel march cost]** → early-out when the ray clears a stored field
  maximum, cap march distance to the field bounds, and offer a half-resolution
  shadow if profiling demands it (Open Questions).
- **[Shadow acne at silhouettes / AA fringe]** → normal-offset bias plus the
  existing half-precision depth caveat; acceptable hard-shadow artifacts are
  bounded by the domain constraint.
- **[Overhangs and arches shadow incorrectly]** → accepted and documented;
  the domain constraint keeps the single-layer approximation defensible.
- **[Double shadows with baked HDRI sun]** → the path-traced render pass may
  already carry a hard sun shadow. Document a bake-guidance note
  (`docs/bake-pipeline.md`) that dynamically-shadowed worlds should bake with
  a sunless/overcast environment; the existing grounding-shadow toggle also
  lets a bake omit its baked patch while the system is proven.
- **[Losing contact darkening if the grounding shadow is later removed]** →
  out of scope here; recorded so the follow-on change plans a contact/AO term.

## Migration Plan

No data migration: no bundle or world-file field changes, and the occluder is
runtime-derived. Deployment is a normal editor release; the shadow test is
inert when the dynamic-light switch is off or the occluder is empty, so the
pre-change look remains reachable. Rollback is reverting the change. The
follow-on that removes the baked grounding shadow is gated on visual
verification of this system.

## Open Questions

- Whether the per-pixel march meets the frame budget at the default field
  resolution, or should ship at half resolution / fall back to a horizon map.
- Whether to expose a user-facing shadow toggle independent of the
  dynamic-light switch (defaulting on) once the look is settled.
