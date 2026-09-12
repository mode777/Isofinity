## Why

Model files placed in a subfolder of the workspace's `models/` folder fail to
load: the project browser (and bundle provenance) refer to them by their
relative path (`tripo/ancient+mosaic+3d+model.glb`), but the model loader in
`src/app/store/bake.ts` reads `models/` with a *flat* listing and matches by
bare file name, so every nested model errors with `"…" is no longer in the
models/ folder`. Nested sprites/worlds already work recursively; models are
the gap.

## What Changes

- `loadModelFromWorkspace` in `src/app/store/bake.ts` SHALL read `models/`
  recursively (`listWorkspaceTree` + per-path `readWorkspaceFile`) instead of
  the flat `readAllWorkspaceFiles`, resolving the selected model by its
  slash-relative path.
- Multi-file `.gltf` external resources (`.bin`, textures) SHALL still resolve
  from `models/`, and SHALL also resolve when they sit in the same subfolder
  as the `.gltf` (relative to it, glTF-style, when present there).
- Bundle provenance re-bake (`prov.source.model`) and bundle re-load SHALL use
  the same recursive resolution, so sprites baked from nested models re-bake.
- The "is no longer in the models/ folder" error SHALL remain only for files
  that genuinely do not exist anywhere under `models/`.
- No bundle-format change; no changes to listing, saving, or delete helpers.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `asset-baking`: the workspace-backed model loading requirement is refined —
  picking or re-baking a model from a nested path under `models/` SHALL load
  it by relative path, with multi-file `.gltf` resources resolving against the
  folder contents including the model's own subfolder; the provenance
  requirement's "re-read the referenced model from `models/`" SHALL hold for
  nested paths as well.

## Impact

- `src/app/store/bake.ts` (`loadModelFromWorkspace` only; its callers are
  unchanged).
- Possibly a small helper in `src/shared/workspace.ts` (recursive read keyed
  by relative path) if the cleanest fix lives there; no exported-behavior
  change beyond recursion, which `listWorkspaceTree` already provides.
- Docs: `docs/bake-pipeline.md` unaffected (format unchanged); `docs/
  runtime.md` mentions model loading only in passing — update only if wording
  says "flat". No ADR needed (no durable architectural trade-off). No
  roadmap change (bug fix, not a milestone).
- Format-version impact: none — manifests already record the model's name as
  the project browser lists it (relative path); old bundles that recorded a
  bare flat name keep loading (flat lookup is a subset of recursive).
- Verification: `npm run build`; browser-side check via `npm run dev`
  (left to the user).

## Non-goals

- No changes to sprite/world/hdri/material loading (already recursive).
- No model caching or workspace watch/refresh behavior changes.
- No UI changes to the project browser or properties panel.
- No support for models outside `models/` or escaping paths (`..` stays
  rejected by `splitRelPath`).
