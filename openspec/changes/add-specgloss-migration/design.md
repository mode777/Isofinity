## Context

Isofinity loads glTF models through `GLTFLoader` (three r185), which dropped
`KHR_materials_pbrSpecularGlossiness` support upstream (r156). A specGloss
model parses without error but yields glTF default materials (white base
color, metalness 1, roughness 1), so bakes come out wrong silently. The
container JSON is already read before the loader runs (`readContainerJson`
in `src/bake/gltf.ts`, used by the Draco/KTX2 rejection check), and the
workspace layer is bound `readwrite` with existing `readWorkspaceFile` /
`writeWorkspaceFile` primitives. See proposal.md for motivation and the
specs for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Durable repair: the workspace file itself becomes a clean
  metallic-roughness asset; every later load, re-bake, and bundle inherits
  the fix.
- Reuse the maintained per-texel conversion math instead of porting it.
- Keep the blast radius small: one store function changes shape, the load
  path itself (`loadGltf`) gains detection only.

**Non-Goals:**

- Multi-file `.gltf` set conversion (v1 is `.glb` only).
- Offers on dialog-picked or dropped files (workspace-open only).
- Backup copies of overwritten files (user declined; FSA `createWritable`
  is swap-atomic on close, so a crash mid-write does not corrupt the
  original).
- A general "unknown extension" migration framework; only specGloss is
  detected.

## Decisions

### Use `@gltf-transform` (WebIO + `metalRough()`) for the conversion

`@gltf-transform/extensions` reads specGloss; `metalRough()` converts
materials per texel (Khronos `SolveMetallic`), re-encodes the
specular-glossiness textures, removes the extension, and emits
`KHR_materials_specular` / `KHR_materials_ior` where the MR workflow needs
them. The installed `GLTFLoader` supports both of those, yielding a
`MeshPhysicalMaterial`, which the pipeline already accepts
(`isMeshStandardMaterial` is true for Physical in `gltf.ts`).

Alternatives rejected:

- **Hand-rolled JSON + canvas conversion** — re-implements maintained,
  tested math (channel re-encode, sRGB handling) with ongoing correctness
  burden.
- **Loader plugin translating specGloss at load time** — leaves the asset
  broken on disk forever and only helps Isofinity.
- **Offline-only script** — correct but outside the tool; the workspace
  binding makes in-app repair cheap and discoverable.

The three packages are loaded via dynamic `import()` so the chunk is
fetched only when a user actually accepts a fix.

### Bridge picked files to WebIO with a blob URL

For the GLB case, create one object URL for the source `File` and hand it to
`WebIO.read`; WebIO fetches it and resolves embedded resources itself. The
exact v4 read/write-from-bytes API surface is the first spike task; the
fallback is building a `JSONDocument` (`{json, resources}`) from
`readContainerJson` output plus the BIN chunk — all parts already exist.
Output is written via `writeWorkspaceFile('models', name, bytes)`.

### Order: convert → write → load converted bytes in memory

After conversion, the file is saved first and the sprite document is built
from the converted bytes (`loadGltf` on a `File` constructed from the
output), never re-read from disk. What is baked is then guaranteed
byte-identical to what is on disk, and the open-document refresh reduces to
disposing the stale doc and re-running the normal open path.

### Detection lives beside the existing extension check

A small exported helper in `src/bake/gltf.ts` takes the parsed container
JSON and reports whether specGloss is used and how many materials carry it.
`openModelDoc` in `src/app/store/bake.ts` calls it (GLB names only) before
`loadModelFromWorkspace` and branches into the confirm/convert flow.
`loadGltf` itself keeps its current behavior for every path, so
picker/drop and `.gltf` sets are unchanged by construction.

### Confirm via `window.confirm` for v1

The app's only existing dialog primitive is `window.confirm`
(TabBar.tsx); the message names the file and material count. A styled
dialog is UI polish that can land later without touching this flow's
shape.

## Risks / Trade-offs

- [Conversion is lossy for strongly tinted dielectric speculars] →
  `metalRough()` preserves them via `KHR_materials_specular`; verify one
  converted model's baked sprite against the source asset's renders before
  considering the flow done. Common cases (white-ish dielectric speculars,
  tinted metals) convert essentially exactly.
- [`WebGLPathTracer` handling of the specular-extension material] →
  confirmed in practice: `metalRough()` emits `KHR_materials_ior` with
  `ior = 1000` so three's *realtime* shader saturates its ior-derived F0 —
  and realtime looks right because its Lambert diffuse is not reduced
  against F0. The path tracer instead treats ior physically
  (`f0 = ((ior-1)/(ior+1))² ≈ 1`, diffuse weighted by `1 − disneyFresnel`),
  so the diffuse term is annihilated and baked renders come out nearly
  black. Fix applied in `clampDegenerateIor` (`src/bake/specgloss.ts`):
  rewrite degenerate ior values (outside [1, 2]) to the glTF-normal 1.5
  after the transform, keeping the specular extension (harmless at
  F0 = 0.04 × tint in both renderers, and preserves any legitimate
  specular-tint data). Previously considered but rejected: stripping the
  specular extension entirely — equivalent in the path tracer, strictly
  less information in the realtime preview.
- [Exact `@gltf-transform` v4 read/write API shape] → first task is a
  spike; the blob-URL route minimizes surface, and the JSONDocument route
  is the documented fallback.
- [Main-thread texture re-encode blocks the UI on large textures] →
  status-bar progress text around the conversion; a Worker is a later
  optimization and does not change the flow.
- [Overwrite is irreversible by design (no backup)] → FSA writes are
  swap-atomic on close, so partial writes cannot corrupt the original;
  failures leave the file untouched per the spec.
- [Bundle size growth] → dynamic import confines gltf-transform to one
  lazily fetched chunk; the editor build has no strict size budget today.
