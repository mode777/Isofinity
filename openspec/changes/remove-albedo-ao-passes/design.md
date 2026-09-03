## Context

Today a raster MRT draw (`count: 2`) produces the albedo and merged
g-buffer passes; a path tracer produces the optional `render` pass and the
broken `ao` pass. The runtime's `SpriteLayer` already carries only
g-buffer + render, `loadBundleLayer()` hard-requires the render pass, and
the world compositor shades the *render* image by the g-buffer normal —
nothing downstream reads the stored albedo, and nothing can read ao (it
accumulates empty output; see `docs/bake-pipeline.md`, "AO pass (KNOWN
BROKEN)"). The per-pixel color obligation of the project's design
constraint continues to be met by the required lit render pass; position
stays derivable from g-buffer depth and normals stay baked.

## Goals / Non-Goals

**Goals:**

- One authoritative pass set end to end: raster g-buffer + optional
  path-traced render. No dead code paths, no dead UI, no dead manifest
  fields for albedo/ao.
- Existing saved bundles (with albedo/ao entries recorded in their
  manifests) keep opening in the editor and keep working in worlds.
- Bundle bytes shrink by one PNG per sprite.

**Non-Goals:**

- No replacement AO technique — a future change introduces it with its own
  requirements and settings.
- No format version bump, no manifest schema migration tooling.
- No change to material *inputs* (base-color textures/factors, PBR
  materials): they feed the path tracer exactly as before.
- No change to g-buffer semantics (packed normal+depth, emptiness rule,
  byte conventions).

## Decisions

### Keep `isoinfinity-bake/5`; do not bump the format

The manifest's `passes` table is self-describing: the parser resolves
entries through it, so a `/5` manifest that declares only g-buffer
(+render) is already valid, and older manifests that declare albedo/ao
remain parseable. A `/6` bump would invalidate every existing bundle
reference for zero parsing benefit. The parser's accepted-prefix list
(`/4`, `/5`) is unchanged.

### Parser tolerance: require g-buffer only, ignore legacy entries

`parseBake()` currently throws unless `passes.albedo` resolves. It will
require only `passes.gbuffer`, keep `render` optional-if-declared, and
stop looking at `passes.albedo`/`passes.ao` entirely. Consequences:

- Legacy `/4` and `/5` bundles load unchanged (albedo/ao entries, when
  present, are ignored — not even decoded).
- New bundles contain `manifest.json`, `<id>-gbuffer.exr`, and
  `<id>-render.png` when baked.
- `loadBundleLayer()`'s render-pass requirement is untouched — bundles
  without a render pass still open in the sprite editor but still cannot
  be placed into worlds.

Alternative considered: keep decoding albedo/ao when present for a
"legacy pass viewer". Rejected — "remove completely" means no consumer
left; tolerance is for loading, not display.

### Raster bake becomes single-target; alpha path survives

The render target drops to `count: 1` (g-buffer only) and
`BakeResult.albedo` disappears. The fragment shader keeps the
texture/factor sampling path because the glTF MASK cutoff is decided from
`texel.a × factor.a` — the discard (and therefore g-buffer emptiness as
the coverage signal) still depends on it — but loses the color outputs
(`outAlbedo`, the sRGB re-encode of sampled color). `BakeResult.albedoHex`
is dropped with the pass; `Primitive.albedoHex` and
`MaterialGroup.albedoTexture` stay — they are path-tracer material inputs,
not pass data.

Editor occlusion/hit-testing semantics are unchanged: g-buffer emptiness
(`length(normal) == 0`) was already the hard coverage signal in the
compositor; albedo alpha was only ever read by the scratch verifier.

### AO machinery is deleted, not gated

`PtBaker.aoPass()`, `AmbientOcclusionMaterial`/`MeshBVHUniformStruct`/
`PathTracingSceneGenerator` imports, the manual-blend accumulation shader,
the seeded jitter PRNG, and the `[pt-audit]` diagnostics (used only by AO)
go away. `PtSettings` shrinks to `samples`, `bounces`, `textureSize`,
`denoise`; `PtExtras` loses `ao`. Keeping the code behind a flag was
rejected: it is known-broken, unreplacable as written, and its only
future is a different approach in a different change.

### Provenance/settings shapes shrink; old JSON tolerated

`BakeProvenance.bake` loses `aoSamples`/`aoRadius`; the manifest
`renderer` block loses its optional `aoSamples`/`aoRadius` fields.
Restoring a `/5` document reads the fields it knows and ignores the rest —
old provenance JSON simply carries extra keys. `setSettings` clamps and
the properties panel drop the AO sliders; `DEFAULT_PT_SETTINGS` shrinks.

### Editor surfaces follow the pass set

- `BakeDocument` loses `ao`; `store/bake.ts` loses `runAoPass`/`aoGen`
  and the ao branch of the save extras.
- `SpriteEditor` shows g-buffer (normal/depth) + render figures; the
  albedo figure and ao figure/buttons are removed.
- `SpriteProperties` loses the AO samples/radius sliders and the
  "Bake/Re-run AO pass" button.
- `bundleView.ts` stops decoding albedo (`pngBytesToFloat` goes) and ao;
  render decoding stays.

### Verification updates

`src/bake/scratch-verify.ts` (and the `scratch-verify.html` dev page) are
updated: raster assertions target the g-buffer only; bundle fixtures gain
a case for a legacy manifest with albedo/ao entries still parsing; the
raster-only bundle expectation becomes "manifest + g-buffer only".
Bundle hashes change again (same re-baseline caveat noted in the docs).
Per the toolchain constraint, GPU-side checks are updated but verified by
the user in a browser; `npm run build` is the automated gate.

## Risks / Trade-offs

- [Legacy bundles silently lose their albedo/ao passes when re-saved
  view-only (verbatim `bundleBytes`)] → Acceptable and intended: the
  passes have no consumers. The docs state the tolerance contract.
- [Someone relied on the unlit albedo pass for external tooling] → The
  format never had external consumers (no released API per AGENTS.md);
  old bundles remain byte-intact on disk.
- [Provenance JSON from old bundles no longer round-trips every field]
  → Restore ignores unknown fields; nothing re-writes them on re-bake.
- [Coverage regressions if the MASK-discard path is simplified too
  aggressively] → The alpha sampling path is explicitly kept; scratch
  verify keeps a masked-texels → all-zero-g-buffer check.

## Migration Plan

Single atomic change: bake, bundle, editor, verifier, and docs move
together (the typecheck fails on any partial state). No data migration —
existing `.sprite` files keep working through parser tolerance. Rollback
is a plain revert.

## Open Questions

None.
