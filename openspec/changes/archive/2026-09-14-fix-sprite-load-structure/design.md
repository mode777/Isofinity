## Context

See `proposal.md` — Why. Measured browser traces (after removing the iCloud
Desktop & Documents read bottleneck) put a 12-layer world open at 8.3 s:
reads are milliseconds, extra-view resolution ~3.5 s (hut E `sprite.view`
2421 ms against ~96 ms of decode), the padding/rebuild loop ~3.2 s
(`sprite.padding`, `sprite.upload`, `renderer.build`), and a primitive bake
0.87 s.

Current state that causes it:

- `resolveBundleView` (`src/runtime/assets.ts:406`) re-calls `source.read()`
  because `cacheInfo` returns `buffer: null` on a cache hit — the raw zip is
  deliberately not retained (ADR 0014).
- `layersToSet` (`assets.ts:165`) pads every layer to `maxW × maxH` with
  `padHalf`/`padBytes` per-pixel JS loops; `Renderer.setSprites`
  (`src/runtime/renderer.ts:1114`) deletes and recreates both arrays and
  uploads every layer. But the sprite vertex shader samples only each
  layer's own `w × h` sub-rect (`vUv = mix(vec2(0.5), aInst2.zw - 0.5,
  aCorner) / uMaxSize`), so the padded region is never read.
- The world viewport effect is keyed `[doc.docId, spriteSet]`
  (`src/app/components/WorldEditor.tsx:382`), so every added layer disposes
  and reconstructs the whole `Renderer`.
- `bundleCache` is keyed by `source.key` = `sprites/<name>` only
  (`assets.ts:360`), so a workspace switch can reuse another workspace's
  decoded views.

## Goals / Non-Goals

**Goals:**

- Read each bundle file at most once per load, no matter how many views are
  resolved.
- Upload each sprite layer at its own dimensions, and add a layer without
  rebuilding the others or the renderer.
- Key the decoded-view cache by workspace identity.
- Cache boot-baked primitives for the session.
- Close the `sprite.read` instrumentation gap for extra views.

**Non-Goals:**

- No bundle/manifest/format or g-buffer encoding change.
- No worker, no IndexedDB/cross-session cache, no parallel reads.
- No material-loading rework.
- No change to occlusion, shading, picking, or placement-direction behavior.
- Not removing the lazy-view model itself — extras still decode on first use;
  only the redundant *read* is removed.

## Decisions

### D1 — Retain the read bytes in the session cache; evict under pressure

`CachedBundle` gains `bytes: ArrayBuffer | null`. `cacheInfo` returns the
cached bytes on a hit and never re-reads; `resolveBundleView` decodes from
them. The bytes are dropped when every stored view of the asset has been
resolved, or when a session byte budget (e.g. 256 MB) is exceeded (LRU
eviction of bytes, keeping already-decoded views). If bytes were evicted and
an unresolved view is requested, the read falls back to `source.read()`.

*Alternatives:* eager-decode every view during the north read — rejected, it
re-introduces exactly what ADR 0014 removed (CPU and memory for unused
directions). Decode extras straight from the north read without caching the
buffer — rejected, the next open would re-read anyway and the same world
often requests several directions. Amendment of ADR 0014 is recorded: with
measured reads at seconds-per-bundle and decode at ~100 ms, holding the
compressed bytes is clearly the better trade.

### D2 — Unpadded, incremental texture-array uploads

`layersToSet`'s padding is removed. The renderer maintains one
`TEXTURE_2D_ARRAY` per pass with:

- `maxW`/`maxH` = the largest layer dimensions seen, with allocation
  headroom (next power of two), so adding a layer no larger than the current
  allocation just writes one new slice;
- a layer capacity allocated in chunks (e.g. next power of two layers) so a
  new slice does not require reallocating;
- each layer uploaded tight with `texSubImage3D(..., x=0, y=0, w, h, ...)` at
  its slice — the uninitialized remainder of the slice is never sampled
  because the shader's UVs use the layer's own `w × h`.

Reallocation (upload everything again) happens only when a layer exceeds the
current `maxW`/`maxH` or the slice capacity is exhausted; that is amortized
and rare. A new `Renderer` method (`setSpriteSet` / `addSpriteLayer`) applies
the delta; `setSprites` remains only for the constructor path.

*Alternatives:* per-layer `TEXTURE_2D` with an index indirection — rejected,
WebGL2 cannot dynamically index a sampler array without a branch cascade.
Keep padding but only re-upload changed layers — rejected, the padding CPU
pass is itself measured at ~150–290 ms per rebuild.

### D3 — The world viewport keeps one renderer for the document's lifetime

The large render/event effect's dependencies drop from
`[doc.docId, spriteSet]` to `[doc.docId]`. The per-frame closures read the
current sprite set through a ref (`spriteSetRef.current = spriteSet` updated
each render) instead of capturing the memo, and a small separate effect calls
`renderer.addSpriteLayer(...)` (or `setSpriteSet`) when `spriteSet` changes.
`renderer.dispose()` still runs on doc change/unmount only.

*Alternatives:* keep reconstructing and make construction cheaper — rejected,
the renderer also recompiles programs, recreates VAOs/UBOs, and rebinds
listeners, measured at ~250–540 ms per layer.

### D4 — Workspace-scoped source key

`BundleSource.key` becomes session-workspace-scoped. The workspace store
exposes a monotonically increasing connection epoch (bumped on each successful
connect); `bundleSource(key, file)` prefixes it (`ws<epoch>:sprites/<name>`).
The cache key therefore includes the workspace, while `size`/`lastModified`
still invalidate a changed file within a workspace.

*Alternatives:* use the directory handle name — rejected, names are not
unique or stable. A content hash — rejected, it requires the read we are
trying to avoid.

### D5 — Cache boot-baked primitives

`bakePrimitiveLayer(kind)` results are memoized in a module map keyed by the
primitive kind (and grounding-shadow setting). Bakes are deterministic
(procedural environment, default settings) and the returned arrays are
read-only, so sharing across worlds is safe. Removes the measured 0.87 s
per open.

### D6 — Trace the extra-view read

`resolveBundleView` emits `sprite.read` around the actual `source.read()`
(fall-back path included) so read cost is never again hidden inside
`sprite.view`; a `cache hit` / `cached bytes` marker is recorded on the
`sprite.view` finish meta.

### D7 — Docs and ADRs

- Amend `docs/decisions/0014-lazy-sprite-view-decode.md`: the raw bundle
  bytes are retained (bounded), not discarded; the reason (measured I/O vs
  decode) and the eviction policy.
- New ADR for the unpadded incremental upload model (the durable trade
  against the old "pad all layers to max" invariant).
- `docs/runtime.md` (read-once + upload), `docs/glossary.md` (terms),
  `docs/roadmap.md` (done entry), and `AGENTS.md`: workspaces must not live
  in iCloud Desktop & Documents (`~/Documents`/`~/Desktop`), where Chrome's
  File System Access reads measured 3–6 MB/s.

## Risks / Trade-offs

- **Retained bytes cost memory** → bounded by a byte budget with LRU byte
  eviction; decoded views are retained regardless; bytes are dropped once all
  stored views resolve. The delta is the compressed zip size per asset with
  unresolved views.
- **Growing `maxW`/`maxH` forces a full re-upload** → allocation headroom and
  chunked capacity make this rare; correctness is unaffected because the
  shader never samples the padded region.
- **Renderer-lifetime refactor touches many closures** (picking, surface
  snap, shadow points) that currently capture `spriteSet` → route them
  through `spriteSetRef`; the existing `verify:selection` and Node logic
  remain the gate, browser behavior left to the user.
- **Workspace epoch is session-only** → correct because the cache is
  session-only; a reload rebuilds both.
- **Uninitialized texture region** → safe with NEAREST/LINEAR sampling and no
  mipmaps; the sprite arrays already use those filters.

## Migration Plan

No persisted data changes. Internal, additive, and revertible by reverting
the commit. Existing `/4`/`/5`/`/6` bundles and saved worlds load unchanged.
