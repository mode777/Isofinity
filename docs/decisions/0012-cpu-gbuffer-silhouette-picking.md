# 0012 — World-editor selection picks from the in-memory g-buffers on the CPU

Status: Accepted (2026-09, add-world-select-tool)

## Context

The world editor's Select tool needs to resolve which placement is under
the cursor. Ground-footprint picking (the erase rule) cannot do it: a
sprite must be selectable only where its baked silhouette is opaque, not
across its rectangular cell — clicking a sprite's transparent margin must
not select it. The renderer also already keeps two things that make a
pixel-accurate answer cheap: the baked g-buffer layers are resident in
memory for both the compositor upload and the CPU surface-snap read
(`surfaceSnap.ts`), and the fixed orthographic camera projects a
placement to screen pixels with the same `toPx` math picking already
uses. A GPU id/FBO pass would be the other obvious route.

## Decision

Sprite selection is resolved CPU-side from the document's in-memory
sprite set (`src/runtime/selection.ts`): the picker maps the cursor's
world-image pixel into each candidate placement's baked g-buffer,
requires a non-zero normal (the compositor's own hard-coverage test),
and compares `g.a + dot(VIEW_DIR, pos − anchor)` — the exact
per-fragment depth the shader writes — choosing the nearest. G-buffer-
empty pixels (including grounding-shadow fragments) are not selectable.
Characters and point lights are picked by screen-space proximity to their
projected anchor, and cross-kind candidates compare by depth. No GPU
readback or extra framebuffer is involved.

## Consequences

- Pixel-accurate sprite picking with no renderer surface: the picker
  reads the same buffers a frame was drawn from, and cannot drift from
  the compositor's coverage/depth semantics.
- The eraser uses the same picker as the Select tool (and previews its
  target with the same outline), so what a click selects is exactly what
  a click erases; the old ground-footprint erase rule is gone.
- The pick is deterministic and Node-testable (`npm run verify:selection`)
  against the same data, unlike a GPU readback.
- The renderer is untouched: no new attachment, no per-object id output
  in every geometry shader, no `readPixels` stall on click.
- Character/light picking is proximity-based, not silhouette-accurate;
  accepted (sprites are the common case) and documented as a non-goal.
- The picker depends on the padded-stride texel layout remaining shared
  with `surfaceSnap.ts`; both must change together if the upload layout
  changes.

## Rejected alternatives

- **GPU id/FBO pass**: truly silhouette-accurate for every kind, but adds
  a fourth render target, an id output threaded through every geometry
  program (sprite instance data, mesh uniform, ground), and a per-click
  readback stall — and it cannot be verified in this headless
  environment. The CPU path already gives the same accuracy for sprites.
- **Ground-footprint picking** (the erase rule): selects a whole cell and
  a sprite through its transparent margin — fails the pixel-accuracy
  requirement.
- **CPU triangle rasterization of the render pass alpha**: the render
  pass is antialiased (not hard coverage) and would select a sprite from
  its AA fringe; the g-buffer is the coverage authority (ADR 0002/0010).
- **Storing selection as an object reference**: not a stable store key,
  and inconsistent with the id-based mesh/light model; a runtime-only
  placement id (ADR 0006) is used instead.
