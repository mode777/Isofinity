## Context

See `proposal.md` — Why. The suspected hot paths are the synchronous decode
chains in `src/runtime/assets.ts` (`loadBundleNorth`/`resolveBundleView` →
`decodeExrGbuffer`/`decodePng`, then `layersToSet` padding), the full renderer
reconstruction on every `doc.layers` change (`WorldEditor.tsx` effect keyed on
`[doc.docId, spriteSet]`, plus `Renderer.setSprites`), and the material chain
(`parseGroundMaterial` unzip/EXR/PNG, then `Renderer.setGroundMaterials`
sRGB conversion, canvas resample, default layers, upload + mipmap). There is
currently no timing surface, and this environment cannot run a browser, so the
user must run the traced build and report back.

Constraints: TypeScript + Vite, no new dependency, Node-runnable verification is
the gate (AGENTS.md), and diagnostics are engine/editor state that must never be
serialized (ADR 0006).

## Goals / Non-Goals

**Goals:**

- Measure, per phase, where sprite and material load time goes, with tags stable
  enough to aggregate across a session.
- Make the raw output trivially copyable from the browser console and the
  aggregate trivially inspectable.
- Keep the pure record/aggregate logic Node-verifiable so `npm run verify:trace`
  can gate it.

**Non-Goals:**

- Explaining or fixing the bottleneck; this change only observes.
- A profiler UI, flamecharts, automated budgets, or CI perf thresholds.
- Worker/off-thread decode; sample-based profiling; GPU timer queries.
- Tracing the sprite editor's eager `decodeBundle` or bake paths (out of scope
  for this measurement pass).

## Decisions

### D1 — A pure core plus a thin browser shell

`src/perf/trace.ts` exports a pure `TraceBuffer` (`add`, `all`, `clear`,
`summary`) over a `LoadSpan` record:

```ts
interface LoadSpan {
  tag: string;
  ms: number;
  meta?: Record<string, string | number | boolean>;
}
```

`summary(spans)` groups by tag into deterministic `{ tag, count, totalMs }` rows
sorted by tag; `formatSpan(span)` renders one line. These are DOM- and
timing-free, so `src/perf/trace-verify.ts` (Node) can assert shapes and math.

A browser-only shell wraps the buffer: `isTracingEnabled()` (dev build, or
`?loadtrace` in the URL, or `globalThis.__loadTraceOn`), `span(tag, meta)`
returning a `finish(extraMeta?)` closure that reads `performance.now()` at both
ends and records one span, and module-level globals `__loadTrace`,
`__loadTraceSummary()`, `__loadTraceClear()`. All DOM/global access is lazy and
guarded (`typeof location !== 'undefined'`), so importing the module in Node
does not throw.

*Alternatives:* a class-based logger with methods on the `Renderer`/stores —
rejected, it threads plumbing through hot signatures and is harder to disable;
`console.time`/`console.timeEnd` — rejected, no accumulator, no aggregation,
and label collisions across async loads.

### D2 — Opt-in, quiet by default in production

`isTracingEnabled()` returns true when `import.meta.env.DEV` is set (Vite
substitutes this at build time) or when `?loadtrace` is present or when
`globalThis.__loadTraceOn = true`. Production builds otherwise emit nothing.
Disabled `span()` still returns a finisher but records nothing (near-zero cost;
no `performance.now()` call).

*Alternatives:* always-on `console.debug` — rejected, noisy on the deployed
Pages build and it is the build the user may test; `localStorage` persistence —
rejected, a URL flag/global is enough and keeps diagnostics strictly in-memory.

### D3 — Instrument every candidate the hypotheses name

Tags (stable, dotted) and their measuring points:

- Sprite: `sprite.read` (file→ArrayBuffer), `sprite.manifest`
  (`parseBakeManifest`), `sprite.inflate` (per `readBakeEntry`, meta = entry),
  `sprite.exr` (`decodeExrGbuffer`), `sprite.depth`
  (`gbufferDepthOutOfRange`), `sprite.png` (`decodePng`), `sprite.padding`
  (`layersToSet`), `sprite.upload` (`Renderer.setSprites`), plus whole-phase
  `sprite.north` and `sprite.view` (meta = asset, slot, w×h).
- World: `world.open` (total), `world.asset` (per unique asset), and one
  `world.direction` span per resolved direction — the count of these is the
  O(N·D) evidence.
- Renderer: `renderer.build` wraps `new Renderer(...)` in `WorldEditor.tsx`
  (meta = layer count); its count per world open is the reconstruction evidence.
- Material: `material.parse` (whole), `material.inflate` (`unzipSync`),
  `material.exr`/`material.image` (per map decode, meta = slot/file),
  `material.srgb` (`linearDiffuseToRgba`), `material.resample` (`bitmapToRgba`),
  `material.defaults` (`defaultLayer` build), `material.upload`,
  `material.mipmap` (`generateMipmap`), meta = file name.
- Ground paint: `paint.decode` (`loadGroundPaint`).

Timings are wall-clock around the whole phase call, so awaited phases
(`createImageBitmap`) include their wait — which is what the user perceives.

*Alternatives:* instrument only the coarse whole-load spans — rejected, they
cannot separate inflate from EXR parse from padding, which is the whole point;
CPU-only timing via `performance.now()` around sync sections only — rejected,
it would hide the createImageBitmap/`getImageData` scheduling cost we suspect.

### D4 — One copyable line per span, one table for the aggregate

`span()` logs `formatSpan()` via `console.log` immediately (line begins with
`[loadtrace]`), and appends the record to the buffer. `__loadTraceSummary()`
logs `console.table(summary())` and returns the rows. This gives the user a
paste-able raw stream and a readable roll-up.

### D5 — Diagnostics are engine state, never serialized (ADR 0006)

The `TraceBuffer`, its spans, and the toggles live only in module memory. They
are not attached to any document, bundle manifest, world file, material zip, or
preset, and are not persisted across a reload. Nothing in the save paths reads
them.

### D6 — Docs, no ADR

`docs/runtime.md` documents the toggle, tags, and console shape;
`docs/glossary.md` gains "load trace"; `docs/roadmap.md` records the change. No
ADR: there is no durable architecture trade-off the way there is for, say, lazy
view decode — the in-memory rule is already ADR 0006.

## Risks / Trade-offs

- **Timing noise (GC, JIT, scheduling) makes single runs unreliable** → spans
  aggregate across repeated loads via `__loadTraceSummary()`; the raw per-run
  lines let the user spot outliers; the design intentionally exposes both.
- **Awaited phases mix CPU and wait time** (`createImageBitmap`,
  `file.arrayBuffer`) → tags separate decode phases from read phases, so a large
  `sprite.png` but small CPU is visible as such; the user can re-run to see
  variance.
- **Importing `trace.ts` in Node** could touch `location`/`globalThis` →
  guarded behind `typeof` checks and lazy access; the verifier imports only the
  pure core.
- **Instrumentation in hot loops** (`layersToSet` per layer) → record one span
  per call, not per layer; overhead when enabled is one `performance.now()` pair
  per phase, negligible next to the work being measured.
- **Tag drift** could make aggregation meaningless → tags are defined in one
  module as constants; the pure summary keys off them.

## Migration Plan

Additive only: a new module, timing hooks, docs. No data or format migration.
Rollback is reverting the commit; there is no persisted state to clean up.
