## Context

A sprite document already holds everything a preset needs: `settings`
(samples/bounces/textureSize), `env` (procedural | hdri name) and `ptEnv`
(rotation/intensity/exposure/saturation). The provenance block written into
`isoinfinity-bake/5` bundles records nearly the same shape — but it also
carries the bake source and texture size, which presets must not. The
workspace layer (`src/shared/workspace.ts`) exposes typed per-folder
list/read/write helpers over a fixed folder convention, and the project
store already maintains per-folder listings (`models`, `sprites`, `worlds`,
`hdris`) refreshed by the project browser. Presets are editor-facing only:
nothing in `.sprite` bundles, the manifest, or the runtime changes.

## Goals / Non-Goals

**Goals:**

- One preset file format that round-trips the tunable bake look (samples,
  bounces, environment) between sprite documents and editor sessions.
- Workspace-backed save/apply/delete with the established fallback
  (download / file import) when no workspace is connected.
- Apply reuses the existing settings/environment mutation paths so range
  clamping and render-pass restart semantics stay identical.

**Non-Goals:**

- No presets in the project browser — the listing lives in the sprite
  properties panel, like the `hdri/` listing.
- No texture-size in presets (model-dependent atlas budget; stays
  per-document).
- No presets for worlds/lights, no preset folders or nesting, no runtime or
  bundle-format changes.

## Decisions

### File format: `isoinfinity-bake-preset/1` JSON

```json
{
  "format": "isoinfinity-bake-preset/1",
  "samples": 512,
  "bounces": 4,
  "environment": { "procedural": true }
}
```

`environment` mirrors `BakeProvenance['environment']` exactly
(`{ hdri, rotationDeg, intensity, exposure, saturation }` for HDRI), so the
restore code stays parallel to the provenance-restore path in
`openBundleDoc`. Alternatives: reusing the full provenance shape (rejected —
carries source + textureSize a preset must not have); zip containers
(rejected — overkill for a few scalars; worlds already established plain
JSON as the convention for editor documents).

Parsing follows the bundle parser's rules: `JSON.parse` guarded, exact
format match (`/1` accepted, anything else rejected by name), finite-number
validation, unknown environment shape rejected. Applied values flow through
the existing clamps in `setSettings`/`setEnvParams`, so a hand-edited preset
cannot push the tracer out of range. Type + parser/serializer live in
`src/app/presets.ts` (editor-only concern, alongside `bundleView.ts`).

### Folder convention: add `presets` to `WORKSPACE_FOLDERS`

One line in `src/shared/workspace.ts` gets creation-on-connect, listing,
read, and write for free. Reconnect already runs `ensureFolders`, so
existing workspaces gain `presets/` on the next connect — idempotent and
harmless. A small `deleteWorkspaceFile(folder, name)` helper is added for
preset deletion (no delete path exists today).

### Apply is resolve-then-commit

Applying resolves the environment *first*: for an HDRI preset, the file is
read and parsed before any state changes; any failure (missing file, bad
HDRI) reports a named error with the document untouched — satisfying the
atomicity scenario. On success, settings + environment params commit in one
store update and the render pass re-runs at most once. Reusing
`loadHdriFile` as-is would restart the pass twice (once on load, once on
`setEnvParams`), so apply sets the params together with the texture in a
single update and then triggers the pass explicitly; the standalone HDRI
loaders keep their current behavior. Texture size is untouched because
`setSettings` merges into the document's settings.

### Naming: mirror the bundle-name handling

A `presetFileName(raw)` helper trims, rejects empty names and path
separators (`/`, `\`), and appends `.json` when missing — the same shape as
`bundleFileName`. `writeWorkspaceFile` already overwrites, which gives the
overwrite semantics for free.

### UI: a Presets section in SpriteProperties

Name input + Save button, a preset `<select>` populated from a `presets`
listing in the project store (refreshed by the existing project-browser
refresh), plus Apply and Delete buttons; a hidden file input (with a drop
target on the section) covers import when disconnected or unsupported.
View-only documents disable Save and Apply, consistent with every other
control in the panel.

## Risks / Trade-offs

- [Preset references an HDRI by name; the file can move or be renamed
  across machines] → Named error + document unchanged, same contract as
  provenance restore for missing models/HDRIs.
- [Adding `presets/` mutates existing workspaces on reconnect] → Folder
  creation is already the established, idempotent connect behavior for the
  other four folders.
- [Hand-edited or foreign JSON files in `presets/`] → Strict format
  validation with named rejection; nothing partial is ever applied.
- [Extra render-pass restarts when applying] → Resolve-then-commit keeps it
  to a single re-run.

## Migration Plan

Purely additive; no data migration. Rollback = revert; stray `presets/`
folders in workspaces are inert.

## Open Questions

None.
