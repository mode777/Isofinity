## Context

The authored origin anchor (ADR 0008) is authoring state, not framing
state: `frameIsoBox` frames the box from its corners and camera center and
uses the `origin` argument only to compute `originPx`
(`src/bake/iso.ts:61-157`).

**Root cause — verified with Node-runnable simulations of the exact math
the code runs (September 2026):**

1. **The bake is order-invariant.** Simulating both authoring orders for
   N/E slots with the grounding shadow on and off, the sprite rect,
   camera projection/world matrices, and `originPx` are bit-identical
   whether the anchor is authored before or after the bake. The pixels a
   bake produces depend only on (source, ppu, slot, grounding shadow) —
   never on `doc.origin`.
2. **The 2D bounding-box overlay is projected with a different framing
   rule than the bake.** `SpriteEditor.tsx:186-196` calls
   `projectBoxFrame(size, ppu, PAD_PX, azimuth, anchor)` — omitting the
   grounding-shadow pad — while the bake frame unions the projected box
   with the ground rect when `doc.groundShadow` is on
   (`src/bake/iso.ts:88-113`). Grounding shadow defaults to ON
   (`src/app/store/bake.ts:137`), so for a 2×1×0.5 asset at 64 px/unit
   the overlay's box and origin cross land ~22.5 px away from the baked
   pixels (bake rect 162×127 vs overlay rect 117×116), and the model
   reads as off-center in the sprite.
3. **The realtime 3D view frames without the pad** (`realtime.ts:257`,
   `frameIsoBox(boxSize, 128, PAD_PX)`), so it matches the *unpadded*
   framing the overlay draws — hence the report "offset … unlike the 3d
   realtime view".

The perceived order dependence follows: baking first and then setting the
origin is judged by watching the image *not move* (which is correct), while
authoring the origin first is the first time the freshly baked sprite is
compared against the overlay — which is always offset while the grounding
shadow is enabled.

## Goals / Non-Goals

**Goals:**

- Order independence: bake→author-origin and author-origin→bake yield
  identical passes and recorded origins, verified by a Node-runnable check.
- Overlay alignment: the 2D bounding-box overlay uses exactly the framing
  rule the stored passes were baked with (pad including the grounding
  shadow, slot size, slot yaw).
- Keep bundles byte-stable (`isoinfinity-bake/6`, no format bump).

**Non-Goals:**

- Changing what the anchor means, how it clamps, or how placement consumes
  `originPx` (ADR 0008 stays as-is).
- Reframing the bake around the anchor; the anchor must never move pixels.
- Fixing realtime-view or world-rendering behavior beyond the overlay.

## Decisions

- **Fix the overlay, not the bake.** The grounding-shadow pad in the bake
  framing is correct (the shadow must fit inside the sprite) and the bake
  is proven order-invariant; the overlay is the side that mis-projects.
  `SpriteEditor` passes the same pad the bake used —
  `doc.groundShadow ? groundShadowPadPx(passes.result.pxPerUnit) : 0` —
  into `projectBoxFrame`; the slot's stored `result.size`/`pxPerUnit`
  stay the source of truth. *Alternative*: store the frame rect in the
  bake result — more state, format-adjacent, unnecessary while the
  framing rule is deterministic.

- **Pin order invariance as a Node-runnable regression check** in
  `views-verify` (`npm run verify:bundles`): (1) `frameIsoBox`/
  `projectBoxFrame` return identical rect and camera for default and
  non-default anchors; (2) a non-default anchor moves `originPx` while
  the projected edges stay fixed; (3) per-slot anchor projections match
  `setBakeOrigin`'s re-projection math with the ground-shadow pad on and
  off; (4) the overlay projection (pad included) reproduces the bake
  frame's box-corner pixel exactly. *Alternative*: browser-only checks in
  `scratch-verify` — not runnable as a gate in this environment.

- **Confirm the user-visible repro is resolved in the browser before
  closing.** The static analysis is high-confidence but the original
  report described an order dependence the bake path provably lacks;
  the reproduction step in `/scratch-verify.html` (both orders, shadow
  on/off, overlay on) verifies the fixed overlay removes the offset. If
  the reporter still sees an order-dependent offset with the overlay
  fixed, the diagnosis reopens with the overlay hypothesis eliminated.
  *Alternative*: skip browser confirmation — rejected, the report's
  order asymmetry is not fully reproducible statically.

## Risks / Trade-offs

- [The reported order dependence is not reproducible in the bake path —
  the reporter may still see it after the overlay fix] → The order
  invariance is pinned by the `views-verify` checks, and the browser
  reproduction step asks the reporter to re-test both orders with the fix
  applied; if it persists, the overlay hypothesis is eliminated and the
  diagnosis reopens with a much smaller search space.
- [Fixing the overlay shifts it for existing grounding-shadow documents]
  → That is the intended correction: the overlay starts matching the
  pixels it was always meant to annotate. No stored data changes.
- [The realtime preview frames without the shadow pad, so 2D and 3D views
  still frame slightly differently] → Accepted for now: the realtime view
  is a fitting preview at its own ppu, not a pixel-exact pass preview.
  If exact comparability is wanted later, give the realtime frame the
  same pad rule as a follow-up (out of scope here).

## Migration Plan

Pure editor-behavior fix; no data migration. Bundles saved before and
after remain valid and byte-stable. Rollback is a plain revert.

## Open Questions

- None blocking. The bake path's order invariance is proven statically;
  the one genuinely open item — whether the reporter still perceives an
  order-dependent offset once the overlay matches the bake framing — is
  covered by the browser confirmation task and does not change the specs,
  the approach, or the task breakdown.
