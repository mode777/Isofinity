## 1. Trace facility

- [x] 1.1 Create `src/perf/trace.ts` with the pure `LoadSpan`/`TraceBuffer` core (`add`, `all`, `clear`, `summary`) and `formatSpan`, all free of DOM and timing calls; verify `npm run build` typechecks it
- [x] 1.2 Add the browser shell: `isTracingEnabled()` (`import.meta.env.DEV`, `?loadtrace`, or `globalThis.__loadTraceOn`), `span(tag, meta)` returning a no-op finisher when disabled, a `performance.now()`-timed finisher when enabled, and the `globalThis.__loadTrace` / `__loadTraceSummary()` / `__loadTraceClear()` globals with lazy, `typeof`-guarded access; verify `npm run build` passes and a Node import does not throw
- [x] 1.3 Define the tag constants in one place and route `span()` output through `formatSpan()` so each completed span logs a single `[loadtrace] …` line and appends to the buffer; verify the line format by inspection against `formatSpan`
- [x] 1.4 Add `src/perf/trace-verify.ts` exercising the pure core (fixed spans → deterministic sorted per-tag `{count,totalMs}`, format string, clear → empty) and add the `verify:trace` script to `package.json` (esbuild bundle to `/tmp` + node, matching the other verifiers); verify `npm run verify:trace` passes

## 2. Sprite instrumentation

- [x] 2.1 Wrap the `loadBundleNorth` chain in `src/runtime/assets.ts` with `sprite.read`, `sprite.manifest`, `sprite.inflate` (per entry), `sprite.exr`, `sprite.depth`, `sprite.png`, and the whole-phase `sprite.north`, tagged with asset and view dimensions; verify with `?loadtrace` in `npm run dev` that each phase line appears once per north load
- [x] 2.2 Wrap the `resolveBundleView`/`decodeExtra` chain with the same phase tags plus whole-phase `sprite.view`, tagged with asset and slot; verify each extra view emits its own lines
- [x] 2.3 Add `sprite.padding` around the `layersToSet` pad step reporting layer count and max size, and `sprite.upload` around `Renderer.setSprites`; verify both lines appear when a world or brush loads layers

## 3. World and renderer instrumentation

- [x] 3.1 Wrap `openWorldDoc` with `world.open` (total) and `world.asset` (per unique asset), and one `world.direction` span per `ensureView` resolution so the count is visible; verify opening a world with multi-direction sprites logs the direction spans
- [x] 3.2 Wrap the `new Renderer(...)` construction in `WorldEditor.tsx` with `renderer.build` tagged with layer count; verify the number of `renderer.build` lines per world open, confirming or refuting the per-layer reconstruction claim
- [x] 3.3 Add `paint.decode` around `loadGroundPaint`'s coverage-PNG decode; verify the line appears when a world references saved coverage

## 4. Material instrumentation

- [x] 4.1 Wrap `parseGroundMaterial` in `src/app/groundMaterial.ts` with `material.inflate`, `material.exr`, and per-map `material.image` spans (meta = file/slot); verify loading a material logs one line per decoded map
- [x] 4.2 Wrap the conversion/upload phases in `Renderer.setGroundMaterials` (`material.srgb`, `material.resample`, `material.defaults`, `material.upload`, `material.mipmap`) tagged with material names; verify each line appears when a material is bound to a slot

## 5. Docs and verification

- [x] 5.1 Document the tracing toggle, tag list, and console shape in `docs/runtime.md`; add "load trace" to `docs/glossary.md`; record the change in `docs/roadmap.md`
- [x] 5.2 Add the `verify:trace` command to the AGENTS.md Commands list so the gate is discoverable
- [x] 5.3 Run `npm run verify:trace` and `npm run build` and confirm both pass; confirm the modified docs describe the shipped behavior
- [x] 5.4 Provide the user a short browser recipe (`npm run dev` or the deployed Pages URL with `?loadtrace`, then copy the `[loadtrace]` lines and `__loadTraceSummary()` table) and confirm no trace data is written into a saved world or bundle
