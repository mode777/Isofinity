# 0006 — Three-layer state model

Status: Accepted (2026-09-03, with the integrated editor; applied
retroactively to every editor surface)

## Context

Editor tabs hold unsaved work while only one live WebGL context exists per
editor kind. Something must define what survives a tab switch, what dies
with a tab, and what reaches disk — otherwise every feature invents its own
answers and users lose work or bundles grow editor chrome.

## Decision

Every piece of sprite/world editor state belongs to exactly one of three
layers:

1. **Persisted document data** — the only state that round-trips through
   files: bundle passes + manifest/provenance (`isoinfinity-bake/6`),
   preset JSON (`isoinfinity-bake-preset/1`), world JSON
   (`isoinfinity-world/1`). Source, scale, path-trace settings, and
   environment live here (as provenance); baked passes live here.
2. **In-memory document state** — survives tab switches because the
   document object survives; **never serialized**: `activeSlot`, `view`,
   `viewTransforms`, `boxOverlay`, `preview`, `dirty`, view-only reasons
   (`src/app/document.ts` marks each field).
3. **Live engine objects** — `PtBaker`, parsed glTF source, WebGL
   renderers/contexts (`RealtimeMeshView`, canvases). One live context per
   editor kind; activating a tab **re-creates** its views from layer-1/2
   data (pass canvases redraw from buffers — no re-bake); closing a tab
   disposes them via `dispose()` (`src/app/store/dispose.ts`).

## Consequences

- Switching tabs never loses unsaved work and never re-bakes.
- New editor state goes in layer 2 by default — adding a field there must
  not leak into bundles, presets, or world JSON; if it belongs in layer 1,
  it needs format/provenance work (see `docs/recipes.md`).
- Every new engine object needs a `dispose()` path; engines mount through
  refs and own only what they create (geometry/textures may belong to the
  document).
- Dirty tracking keys on layer-1 changes; layer-2 edits don't dirty a
  document (with deliberate exceptions like placements).

## Rejected alternatives

- Keeping per-tab GPU contexts alive: memory blowup and browser context
  limits for no perceived win.
- Persisting editor state (slot, zoom) into bundles: format churn with no
  consumer; the saved artifact is the asset, not the editor session.
