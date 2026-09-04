## Why

`GLTFLoader` (three r185) no longer supports `KHR_materials_pbrSpecularGlossiness`
(dropped upstream in r156), and Isofinity's glTF path has no handling for it.
A specGloss model therefore loads without any error but with silently wrong
materials: no `pbrMetallicRoughness` block exists, so the loader falls back to
glTF defaults — white base color, metalness 1, roughness 1 — and the bake
produces a white metallic sprite. The affected assets live in the user's
workspace, so fixing them once at the source is durable: every later load,
re-bake, and saved bundle stays clean.

## What Changes

- Detect `KHR_materials_pbrSpecularGlossiness` in a model's container JSON
  when a model is opened **from the workspace**, including a count of the
  affected materials.
- Offer a confirm dialog: convert the file in place to metallic-roughness.
  Declining opens the model as today (no offer is made for dialog-picked or
  dropped files in this change).
- Convert in the browser with `@gltf-transform` (WebIO + its `metalRough()`
  transform), which re-encodes the specular-glossiness textures per texel and
  emits a clean `pbrMetallicRoughness` material (plus `KHR_materials_specular`
  / `KHR_materials_ior` where needed, both supported by the loader).
- Overwrite the original `.glb` in the workspace's `models/` folder — no
  backup copy is kept.
- Load the converted bytes directly through the existing glTF path (no disk
  re-read), so the baked sprite always matches the file on disk.
- Scope to **.glb files only**; multi-file `.gltf` sets are out of scope.

## Capabilities

### New Capabilities

- `model-material-migration`: end-to-end workflow for workspace models that
  use the deprecated specular-glossiness material workflow — detection at
  open, user confirmation, in-browser conversion to metallic-roughness,
  in-place re-save in `models/`, and reload of the converted file.

### Modified Capabilities

<!-- none: existing load requirements still hold; specGloss models are not
     rejected today and remain loadable via dialog/drop unchanged. -->

## Impact

- New npm dependencies: `@gltf-transform/core`, `@gltf-transform/extensions`,
  `@gltf-transform/functions` (browser-supported; image re-encode via
  createImageBitmap/OffscreenCanvas, consistent with the app's Chromium
  requirement for the File System Access API).
- `src/bake/gltf.ts`: a small export for detecting the extension in already
  parsed container JSON (the read happens today for the Draco/KTX2 check).
- `src/app/store/bake.ts`: `openModelDoc` gains the detect → offer → convert
  → save → reload flow before the existing load call; the open-document
  dedupe by `model:<fileName>` must refresh (dispose + reload) rather than
  focus a stale document after an in-place fix.
- `src/shared/workspace.ts`: no API changes — `readWorkspaceFile` /
  `writeWorkspaceFile` already provide read and atomic overwrite.
- No changes to bundle formats, provenance schema, or loads of spec-free
  models.
