## Context

See `proposal.md` for motivation and the spec deltas for required behavior.
The relevant current state:

- The ground is one world-space quad with its own program
  (`src/runtime/renderer.ts`), sampling one tiled `diffuse`, `normal`, and
  `arm` map at `uv = vWorldPos.xz * uTileScale`. It writes a display texel
  (albedo·AO through the SH term and ACES), the surface normal + linear
  depth, and its window depth; the deferred light pass then multiplies the
  dynamic factor (`runtime-ground-rendering`).
- Ground materials are zip files parsed by `src/app/groundMaterial.ts`
  (`diff`/`diffuse`, `arm`, `nor_gl`), decoded onto `GroundState.maps` — an
  engine object never serialized (ADR 0006).
- `GroundState` persists `material`, `tileScale`, `width`, `depth` in
  `isoinfinity-world/7` (`src/app/worldFile.ts`).
- World tooling is a string tool id, a projected overlay batch for chrome
  (`lightRing` is the model for a ground-plane radius ring), per-document
  in-memory tool/brush state, and a `HistoryStack` of closure command pairs
  (`src/runtime/history.ts`).
- `writeWorkspaceFile` already accepts `Uint8Array`, and PNG encoding via
  canvas exists in `src/bake/export.ts`.

## Goals / Non-Goals

**Goals:**

- Four simultaneously bound materials with per-pixel painted coverage, in a
  representation that survives save/load and stays under WebGL2's guaranteed
  fragment texture-unit budget.
- Painting that behaves like a standard paint tool: soft/hard brush,
  continuous strokes, replace semantics, undoable per stroke.
- Natural material seams from displacement maps, without moving geometry.

**Non-Goals:**

- Geometric displacement, parallax, tessellation, terrain shadows.
- More than four simultaneously bound materials.
- Any change to the bake pipeline or sprite bundles.
- A persistent CPU mirror of the coverage texture (kept only transiently for
  readback/encode).

## Decisions

### D1. Four material slots, one global tile scale

`GroundState.materials` is a length-4 array of material names (or null),
replacing the single `material`. A single `tileScale` applies to all slots
(the user chose global), so the ground shader computes one UV per pixel and
samples every material at it.

*Alternative rejected:* per-material tile scale — more correct for mixed
texel densities but adds per-slot UV state and UI for no requested benefit.

### D2. Splat representation: RGB stores slots 0–2, alpha derives slot 3

The coverage texture is RGBA8, world-space, `CLAMP_TO_EDGE`, sampled at
`splatUv = vWorldPos.xz / vec2(width, depth)`. Slots 0/1/2 live in RGB; slot
3 is `1 - (r + g + b)`. The persisted PNG writes that derived value into
alpha so the file round-trips as a normal RGBA image.

*Why:* the single-draw GPU paint path (D3) can only produce a
normalized-replace stamp when the painted channel is one of RGB, because
fixed-function blending cannot scale all four channels by `(1 - a)` while
writing a different value into alpha-as-material. Storing three weights and
deriving the fourth keeps all four materials, keeps the stamp to one draw,
and keeps the invariant `sum(w) = 1` for free (the derived channel closes
the partition).

*Alternative rejected:* four fully independent painted channels — correct
but needs either a CPU stamp loop or a ping-pong FBO plus readback plumbing.
*Alternative rejected:* store coverage in RGB only and reconstruct slot 3 in
the shader but keep alpha unused — loses RGBA round-trip in the PNG; the
derived-alpha write is cheap.

### D3. Paint stroke = one blended draw per dab

Each dab draws a small quad over the splat FBO with
`blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`, source color
`e_c.rgb = (c==0, c==1, c==2)` (zero for slot 3), and source alpha
`falloff * opacity`. The result is `w.rgb <- a·e_c.rgb + (1-a)·w.rgb`,
exactly the replace lerp; painting slot 3 uses `e_c.rgb = (0,0,0)`, which
drops RGB and thus raises the derived slot 3. `gl.colorMask` disables the
alpha write during painting; alpha is regenerated from RGB when the
coverage is encoded for save.

*Why:* a single standard blend draw, no ping-pong texture, no JS per-pixel
work, and correct replace semantics for all four slots.

*Alternative rejected:* CPU stamping into a `Uint8Array` + `texSubImage2D` —
simplest to reason about and gives a free mirror, but a per-pixel JS loop
over large brushes is avoidable work; kept in reserve only if the GPU path
proves problematic.
*Alternative rejected:* coverage multiplier / layer-stack semantics — tints
rather than replaces, contrary to the chosen behavior.

### D4. Material sampling: four texture arrays + splat

The renderer uploads four `TEXTURE_2D_ARRAY` textures (diffuse, normal, arm,
displacement), each with four layers (one per material slot), plus the splat
— five texture units. Materials are normalized at load so every layer of an
array shares size and format (RGBA8); the diffuse array is sRGB. The
displacement map is optional per material (missing layer = neutral height).

*Why:* four materials × four maps as separate samplers is 16 + splat = 17,
over WebGL2's guaranteed 16 fragment units. Arrays fit in 5. The user
confirmed all materials have the same size, so array assembly does not need
resampling in the normal case.

*Trade-off accepted:* EXR diffuse maps are converted to 8-bit sRGB, losing
HDR ground radiance (the user accepted this).
*Alternative rejected:* composite prepass — keeps HDR and bounds units, but
adds a render target and a second blend stage for a capability we do not
need.
*Alternative rejected:* packing displacement into arm alpha and compressing
normals — fits 16 exactly without a prepass, but custom decode is fragile
and constrains future map additions.

### D5. Height-seam blending in the ground shader

For each material `i`:

