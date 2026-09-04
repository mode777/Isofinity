# Design — add-multi-view-bake

## Context

The bake pipeline is hardwired to one camera: `ISO_AZIMUTH_DEG = 45`
(`src/shared/iso.ts`) feeds `frameIsoBox` (`src/bake/iso.ts`), which both
the raster g-buffer bake (`src/bake/bake.ts`) and the path tracer's frame
(`src/bake/pt.ts:243,288`) derive from `ISO_VIEW_DIR`. Depth is encoded as
`dot(worldPos, viewDir)` against that same constant. Bundles are
`isoinfinity-bake/5`: one g-buffer EXR + optional render PNG, top-level
manifest camera/sprite/passes, provenance (`src/bake/export.ts`,
`src/bake/bundle.ts`). `BakeDocument` holds a single `result`/`render`
pair; `decodeBundle` maps a bundle back onto those shapes; world
placement and the runtime consume only that pair.

Motivation: see proposal.md — Why.

## Goals / Non-Goals

**Goals:**

- Parameterize the bake camera by azimuth so every existing pass type can
  render from any of four fixed slots with one code path.
- Keep the N view byte- and behavior-compatible with today's output so the
  world editor, runtime renderer, and `Place in world` keep working
  unchanged off the same fields.
- A `/6` bundle that a `/5`-era consumer could almost read: N stays
  top-level and canonically named.

**Non-Goals:**

- World placement orientation / runtime selection of non-N views (later
  change); `SpriteLayer` and world code stay single-view.
- Arbitrary camera angles; slots are fixed at 90° yaw steps.
- Retargeting the realtime 3D preview camera beyond following the selected
  slot's azimuth.

## Decisions

### D1 — Slot model: azimuth parameter, not rotated geometry

`VIEW_SLOTS = ['n','e','s','w']` (shared module next to `iso.ts`), with
`slotAzimuthDeg(slot) = ISO_AZIMUTH_DEG + 90 * index` — E/S/W add
+90°/+180°/+270° to the azimuth parameter, elevation untouched. The
camera rotates; the asset never does, so the box stays `(0,0,0)`-anchored
and normalization/provenance are view-independent. Alternative considered:
rotating the mesh per view — rejected (moves the origin anchor, breaks
provenance scale/size semantics for no gain). If the turntable direction
feels backwards in review, flipping the sign changes only this constant —
no format impact.

`frameIsoBox(size, pxPerUnit, padPx)` gains an optional
`azimuthDeg = ISO_AZIMUTH_DEG` parameter (projected-corner loop already
uses the camera matrix, so framing per slot falls out). The raster bake
and `PtBaker.setPrimitive` take the slot's azimuth; the g-buffer shader's
depth encoding gets the per-view `viewDir` as a uniform instead of the
baked-in constant. Editor-side geometry helpers
(`reconstructWorldPos`, `projectBoxFrame`, box overlay) get the same
parameter so the overlay matches the displayed slot.

### D2 — Document state: N keeps `result`/`render`; extra views beside

`BakeDocument` gains:

- `extraViews: Partial<Record<'e'|'s'|'w', { result: BakeResult; render: PtImage | null }>>`
- `activeSlot: 'n'|'e'|'s'|'w'` (editor-only, like `view`/`viewTransforms`)

N's passes stay in the existing `result`/`render` fields, so
`resultToLayer`, `Place in world`, `bundleBytes` save-as, and every world/
runtime consumer are untouched. A `viewPasses(doc, slot)` helper is the
single switch the viewport, switcher colors and bake actions go through.
Bake actions take the slot; `bakeRaster`/`runRenderPass` write into
`result`/`render` (n) or `extraViews[slot]` (others) and invalidate only
that slot. Alternative considered: full `views: Record<slot, …>` map —
rejected: rename churn across every consumer for zero behavior gain.

### D3 — Bake All reuses the single-view bake per slot

Bake All is a sequential loop over `['n','e','s','w']` calling the same
per-slot path `runRenderPass` uses (implicit g-buffer re-bake + PT
render), before each iteration setting `activeSlot` so the viewport
follows. It rides the existing `renderGen` cancellation token: a settings
change mid-batch discards the current pass, and the loop checks the token
before starting the next slot and aborts. A failed slot ends the batch
with its named error; earlier slots keep their passes. Status lines carry
a `[k/4]` prefix. No queue/worker abstraction — the document-owned
`PtBaker` already serializes passes.

