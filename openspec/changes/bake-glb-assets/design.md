# Design: Bake glTF assets (GLB / glTF)

## Context

The bake tool renders a `Primitive` — a hard-coded three.js `BufferGeometry`
plus one flat `albedoHex` uniform — through a single MRT draw (albedo +
g-buffer, half-float targets) with box-clipping in the fragment shader, then
exports PNG + EXR + manifest into a zip (`docs/bake-pipeline.md`). Everything
downstream of the source (`frameIsoBox`, depth semantics, exporter, bundle,
runtime `parseBake`) is already size-agnostic: the manifest records
`cube.size`, not a color, so textured albedo requires no format change.
three.js 0.185 ships `GLTFLoader` in `examples/jsm` — no new dependency.
`ColorManagement.enabled = false` globally in `bake.ts`; the albedo pass is
defined as sRGB-encoded (docs/bake-pipeline.md, "Passes").

## Goals / Non-Goals

**Goals:**

- One source abstraction that covers primitives and glTF files (both the
  self-contained `.glb` container and plain `.gltf` + `.bin` + textures)
  with minimal change to `bakePrimitive`.
- Per-pixel textured albedo (base-color texture × base-color factor) with the
  same sRGB-encoded output as today.
- Correct coverage semantics for masked materials; opaque treatment for
  blended ones.
- Static-mesh-only glTF scope with explicit user-facing skips/errors.
- Native-size placement with UI uniform scale; box min corner pinned at
  `(0,0,0)`.

**Non-Goals:**

- Compressed glTF payloads: DRACO, KTX2/Basis, Meshopt (would need decoder
  wasm dependencies) — rejected with a clear status message; follow-up change.
- Skinning/animation (not even bind-pose extraction).
- One-model-many-assets extraction, instancing, or scene composition.
- Supersampling / filtering quality work (separate planned item).
- Any runtime or bundle-format change.

## Decisions

### D1: glTF sources reuse the `Primitive` shape; bake loop gains per-material draws

Keep `Primitive { id, label, size, geometry, … }` as the internal source
type and extend it with optional material info instead of introducing a
parallel path. A new `src/bake/gltf.ts` parses either container into a
`Primitive`:

- Traverse `gltf.scene`, collect every visible `Mesh`, skip anything with a
  skeleton/`SkinnedMesh`, clone geometry, apply `matrixWorld`
  (`geometry.applyMatrix4`), and group geometries by material.
- Compute the merged `Box3`, translate all geometries by `-box.min` (then
  uniform scale about the origin when the UI scale ≠ 1); `size = extent ×
  scale`.
- Merge the geometries of each material group into one `BufferGeometry`
  (`BufferGeometryUtils.mergeGeometries`), indexed by draw order.

`bakePrimitive` then renders one draw call per material group into the *same*
MRT targets: the flat-color uniform path for primitives is just the
single-group case. Per-group uniforms: albedo texture (or null), base-color
factor, alpha mode + cutoff. The existing depth buffer resolves occlusion
between groups; the box-clip shader stays (the box is the model bounds, so it
is a no-op safety net).

*Alternatives considered:* a CPU software bake (slow, duplicates shader
logic); a load-time texture atlas so the whole model is one draw call (one
draw like today, but adds canvas atlas packing and UV remapping — extra
failure modes for no measurable gain at bake-time); rendering with three's
standard materials (would drag lighting/tone-mapping into a pass that must
stay unlit and deterministic).

### D2: Color math — sample sRGB to linear, multiply in linear, encode sRGB out

glTF defines base-color textures as sRGB and factors as linear; the albedo
pass stores sRGB. Set each loaded base-color texture to
`SRGBColorSpace` so the sampler hardware-decodes to linear, multiply by the
linear factor (default `(1,1,1,1)`), then apply the exact sRGB transfer
function in the fragment shader before writing `outAlbedo` (with
`ColorManagement.enabled = false`, three performs no automatic output
encoding, so the shader does it explicitly). The primitive path keeps writing
hex-as-stored, which is already an sRGB value — both paths land in the same
encoding. Add one dev-time visual check: a model with a solid known-color
texture must reproduce that hex in the albedo PNG.

*Alternative:* skip all conversion and multiply sRGB texels by the raw factor
— wrong (factor is linear), and it would silently break the "albedo is
sRGB" contract the runtime relies on when it converts to linear at sample
time.

