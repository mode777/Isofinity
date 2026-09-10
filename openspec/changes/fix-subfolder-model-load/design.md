## Context

The project browser lists workspace assets recursively (`listWorkspaceTree`)
and hands the integrated editor slash-relative paths (`tripo/foo.glb`). The
bake tool's model loader, `loadModelFromWorkspace` in
`src/app/store/bake.ts:396`, is the one remaining consumer that still reads
`models/` flatly (`readAllWorkspaceFiles` → `listWorkspaceFiles`) and matches
by bare `File.name`, so any nested model is reported as missing. Everything
downstream of the loader is already path-agnostic: `loadGltf(files: File[])`
in `src/bake/gltf.ts` filters model files by extension, and its resource
resolver matches requested URIs by exact relative path first, then by unique
basename fallback (`buildResourceMap`/`resolveResource`), which works with
plain `File` objects from `readWorkspaceFile` (bare names).

## Goals / Non-Goals

**Goals:**

- A model referenced by any relative path under `models/` loads, whether it
  comes from a project-browser open or from bundle provenance (re-bake /
  bundle re-load path).
- Multi-file `.gltf` external resources keep resolving against `models/`
  contents, including resources stored next to the `.gltf` in its subfolder.
- Flat layouts keep working unchanged; the failure mode for genuinely
  missing files stays a named error.

**Non-Goals:**

- No changes to sprites/worlds/hdri/materials loading, saving, or deletion
  (already recursive).
- No caching, watching, or listing UI changes.
- No bundle-format or manifest changes (provenance already records the
  relative path the browser displayed).

## Decisions

- **Resolve by recursive listing, not per-path probe.**
  `loadModelFromWorkspace` switches to `listWorkspaceTree('models',
  MODEL_EXTS)` to confirm the model exists and identify its exact relative
  path, then reads it with `readWorkspaceFile('models', path)`. The
  supporting-file set (every non-model-extension file in `models/`,
  recursively) is read the same way and passed to `loadGltf` alongside the
  model.
  - *Alternative:* try `readWorkspaceFile('models', fileName)` directly and
    treat `NotFoundError` as "missing". Loses because the loader's current
    error message and the supporting-file read path both need the recursive
    listing anyway, and a probe gives no way to distinguish "missing" from
    "permission lost" cleanly.
  - *Alternative:* add a `readWorkspaceTree` helper that returns all `File`s
    recursively (mirroring `readAllWorkspaceFiles`). Rejected for now: it
    would eagerly read every `.glb` in the workspace as bytes just to filter
    them out, which is wasted I/O for large libraries; the current shape
    (list names, read only what is needed) fits better. If a second consumer
    appears, extracting the helper is trivial.
- **Supporting files: whole `models/` tree, filtered to non-model
  extensions.** This preserves today's semantics ("resources resolve against
  the folder contents") extended to subfolders. The basename fallback in
  `resolveResource` makes bare-name `File` objects match URIs like
  `textures/foo.png`. No change to `src/bake/gltf.ts` or `loadGltf`.
- **Editor state untouched.** The loaded `GltfSource` stays in-memory
  document state (`doc.gltf`) exactly as today and is never serialized into
  bundles (ADR 0006); provenance keeps storing only the model's relative
  name and scale.

## Risks / Trade-offs

- [Eagerly reading all supporting files costs I/O on large `models/` trees]
  → Same order of work as today (today reads *all* model files); only the
  recursion depth grows. Acceptable for asset libraries of the intended
  scale.
- [Two nested folders containing same-named textures make basename
  resolution ambiguous → load error] → Pre-existing behavior of the resolver
  (ambiguity is a named error, never a silent guess); unchanged by this fix.
  Exact-path matching still wins when the manifest URI carries the subfolder.
- [Older bundles recorded a bare name while the file now sits nested]
  → Flat files are a subset of the recursive listing; a bare name that no
  longer matches any path correctly degrades to view-only with the existing
  named error. No migration.

## Migration Plan

Single self-contained code change in `src/app/store/bake.ts`; no data or
format migration. Rollback is a one-file revert.

## Open Questions

None.
