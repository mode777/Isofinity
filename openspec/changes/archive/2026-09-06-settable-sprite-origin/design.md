# Design: settable-sprite-origin

## Context

The anchor today is hardcoded: `frameIsoBox` projects `(0,0,0)` into
`originPx` (`src/bake/iso.ts:123-127`), every slot's bake re-anchors the
yaw-rotated model so the rotated box's min corner sits at the origin
(`applySlotModelRotation`, `src/bake/bake.ts:161-168`), and the world
compositor draws each sprite so its layer's `originPx` lands at the
placement's projected position (`WorldEditor.emit`,
`src/app/components/WorldEditor.tsx:440-455`). Per-view `originPx` already
flows end-to-end (manifest `sprite`/`views[]` → `SpriteLayer` →
`SpriteSet.origins`), so the only missing pieces are: authoring the point,
deriving it per slot, persisting it, and parameterizing the projection.
Landing semantics (the anchor lands at today's anchor spot — the placement
position) were decided with the user; see proposal.md.

## Goals / Non-Goals

**Goals:**

- One authored 3D anchor per sprite document, edited on the N view,
  automatically rotated for E/S/W.
- Anchor changes take effect on existing passes without a re-bake.
- Persist across save/open/re-bake via provenance; default preserves
  today's bytes and behavior exactly.

**Non-Goals:**

- Any runtime/world-editor code change (drawing, picking, erase, world
  files stay as they are).
- Per-slot manual anchors, viewport dragging, geometry-derived anchors.
- Preset support for the anchor (presets are bake looks only).

## Decisions

### D1 — Anchor semantics: the full 3D point lands at the placement position

The authored point is expressed in the **N view's asset space** (the
unrotated source box, min corner at `(0,0,0)`) and, at placement, the whole
3D point lands at the placement's projected position (cell min corner at
the placement height). An anchor above the ground therefore sinks the asset
by that amount at ground level — that is what makes Y meaningful (hanging
anchors). The projected `originPx` per view is the projection of the
slot-space anchor, so screen-space landing is exact.

*Alternatives rejected:* landing at the cell **center** (forces the default
anchor to become the ground-plane center and migrates every older bundle's
effective anchor — multi-cell assets visibly re-center; user chose
today's anchor spot); projecting only the ground-plane point (makes the Y
input dead — `originPx` would not depend on Y).

### D2 — Slot derivation: exact quarter-turn rotation mirroring `applySlotModelRotation`

For slot yaw `q·90°` and unrotated size `s = (sx, sy, sz)`, the authored
point `p` maps into the slot's asset frame exactly as the model does
(rotate about the unrotated box center, re-anchor at the rotated box
center):

- q=0: `(px, py, pz)`
- q=1: `(pz, py, sx − px)`
- q=2: `(sx − px, py, sz − pz)`
- q=3: `(sz − pz, py, px)`

Because slot yaws are always multiples of 90°, this is integer-coefficient
math — no drift, Node-testable. Helper `slotAnchorPoint(origin, size,
yawDeg)` lives in `src/shared/iso.ts` next to `yawRotatedBoxSize`, with the
same quarter-turn convention; `applySlotModelRotation` stays the runtime
authority for meshes (the helper mirrors its transform, and a views-verify
check pins the equivalence for box corners).

*Alternatives rejected:* per-slot independent origins (facing changes
would jump the anchor between different asset points); deriving E/S/W from
ground-center automatically (same jump unless N is also forced to
ground-center).

### D3 — No format bump: optional `origin` in the provenance block

`BakeProvenance` gains `origin?: [number, number, number]` (N-view asset
space). `buildManifest` writes it **only when it differs from `(0,0,0)`**,
so default-anchored bundles stay byte-identical to today's output and the
primitive bundle hashes in `scratch-verify` remain valid. The format string
stays `isoinfinity-bake/6` — the `bake.tiles` precedent (optional
provenance field, no bump); parsers already pass provenance through
field-by-field, so `/4`–`/6` tolerance is untouched and older builds that
accept `/6` keep loading new bundles (they read `originPx`, which is
already per-view data).

*Alternatives rejected:* bumping to `/7` (breaks forward-loading for a
purely additive optional field); storing the anchor per view entry
(it is one authored point, view-independent; per-view `originPx` already
carries the per-slot projection); storing fractions of the box extent
(scale-independent, but the user asked for a coordinate in units, and D5
rescaling covers scale changes).

### D4 — Editor state: persisted (layer 1), not preset-eligible