```
w  = vec3(splat.rgb);        w3 = 1 - (w.r + w.g + w.b)
h_i = disp_i (or 1 when absent)
wf_i = w_i * max(h_i * uHeightScale + uHeightBias_i, 0)
wf  = wf / max(sum(wf), 1e-4)
albedo = sum wf_i * diff_i
N      = normalize(sum wf_i * nor_i)   // tangent space, then existing transform
ao     = sum wf_i * arm_i.r
```

A global additive height offset cancels in the normalization, so only a
per-material bias shifts a seam; at full coverage height is irrelevant, so
it edits only the transition band. Displacement never moves geometry.

*Alternative rejected:* coverage multiplier by displacement (dims a material
everywhere) — the user chose height seams.

### D6. Splat resolution, orientation, and data-texture decoding

Fixed texels per world unit (default 16), clamped so the largest ground
(128 × 128) stays within a sane texture size; the resolution is recorded in
the world file so a reload can recreate or resample the texture. UV derives
from world xz; with `UNPACK_FLIP_Y_WEBGL` off, PNG row 0 is `z = 0`. The
splat is loaded as data: `createImageBitmap` with `premultiplyAlpha: 'none'`
and `colorSpaceConversion: 'none'` so RGB/alpha are not transformed.

### D7. Material slot binding and coverage lifetime

Binding or rebinding a slot keeps that slot's painted coverage (the shape
re-renders with the new material). Clearing a slot resets its coverage.
An unbound slot's coverage is forced to zero in the shader (so it is
ignored in the partition) and painting it is a no-op with a notice. Slot 0's
material is the default; a ground with no bound slot shows the flat
checkerboard as today (painting requires at least one bound slot).

### D8. Persistence: `/8` world + coverage PNG sidecar

`buildWorldFile`/`parseWorldFile` move to `isoinfinity-world/8`:
`ground.materials` (array, omitted when all null) and `ground.paint`
(`{ file, texelsPerUnit }`, omitted when nothing is painted). The coverage
PNG is written beside the JSON in `worlds/`, named from the world name, and
referenced from the JSON so imported/downloaded worlds can carry arbitrary
names. Save writes the PNG and the JSON; load resolves the PNG, tolerating a
missing/unreadable file by falling back to slot 0 over everything with a
notice. `/1`–`/7` still load; a `/7` single material becomes slot 0. Without
a workspace, painting is session-only with a notice (matching the material
fallback precedent).

### D9. Per-stroke undo via dirty-rect snapshots

A stroke is one `HistoryCommand`: on pointer up, the pre-stroke coverage of
the stroke's bounding rectangle (captured before the first dab via
`readPixels`) and the post-stroke rectangle are held; `undo()` re-uploads
the before-rect, `redo()` the after-rect, via `texSubImage2D`. `HistoryStack`
is reused unchanged.

*Trade-off accepted:* a full-ground stroke snapshots the whole texture; rect
snapshots keep typical strokes small.

### D10. Ground resize resamples coverage

`setGroundSize` reads the current splat back, scales it through a 2D canvas
to the new texel dimensions (fixed texels/unit), and re-uploads, so painting
keeps its relative position. Failing a readable readback, the coverage falls
back to slot 0 everywhere (a notice).

### D11. Tool, brush, and gizmo (in-memory editor state)

A new `TERRAIN_PAINT_TOOL_ID` joins the viewport tool bar. Brush radius is in
world units; hardness in [0,1] maps to an inner radius (hardness 1 = hard
edge, hardness 0 = full soft edge); dabs are spaced at a fraction of the
radius and interpolated between pointer events so fast drags do not gap.
The gizmo draws an outer radius ring and an inner hardness ring using the
existing projected ground-plane circle technique (`lightRing`). The tool id,
radius, hardness, and active slot are in-memory editor state and SHALL NOT be
serialized (ADR 0006).

## Risks / Trade-offs

- [16-bit displacement PNGs may not decode through `createImageBitmap`] →
  treat as a load notice and fall back to neutral height; verify with sample
  displacement maps.
- [Coverage PNG default (`r=1`, `a=0`) looks like a transparent red image in
  an external viewer] → document it; the file is a data texture, and alpha is
  the derived slot-3 coverage.
- [Height-seam blend can read as speckle at some scale/bias] → expose
  `uHeightScale`/bias as tunables; do a manual browser pass and a golden
  sample if needed.
- [Splat readback/encode stalls the frame on large strokes] → snapshot only
  the stroke's bounding rect, and encode on save rather than per stroke.
- [Two-file save is not atomic: JSON and PNG can desync] → write the PNG
  before the JSON and report a failure without marking the document clean.
- [Texture arrays require equal size/format; a mismatched material would
  break the array] → resample to a common size at load and report a notice;
  the equal-size case is the expected path.
- [Blending tangent-space normals then transforming can bias the normal] →
  composite in tangent space, then renormalize through the existing
  analytic-tangent transform.
- [EXR diffuse downconversion loses HDR] → accepted; a composite prepass is
  the escape hatch if HDR ground diffuse becomes required.
- [No browser in this environment] → verify `/8` round trip and `disp`
  matching with Node-runnable checks and `npm run build`; leave paint/blend
  visuals to the user.

## Migration Plan

No data migration: old worlds load through the existing legacy path. Rollout
is additive (new tool, new fields); rollback is reverting the change, after
which `/8` files fall back to the unknown-format error while `/7` files
continue to load. No bake-bundle or workspace-layout change.

## Open Questions

- Exact default texels per world unit and the maximum texture budget
  (starting point: 16, clamped to 2048).
- Default `uHeightScale` and per-material bias values — tune by eye during
  implementation; they do not change the spec or task breakdown.
- Whether displacement should later drive real parallax is deliberately
  deferred and out of scope.
