# Editor UI refactor — design

## Context

Current homes of the affected controls (see proposal.md for motivation):

- `src/app/components/ProjectBrowser.tsx:31-40` — "Primitives" section; each
  button calls `openPrimitiveDoc` (`src/app/store/bake.ts:131-145`), which
  auto-bakes raster + render on open. `openPrimitiveDoc` has no other caller.
- `src/app/components/SpriteProperties.tsx` — section order: Source (147-197),
  Path tracing (199-227), Environment (230-303, holding the render-pass button
  at 304-310), "Re-bake raster" button (191-196), Presets (313), Debug,
  view-only notice. `PresetsSection` (24-118) has select + explicit Apply.
- `src/app/components/SpriteEditor.tsx:272-287` — sprite `EditorToolbar` row
  with Save and Place in world.
- `src/app/store/bake.ts` — `bakeRaster` (405-423) is a synchronous single
  raster draw updating `doc.result`; `runRenderPass` (444-486) guards on
  `doc.result && doc.ptEnv.texture` and accumulates via the per-document
  `PtBaker` guarded by a generation token (`invalidateRunningRender`).
  Document-open paths auto-bake the raster pass (`openModelWithSource`:175,
  `openGltfFiles`:275, specGloss refresh:243); bundle opens ship a g-buffer and
  restore provenance (`openBundleDoc`:287-368).

Invariant that makes the implicit bake safe: every non-view-only bake document
resolves a primitive through `primitiveFor` (`src/app/store/bake.ts:391-400` —
primitive source, or model source with `doc.gltf` loaded); view-only documents
early-return from both pass actions. Every document also holds a procedural
environment by default (`baseBakeDoc`, `ptEnv: proceduralEnvironment()`), so an
editable document can always render.

## Goals / Non-Goals

**Goals:**

- One explicit render action that always leaves a g-buffer and render pass that
  are current with the document's source/settings and pixel-aligned.
- Preset application in one interaction, with management controls at the top of
  the properties panel.
- Project browser reduced to workspace assets + import/create actions.

**Non-Goals:**

- No auto-render on setting changes — the explicit-action principle stays;
  only the trigger set shrinks to the toolbar render action.
- No bundle or preset format changes; no preset rename UI; no changes to the
  world editor (its brush dropdown keeps the Primitives group; primitives
  there bake via `bakePrimitiveLayer`, untouched).
- Not reconciling the pre-existing conflict between `asset-baking`'s
  "Controls re-render" scenario and `integrated-editor`'s explicit-action rule;
  this change adds no `asset-baking` delta.

## Decisions

### 1. Render action re-bakes the raster pass first, always

`runRenderPass` drops its `!doc.result` guard and instead performs the raster
bake as its first step for every editable document, then accumulates the PT
pass against the fresh g-buffer.

- Alternative considered: track a "g-buffer stale" flag (set by `setModelScale`,
  source reloads, provenance edits) and re-bake only when stale. Rejected:
  more state to keep correct across scale/source/bundle paths, while `bakeRaster`
  is a single synchronous raster draw costing milliseconds against a
  seconds-long PT accumulation. Always re-bake can never drift out of alignment.
- Sequencing: set `busy`, run `bakeRaster`'s logic (inline or extracted, keep it
  exported=false afterwards since the panel button is gone), then proceed with
  the existing baker setup (`applySettings`/`setEnvironment`/`setPrimitive`) and
  accumulation. The generation token still governs the async part; the raster
  step is synchronous so no token interaction is needed.
- Status messages: raster step reports its usual `WxH px @ N px/unit` line,
  then the existing `rendering S/T samples…` progress takes over.
- `openPrimitiveDoc` is deleted (browser entry gone). Document-open paths keep
  their initial auto-bake; `openModelWithSource` keeps raster-only on open
  (render stays explicit).
- Bundle docs: view-only docs early-return as today; editable `/5` docs
  re-bake raster + render from restored provenance, matching the re-bake
  behavior in `asset-baking`. Primitive-provenance bundles keep re-baking from
  built-in geometry even though the browser no longer lists primitives.

### 2. Render action lives in the sprite editor toolbar (user decision)

`SpriteEditor` renders the action in its `EditorToolbar` row between Save and
Place in world. Label from document state: `Rendering…` while `busy`, else
`Re-render pass` when `doc.render` exists, else `Render pass`. Disabled when
`doc.viewOnly || doc.busy`. `SpriteProperties` loses both pass buttons.

- Alternative considered: global `TopBar` (context-sensitive). Rejected by the
  user: the per-editor toolbar keeps document actions together with
  Save / Place in world.

### 3. Presets apply on selection; Apply button removed

`PresetsSection`'s `<select>` `onChange` stores the selection and immediately
invokes `applyWorkspacePreset`. To let the component revert the dropdown on
failure, `applyWorkspacePreset`/`applyPreset` return an applied boolean; on
failure the component resets `selected` to `''`. The placeholder option
("workspace presets…" / "no presets in the workspace") and the view-only
disable stay as today. Delete, Save preset, Import file…, and drag-drop keep
their current explicit semantics (import applies immediately, as before).

- Alternative considered: keep the failed name selected with an inline error.
  Rejected: a selected-but-not-applied entry miscommunicates state; the status
  bar already carries the named error.

### 4. Presets first in the panel

Move `<PresetsSection>` above the Source section in `SpriteProperties`' JSX.
"Rendering settings" (Source, Path tracing, Environment) all follow; Debug and
the view-only notice stay at the bottom. Pure JSX reorder, no state changes.

### 5. Browser loses the primitives section; supporting code trimmed

Remove the Primitives `<section>` from `ProjectBrowser` and delete
`openPrimitiveDoc` plus its `PRIMITIVE_KINDS` import there. `PRIMITIVE_KINDS`
(`src/app/document.ts`) and the `PRIMITIVES` geometry record stay — the world
toolbar brush dropdown and `primitiveFor`/`bakePrimitiveLayer` still use them.
The glTF import dialog and "New world" action remain the browser's create
paths; without a workspace the browser keeps explaining that workspace assets
need a connection.

## Risks / Trade-offs

- [Every render re-bakes the raster pass] → Single synchronous raster draw,
  negligible next to PT accumulation; buys a hard alignment guarantee between
  g-buffer and render pass.
- [No g-buffer-only refresh anymore] → Refreshing the Normals/Depth views
  after a source/scale change requires running a render action (which re-bakes
  first). This is the requested trade ("no dedicated button"); g-buffer-only
  bundles remain possible by saving a model-opened document without rendering.
- [Mis-clicks in the preset dropdown now mutate the document] → Application is
  non-destructive (passes untouched; in-flight render discarded per the stale
  rule) and every value stays editable; deleting presets stays explicit.
- [Doc drift] → Tasks include updating `docs/runtime.md` (project browser,
  sprite editing) and `docs/bake-pipeline.md` (presets, explicit-buttons-only
  rendering wording).

## Migration Plan

Pure editor-UI refactor with no data-format changes: nothing to migrate, and
rollback is a revert. In-memory `builtin:*` document refs disappear with the
feature; documents do not survive a reload, so no persistence concern.

## Open Questions

None.