`BakeDocument.origin: Vec3 = [0, 0, 0]` — persisted state per ADR 0006's
layer model: it shapes bake output (`originPx`) and must survive
save/open. It rides in provenance (written by `provenanceOf`, restored by
the `decodeBundle` path; view-only documents keep the default and hide the
control). It is **not** part of bake presets — presets capture bake looks
(PT settings + environment), matching the deliberate texture-size
exclusion. Slot-gating of the inputs is UI-only (in-memory).

### D5 — Store action: clamp, derive live, rescale on scale change

`setBakeOrigin(docId, origin)` (in `src/app/store/bake.ts`):

1. Reject non-finite components (keep the previous value); clamp each axis
   into `[0, extent]` of the current scaled source box (same extent source
   the panel's pixel-size preview uses: `doc.gltf.extent × doc.scale` for
   models, the primitive size otherwise).
2. Update every baked view's `originPx` immediately — N from the authored
   point, E/S/W from `slotAnchorPoint` — using the same pure projection the
   bake uses (`frameIsoBox`/`projectBoxFrame` over each slot's stored
   `size`). Framing depends only on size/ppu/pad, so the passes are
   provably pixel-identical; no re-bake and no in-flight-pass discard (the
   anchor is not render-affecting).
3. Mark the document dirty.

The scale action rescales an existing origin by the scale ratio before
clamping, so the anchor keeps marking the same relative spot. Bakes
(`bakeRaster`, `renderSlot`'s implicit re-bake, `bakeAll`) pass
`doc.origin` into `bakePrimitive`, which applies `slotAnchorPoint` for the
slot's yaw and hands the point to `frameIsoBox`; the PT pass shares the
same frame. The bake clamps defensively (a restored document's source may
have changed extent).

### D6 — Projection parameterization

`frameIsoBox(size, pxPerUnit, padPx, azimuthDeg, origin?)` projects the
given point instead of hardcoded `(0,0,0)` (`iso.ts:123`); default keeps
today's value. `projectBoxFrame` gains the same parameter so the box
overlay's origin cross, the verification harness, and the bake share one
math path. Camera, framing, clip planes, width/height are untouched.

### D7 — UI: Origin section in the sprite properties panel

New section in `SpriteProperties.tsx` below Source: three numeric inputs
(X/Y/Z, asset units) + a "Set to ground center" button (`(sx/2, 0, sz/2)`
of the current scaled box). Editable only while `activeSlot === 'n'`;
other slots render the values read-only with a hint that the origin is set
in the north view. Hidden for view-only documents. Panel rules apply: the
inputs never start a bake or render pass (D5 makes a re-bake unnecessary
anyway). The Realtime 3D box overlay's origin marker
(`buildBoxOverlay`, `src/app/realtime.ts`) moves to the authored point
too, so the overlay marks the anchor in every view mode.

## Risks / Trade-offs

- [Erase/footprint vs drawn sprite diverge for non-corner anchors — a
  ground-center 1×1 asset straddles the cell corner, while erase and
  footprint picking stay cell-based] → Deliberate, pinned by spec
  (direction changes must not alter picking/erase); the ghost previews the
  drawn result WYSIWYG. Pixel-accurate erase is a separate future change.
- [Anchor outlives its source box (model file replaced by a smaller
  asset)] → Clamp at input, on scale change, and defensively at bake; the
  anchor stays finite and inside the box, though its relative meaning can
  shift — acceptable for an authored property.
- [Rounding drift between bake-time and re-derived `originPx`] → Both
  paths run the same deterministic pure projection over the same stored
  size; manifest rounding (1e-3 for `originPx`, 1e-4 for the provenance
  point) is applied only at write time.
- [Users expect the ground-center button to keep assets grid-aligned] →
  The button centers the asset **on the placement point** (pivot-friendly);
  the ghost shows the offset honestly. Recorded as the accepted trade-off
  of the user's landing choice.
- [Depth/occlusion interaction] → None: g-buffer depth is
  `dot(worldPos, viewDir)` of the baked pixels; the placement's depth
  offset uses the placement position — unchanged by the anchor.

## Migration Plan

None required: no format bump, no world-file change, default anchor
preserves bytes and behavior. Older bundles open with the box-corner
anchor; new bundles with the field load in any build that reads `/6`.
Rollback is trivial (the field is ignored if the code reverts).

## Open Questions

None — the landing-point question was resolved with the user before
planning (see proposal.md).