### D3: Alpha semantics in the bake shader

Extend the shared fragment shader: when the group's material is
`alphaMode: MASK`, discard if `texture.a × baseColorFactor.a < alphaCutoff`;
when `BLEND`, ignore alpha (bake opaque). Coverage stays `1` on kept
fragments, so runtime hit-testing/occlusion sees holes exactly where the
texture is cut out.

### D4: Multi-file `.gltf` resolution via blob-URL resource mapping

A `.glb` is self-contained; a plain `.gltf` references external `.bin`
buffers and texture images by URI. The browser cannot touch the file system,
so the user provides the files together with the `.gltf` (multi-select file
input or multi-file drag-drop — see D5). Implementation: build a
`Map<uri, File>` keyed by percent-decoded, POSIX-normalized resource path
relative to the `.gltf`'s directory, and hand `GLTFLoader` a
`LoadingManager` whose `setURLModifier` rewrites each requested URL to a
blob URL of the matching file; a miss fails the load with an error naming
the missing resource (surfaced in the status line). `.glb` keeps the simple
`parseAsync(arrayBuffer)` path — same downstream code either way, since
both converge on one loaded glTF runtime scene.

*Alternatives considered:* a directory picker (`showDirectoryPicker`) —
cleaner UX but Chromium-only and the tool should stay portable; asking the
user to host files over HTTP — defeats the local-tool purpose.

### D5: Async load, sync bake; ownership and cleanup

`GLTFLoader` runs once per picked file set; the resulting `Primitive`
becomes the active source and bakes through the existing synchronous path on
every Bake click. After the geometries are uploaded by the first bake,
dispose the loader's scene/textures we no longer need; keep referenced
textures alive until the source is replaced, then dispose them (prevents
leaks across repeated loads of large models).

### D6: UI — glTF as a sibling source with a scale input

`bake.html` gains a "Load glTF" button (hidden multi-select file input,
`accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"`) next to the primitive
buttons, a numeric scale input (default 1, min > 0), and a source-name label
(`model.glb` / `scene.gltf + N resources`). Multi-file drag-drop onto the
button is equivalent to multi-select. The glTF entry highlights like an
active primitive; picking a primitive clears the glTF source and scale
returns to 1 when a new model loads. Errors/skips (parse failure,
DRACO/KTX2 payload, skinned-only file, missing `.gltf` resource, sprite
size cap) surface in the existing status line.

### D7: Guard rails on size

`frameIsoBox` at 128 px/unit on a multi-meter model yields enormous sprites.
Reject (status error) when projected sprite dimensions exceed 8192 px in
either axis; the user scales down. Vertex data without normals (rare, legal
in glTF) is rejected with a clear message — the g-buffer requires baked
normals and the spec forbids deriving them from depth.

## Risks / Trade-offs

- [sRGB handling with `ColorManagement.enabled = false` is easy to get
  subtly wrong] → D2 keeps all conversion explicit in-shader; verified by the
  known-color check in D2 and by eyeballing the albedo preview against the
  source textures.
- [Half-float depth precision degrades as native model size grows (absolute
  depth range scales with `size`)] → accepted; same half-precision contract
  as existing cuboids (docs/bake-pipeline.md "Precision"), plus the 8192 px
  sprite cap keeps sizes bounded in practice.
- [GLTFLoader feature surface is large (interleaved accessors, sparse
  accessors, morph targets)] → we only consume position/normal/uv/index of
  static meshes; anything exotic that fails conversion errors out per-file
  rather than corrupting the bake.
- [Per-material multi-draw renders groups in arbitrary order] → depth buffer
  makes order irrelevant for opaque geometry (all groups are opaque by D3).
- [Texture decode is async; a huge model could freeze the picker] →
  acceptable for a dev tool; status line reflects loading state.
- [`.gltf` resource URIs vary in encoding and subdirectory layout] → the
  D4 map keys on percent-decoded, relative POSIX paths (the glTF spec's
  expectation); anything unmatched errors with the exact missing name
  rather than guessing by basename, which could silently bind the wrong
  file.

## Migration Plan

Purely additive to the bake tool; no bundle/manifest/runtime changes, no
deployment migration. Rollback = revert the commit.

## Open Questions

None — scope questions (textured albedo, static-only, native size + UI
scale) were resolved with the requester before proposal.
