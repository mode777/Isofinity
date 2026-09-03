## Why

Every sprite document starts from default bake settings, and reproducing a
previously tuned look (sample budget, HDRI choice, lighting parameters) means
re-entering every value by hand or opening an old bundle to copy its numbers.
Named presets stored in the workspace make bake looks reusable across sprites
and sessions, the same way `hdri/`, `models/`, `sprites/` and `worlds/` make
the other asset kinds reusable.

## What Changes

- New preset document kind for bakes: a named JSON file in the workspace's
  `presets/` folder capturing path-trace quality (samples, bounces) and the
  full environment (procedural, or HDRI file name + rotation, intensity,
  exposure, saturation). Texture size is deliberately **not** part of a
  preset — it is model-dependent (texture atlas budget) and stays
  per-document.
- The sprite properties panel gains a Presets section: save the current
  settings under a name, pick a preset from the workspace listing to apply,
  and delete a preset. Applying a preset updates path-trace settings and
  environment parameters, loads the preset's HDRI from the workspace's
  `hdri/` folder, and re-runs the render pass when one already exists.
- The workspace folder convention gains `presets/` (created on connect like
  the other convention folders).
- Without a connected workspace (or without File System Access), presets
  degrade to the established fallbacks: download for save, file-dialog /
  drag-drop import for apply.

## Capabilities

### New Capabilities

- `bake-presets`: Named, workspace-stored bake-setting presets — file format,
  save/apply/delete behavior in the sprite editor, HDRI resolution, and the
  no-workspace fallback.

### Modified Capabilities

- `workspace`: The folder convention extends with `presets/` — created on
  connect alongside `hdri/`, `models/`, `sprites/`, `worlds/`.

## Impact

- `src/shared/workspace.ts` — `WORKSPACE_FOLDERS` gains `presets`.
- `src/app/store/bake.ts` (or a new preset store module) — preset save/apply
  actions; preset JSON type shared with the editor.
- `src/app/components/SpriteProperties.tsx` — Presets section UI.
- `src/app/store/project.ts` — preset listing refresh, like the other folder
  listings.
- No engine/runtime or bundle-format changes: presets never enter
  `.sprite` bundles or the manifest; the runtime is untouched.
