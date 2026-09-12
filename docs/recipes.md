# Recipes

Touchpoint checklists for the recurring feature shapes. Each list is the
sweep that keeps formats, docs, and specs from drifting — the files are
easy to miss one by one. For anything settling a durable trade-off, also
add an ADR (`docs/decisions/TEMPLATE.md`).

Every feature ships as an OpenSpec change (`/opsx:*`); the checklists
cover the implementation sweep inside it.

## Change the bundle format / add a manifest field

1. Bump `format` in `src/bake/export.ts`; decide parser tolerance in
   `src/bake/bundle.ts` (`parseBake` — accepted prefixes, required vs
   optional entries; reject unknown formats **by name**).
2. Extend `views`/top-level types in `src/bake/export.ts` +
   `src/bake/bundle.ts` (`BakeManifest`, parse results) and the editor
   restore path (`decodeBundle`, `src/app/store/bake.ts` /
   `src/app/bundleView.ts`).
3. Fixtures: `src/bake/views-verify.ts` (Node: `npm run verify:bundles`)
   for manifest/parse round trips, old-format compatibility, rejection
   cases; `src/bake/scratch-verify.ts` for anything needing WebGL.
4. Document: pass/manifest/bundle sections in `docs/bake-pipeline.md` +
   the format-history table; `docs/glossary.md` if vocabulary changed.
5. Spec delta for the touched capability; ADR if the *why* is durable
   (see 0002/0005 for the pattern).
6. Consider: does the runtime/world side need to learn the new field now,
   or is it editor-only? State the boundary in the proposal (0005 kept
   non-N views editor-side deliberately).

## Add an editor property (panel input)

1. State: `src/app/document.ts` — persisted field (layer 1) or in-memory
   (layer 2)? Mark layer-2 fields "never written into bundles" (ADR 0006).
2. Store action in `src/app/store/bake.ts` (or `world.ts`); clamp/
   validate there, not in the component. Render-affecting settings must
   discard any in-flight pass (generation-token pattern).
3. UI: the relevant `src/app/components/` panel. Rules: a panel input
   **never starts a bake or render** — only the sprite editor toolbar's
   render action bakes; failed applications (preset/HDRI) revert the
   control and report a named error.
4. If layer 1: provenance round trip (`BakeProvenance`, export/import in
   `src/bake/export.ts` + `src/bake/bundle.ts`) and preset eligibility
   (`src/app/presets.ts`) — texture size was excluded from presets
   deliberately; decide and document where your field lands.
5. `docs/runtime.md` sprite/world editing sections; spec delta if
   user-visible behavior is pinned.

## Add a bake pass

1. Justify against ADR 0002 (one authoritative pass set) — a new pass
   needs a consumer end to end before it ships.
2. Producer: raster (`src/bake/bake.ts`, MRT draw) or path tracer
   (`src/bake/pt.ts`); pass table in `src/bake/export.ts` (file, encoding,
   channels); keep per-view pairing intact (every slot's pass set stays
   pixel-aligned — same camera, same size).
3. Bundle: entry naming + parser resolution (`src/bake/bundle.ts`),
   required vs optional; decode path (`bundleView.ts`).
4. Runtime consumer or it doesn't ship; row-order rule: every uploaded
   pass flips to top-down (see `docs/runtime.md` warning — the one-pass
   mismatch bug already happened once).
5. Full format recipe above; `docs/bake-pipeline.md` pass table.

## Add a test primitive

1. Geometry in `src/bake/primitives.ts`; register in `PRIMITIVE_KINDS`
   (`src/app/document.ts`).
2. The realtime view renders it via the legacy-primitive path (geometry
   centered at box center, flat albedo — `src/app/realtime.ts`); the box
   overlay frames the declared cell, not tight bounds.
3. Provenance stores the primitive name; bundles re-bake in place — no
   other format work.
4. `docs/roadmap.md` "Done" mention; `scratch-verify.html` prints bundle
   hashes for primitives (re-baseline expectation).

## Add world/light state

1. `LightState`/`SunState` in `src/app/document.ts` + defaults; store
   actions in `src/app/store/world.ts`.
2. Persistence: `isoinfinity-world` save/load in `src/app/store/` (the
   pure payload lives in `src/app/worldFile.ts`) —
   validate completely before applying (corrupt file = named error,
   nothing opens); new fields round-trip and older files load without
   them.
3. Renderer uniform path (`src/runtime/renderer.ts`); if it derives from
   `src/shared/sun.ts`, remember manual az/el overrides win until a sun
   slider moves.
4. `docs/runtime.md` Lighting/Worlds sections; spec deltas for
   `world-persistence` / `sun-position` as touched.

## Add a world-editor tool or placement interaction

1. State: is it persisted (layer 1) or in-memory (layer 2)? Tools,
   selection, brush defaults and view state are layer 2 — say "never
   written into world files" (ADR 0006). Give anything selectable a
   stable runtime id (`src/runtime/world.ts`) so selection survives
   erase/undo, which preserve object identity.
2. Pure logic in `src/runtime/` (picking, geometry, depth) so it is
   Node-testable; store actions in `src/app/store/world.ts` (validate
   there, not in the component). Mutations that a user would undo record
   one command on the history stack — a drag is one command, not one per
   pointer-move.
3. Viewport: pointer handling + overlay chrome in
   `src/app/components/WorldEditor.tsx`. Left button acts on the
   placement, middle-drag pans, right-click erases or clears (per tool);
   Escape clears selection. Overlay chrome never serializes and never
   dirties.
4. Panel: per-placement properties in
   `src/app/components/WorldProperties.tsx` (reuse `controls.tsx` rows).
   Keep the toolbar to tool buttons and shared modes.
5. Verifier: a `src/runtime/<feature>-verify.ts` + `npm run verify:<x>`
   script when the logic is CPU-testable; otherwise note the browser
   check for the user. Update `docs/runtime.md`, `docs/glossary.md`,
   `docs/roadmap.md`, and add an ADR if the approach settles a durable
   trade-off.