### D4 — Format `/6`: N stays top-level, extras under `views`

`format: 'isoinfinity-bake/6'`. The manifest keeps its entire `/5` shape
for the N view (camera, sprite, depth, `passes`, environment, renderer,
provenance) and adds one optional field:

```
views?: {
  slot: 'n'|'e'|'s'|'w';
  azimuthDeg: number;
  sprite: { width; height; originPx };
  passes: Record<string, { file; encoding; channels }>;
}[]
```

present whenever any view is stored (always includes `n`; `n`'s entry
mirrors the top-level data so consumers can treat the table as the
authoritative view list). Extra views' zip entries are
`<id>-<slot>-gbuffer.exr` / `<id>-<slot>-render.png`; N keeps the
historical names. `parseBake` accepts `/4`, `/5`, `/6`; on `/6` it returns
the extra views' blobs alongside the existing top-level fields;
`decodeBundle` decodes them into `extraViews`-shaped results. `/4`+`/5`
parse exactly as today (no `views`). Editor always writes `/6` now —
`/5` output is dropped (pre-release, no released API).

Alternatives: (a) everything inside a `views` map, top-level removed —
rejected: forces world/runtime-side readers to learn `/6` immediately,
which this change excludes; (b) one zip per view — rejected: four files
per sprite, provenance/quarantine pain, no consumer for it.

### D5 — Switcher + toolbar

Slot switcher: small React component overlaid in the sprite viewport's
top-right (`SpriteEditor.tsx`), four letter icons in N,E,S,W order; fill
color = baked (`viewPasses(doc, slot) != null`) vs empty, active slot
outlined; disabled when view-only and the slot has no stored passes (or
while busy). Click → `setActiveSlot`. The box overlay and pixel-size
preview use the active slot's camera.

Toolbar (`EditorToolbar.tsx`): the render action's label/disabled logic is
unchanged but targets `activeSlot`; plus:

- **Remove view** — enabled iff slot ≠ n, slot baked, editable, not busy;
  clears `extraViews[slot]` (discarding any in-flight pass for it first).
- **Bake All** — enabled iff editable and not busy.

### D6 — Provenance and re-bake

`BakeProvenance` stays as-is (source/settings/environment are
view-independent); the stored-slot list lives in the manifest `views`
table, which `openBundleDoc` restores into `extraViews` (decode →
`extraViews`-shaped results) with `activeSlot = 'n'`. Re-bake semantics
per slot are exactly today's per-document semantics, scoped to the
selected slot. A `/5` bundle opens as today plus empty `extraViews`.

### D7 — Verification

`scratch-verify.ts` (Node-runnable, no browser) extends to: `/6` round
trip with E/S/W entries, `/4`/`/5` open as N-only, remove-view omission
from the next save, per-slot camera azimuths in the manifest, and the
parser rejecting unknown formats by name. Browser-only behavior (switcher
UI, batch viewport following) is left to user checks per AGENTS.md;
`npm run build` gates everything.

## Risks / Trade-offs

- [Depth convention per view] `dot(worldPos, viewDir)` must use each
  slot's `viewDir` in both the raster shader and the PT depth pass, or a
  slot's g-buffer silently mismatches its render pass → thread one
  `viewDir` source through D1 and assert g-buffer/render dimension
  equality per slot in scratch-verify.
- [Memory] Up to 4 float g-buffers + 4 render images per document (cap
  8192 px/side ≈ 512 MB worst case per g-buffer at the cap) → acceptable
  for the editor context; the existing per-document baker disposal
  pattern bounds lifetime.
- [Overlay/preview drift] `projectBoxFrame` and the height/px-cap preview
  default to the N camera → both take the active slot's azimuth; the cap
  warning is computed per active slot (Bake All failing on an oversized
  other slot behaves per spec: named error, batch stops).
- [`/6` not readable by older builds] Accepted pre-release (no released
  API); rollback = revert, older saved `/6` files stay readable by any
  build with this change's parser.
- [Slot labeling direction] "E = +90° azimuth" is a convention; if it
  visually reads mirrored, flipping the sign in D1's constant fixes it
  without touching specs or format.

## Migration Plan

No data migration: `/4`/`/5` bundles keep opening (N-only, editable when
provenance exists); the editor writes `/6` from this change on. Rollback
is a plain revert.

## Open Questions

None.
