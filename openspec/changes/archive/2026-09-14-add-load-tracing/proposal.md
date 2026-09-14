## Why

Sprite and ground-material loading is suspected of still being slow after the
lazy-view work (`lazy-sprite-view-loading`), but the bottleneck is currently
speculation: the candidates are zip inflate of float32 EXR, per-pixel
float→half and canvas readback, CPU padding in `layersToSet`, full renderer
rebuilds on every layer change, and material decode with no cache. Before
committing to a disruptive storage/format change we need measurements from the
real browser runtime that say which phases actually dominate.

This environment cannot launch a browser (AGENTS.md), so the instrumentation
must be shipped to the user, who runs it manually and feeds the console output
back.

## What Changes

- **A small trace facility** (`src/perf/trace.ts`): a `span(tag, meta)` helper
  around `performance.now()` that records one structured entry per phase and
  appends it to a module-level buffer exposed as `globalThis.__loadTrace`, with
  `__loadTraceSummary()`/`__loadTraceClear()` helpers. Pure record/aggregate
  logic is Node-verifiable; timing itself is browser-only.
- **Opt-in activation.** Tracing is on by default in dev builds and off in
  production unless enabled (`?loadtrace` query flag or a global toggle), so the
  shipped Pages build stays quiet until the user asks for a trace.
- **Sprite-load spans**: read, manifest parse, per-entry inflate, EXR decode,
  depth-range scan, PNG decode, `layersToSet` padding, and sprite texture
  upload, tagged with asset, view, and dimensions.
- **World-open spans**: total open time, per-asset north time, direction-resolve
  count, and a counter of renderer reconstructions (the suspected O(N·D)
  rebuild loop).
- **Material-load spans**: zip inflate, EXR decode, per-map image decode, linear
  →sRGB conversion, canvas resample, default-layer build, and texture-array
  upload + mipmap generation.
- **Docs**: `docs/runtime.md` (the toggle and console shape), `docs/roadmap.md`
  (done entry), `docs/glossary.md` (the "load trace" term).

## Capabilities

### New Capabilities

- `runtime-load-tracing`: an opt-in, in-memory diagnostics facility that emits
  structured per-phase load timings for sprite bundles and ground materials to
  the browser console and a global accumulator, without affecting load behavior
  or persisting any data.

### Modified Capabilities

None. No existing requirement's behavior changes; tracing observes existing
loads.

## Impact

- Code: new `src/perf/trace.ts` (+ `src/perf/trace-verify.ts`), and timing hooks
  in `src/runtime/assets.ts` (decode chain, `layersToSet`),
  `src/runtime/renderer.ts` (`setSprites`, `setGroundMaterials`),
  `src/app/groundMaterial.ts` (`parseGroundMaterial`),
  `src/app/store/world.ts` (`openWorldDoc`, `ensureView`, paint decode), and
  `src/app/components/WorldEditor.tsx` (renderer construct/rebuild).
- Docs: `docs/runtime.md`, `docs/glossary.md`, `docs/roadmap.md`. No ADR — this
  is throwaway-adjacent diagnostics with no durable architecture trade-off;
  in-memory-only is already pinned by ADR 0006.
- Format: **none.** No bundle bytes, manifest fields, world format, or accepted
  format prefixes change; the trace buffer is never serialized.
- Verification: new `npm run verify:trace` for the pure record/aggregate logic;
  `npm run build`; browser run left to the user (`npm run dev` or the Pages
  build, then copy the console output). No headless browser.
- Non-goals (deliberately out of scope): a visual profiler/panel, automatic
  performance assertions or budgets, cross-session persistence, worker/off-thread
  decode, and the actual optimizations (half-float g-buffer, dropping CPU
  padding, incremental texture upload, material cache) — this change measures
  first so the follow-up can target the dominant phase.
