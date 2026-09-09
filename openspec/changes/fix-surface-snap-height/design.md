## Context

Surface snap reconstructs a world-space height CPU-side in
`effectiveHeight` (`src/app/components/WorldEditor.tsx:335`): it finds, per
covering placement layer, the g-buffer texel under the cursor, picks the
max composite depth, and computes
`y = v·SCREEN_UP[1] + (d + VIEW_DIR·(p − a))·VIEW_DIR[1]` where `d` is the
baked depth and `(p − a)` is placement position minus sprite anchor. The
result overshoots: hovering the top of a unit cube yields more than 1,
while manual input of `1` lands correctly. See proposal.md for motivation.

Relevant invariants: baked g-buffer alpha is linear ray depth
(`depth = dot(worldPos, viewDir)`, docs/bake-pipeline.md); the compositor's
anchor convention is that the baked depth field is measured from the box
corner while the image is drawn from the anchor, so consumers subtract
`dot(VIEW_DIR, anchor)` (docs/runtime.md, "Per-pixel occlusion stays
truthful for anchored sprites"); per ADR 0006, editor chrome state is
in-memory only and never serialized.

## Goals / Non-Goals

**Goals:**
- Surface snap reads the exact visible-surface height (unit cube top → 1).
- The read height is visible in the toolbar height field while snap is on.
- One reconstruction convention shared conceptually with the compositor's
  depth handling, verified against an analytic case.

**Non-Goals:**
- No bake pipeline, format, or depth-semantics change.
- No click-to-pick eyedropper tool; snap stays a live hover behavior.
- No change to character (mesh) snap semantics beyond inheriting the fixed
  read.

## Decisions

### D1: One reconstruction convention, verified against analytic cases

Diagnosis outcome (task 1.1, updated during apply): the design's original
hypothesis — a double-count/mis-reference of the placement height — was
**refuted**. Static derivation proves the shipped formula is an exact
identity: the screen basis {SCREEN_RIGHT, SCREEN_UP, VIEW_DIR} is
orthonormal, so any world point decomposes as
`q = u·SCREEN_RIGHT + s·SCREEN_UP + d·VIEW_DIR` with `d = dot(VIEW_DIR, q)`
the baked linear ray depth; hence `q.y = s·SCREEN_UP[1] + d·VIEW_DIR[1]`
exactly, and the anchor correction `VIEW_DIR·(p − a)` matches the
compositor's convention. Cross-placement depth "contamination" also
reconstructs correctly (the winning texel's surface point lies on the
cursor's view ray).

The actual defect was found in the data path: `effectiveHeight` indexed
the sprite set's **padded** g-buffer arrays (`layersToSet` pads every
layer to `maxW×maxH` for the GPU texture array) with the layer's own
width as row stride. With a single loaded asset (`maxW == w`) the pick is
correct; with any wider layer loaded, the row index drifts and the pick
reads the wrong texel — wrong depth, wrong height (the reported
overshoot). The fix indexes with `set.maxW`, matching the GPU upload.

The logic is extracted verbatim-plus-fix into `src/runtime/surfaceSnap.ts`
(`surfaceHeightAt`), a pure framework-free function shared by the editor
and the verification harness, so bake-time and runtime reconstruction
cannot drift (same principle as `reconstructWorldPos()`).

Verification (acceptance cases): a unit cube placed at height 0, cursor
over its top face → read 1 (within half-texel parallax ≈ 0.007 and
half-float depth precision); the cube stacked at height 1 → top face
reads 2; over empty ground → 0. Checked two ways: a Node-runnable
synthetic-g-buffer script (analytic cube + a wider slab layer that
exercises the padded stride — the old stride demonstrably fails it) and a
permanent `scratch-verify` spike against the real browser bake chain
(`bakePrimitive` → `bakeFloatToHalf` → `layersToSet` →
`surfaceHeightAt`).

Alternatives considered:
- Snap to the placement's own logical height (read `p.y + assetHeight`
  from placement metadata instead of pixels) — rejected: only correct for
  box-tops, wrong for slopes/irregular assets, and abandons the baked
  position data that is the project's core design constraint.
- GPU picking pass (render depth at cursor on demand) — rejected: the
  CPU-side g-buffer read already exists and is correct in principle;
  adding a GPU path duplicates the convention and costs a frame.

### D2: Eyedropper-style display, one read per hover, stored height untouched

Compute the snap read once per pointer position (where `effectiveHeight`
is already called for ghost/placement), publish it as a transient
per-document in-memory field (e.g. `snappedHeight: number | null`) in the
world editor store, and have the toolbar height field display it when
surface snap is on. The stored brush height (`heightLevel`) is never
written by snap — toggling snap off restores it. Per ADR 0006 this field
is editor chrome: never serialized into `isoinfinity-world/1` files.

Alternatives considered:
- Writing the read into `heightLevel` (true eyedropper) — rejected by the
  user-visible contract: the stored height must apply again when snap goes
  off, and overwriting it during a mere hover would destroy it.
- Showing the read in a tooltip/status bar only — rejected: the height
  field is where the user compares and enters heights; showing it there
  makes the snap value directly comparable with manual input.

### D3: Keep per-layer texel picking, harden it

Keep the per-placement layer lookup, texel hit test, normal-zero
emptiness check, and max-composite-depth resolution. Sampling uses the
same `toPx`/anchor math as the draw path (they must not drift). Any
half-texel edge discrepancy found during the fix is resolved by matching
the draw path's texel convention exactly, not by special-casing.

### D4: Anchor-under-cursor placement (follow-up from browser verification)

Browser verification surfaced a second, pre-existing defect (not a
regression of this change): the ghost and placements took their x/z from
the cursor ray's intersection with the **ground plane**, then applied the
height — so at any non-zero height the anchor projected up-screen away
from the cursor. Fix: the anchor position is the cursor ray intersected
with the horizontal plane **at the effective height**
(`groundAtHeight`: solve the ground-basis inverse with `s − y·UP1`), used
by the ghost and every placement path (mouse click/drag, touch tap/drag).
At height 0 this is byte-identical to the old behavior; the eraser keeps
ground-plane footprint picking. Spec-wise this replaces the ghost
requirement's "centered on the cursor's ground position" with the
anchor-under-cursor ray-plane rule (delta updated accordingly) — it
strengthens the existing cursor-exact anchor placement intent rather
than changing the placement model.

## Risks / Trade-offs

- [Half-float depth precision gives 1 ± ε rather than exactly 1] → Accept
  within bake/render numeric precision; the spec allows it. If ε is
  visible in the height field display, round the *displayed* value only.
- [Authored origin anchors (provenance) shift the depth reference] → The
  anchor correction must use the layer's `spriteSet.anchors[li]` exactly
  as the draw path does; the stacked-cube verification case covers the
  default anchor, and an anchored-asset case is checked manually in the
  browser.
- [Publishing hover state to the store per mouse move could cause React
  churn] → The height field is a small controlled component; only update
  the store when the read value changes beyond display precision.
- [Fix verified by Node synthetic check + a scratch-verify spike; visual
  hover behavior still needs the user's browser] → The scratch-verify
  spike runs the real bake chain in the browser; the hover/ghost/height
  field walkthrough remains for the user.

## Migration Plan

Single PR, no data migration: no format change, no saved-state change.
Rollback is a revert.

## Open Questions

(none)
