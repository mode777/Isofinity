## Context

The world compositor (`src/runtime/renderer.ts`) is a raw WebGL2 2D
compositor, deliberately matrix-free: the camera is a fixed orthographic
frame (`src/shared/iso.ts`), projection happens once on the CPU, and each
sprite fragment writes `gl_FragDepth = 0.5 - d/128` with
`d = dot(worldPos, viewDir)` (g-buffer depth + per-instance offset).
Depth is world-anchored (ADR 0001), the camera never moves (ADR 0005),
and shading is the shared `SHADE_CHUNK` over the baked prerender
(ADR 0003). This design assumes static vertex data; skinned animation is
the first feature that breaks that assumption. See proposal.md — Why.

three.js is already a dependency (bake path tracing, sprite editor
realtime preview). The bundled `free_base_mesh.glb` is a static figure —
no skin, no clips — so the test asset is Khronos CesiumMan (skinned, one
walk clip, ~30 joints, CC-BY).

## Goals / Non-Goals

**Goals**

- Animated skinned character among sprites with pixel-exact shared-z
  occlusion, in the existing raw-GL compositor (Option A).
- Shading that reads as the same world: environment ambient + key factor +
  ACES, replicating the sprite formula.
- Character placement through the existing brush machinery, in-memory only.
- Architecture decision recorded so the deferred three.js-renderer
  question is settled, not silently open.

**Non-Goals**

- Everything in proposal.md — Non-goals; plus: no bake-pipeline changes of
  any kind, no new sprite-pass work, no instanced multi-character
  optimization, no mesh texture extraction beyond what CesiumMan needs
  (base color texture), no skeletal retargeting/IK.

## Decisions

### D1 — Option A: raw-GL compositor + three.js as CPU libraries

The mesh batch is a new program in `renderer.ts`; three.js contributes
GLTFLoader (parse) and AnimationMixer/Skeleton (CPU pose sampling) and
makes **zero GL calls**.

- *Rejected: full three.js renderer for the world view (Option B).* Loses
  for now: it forces a rewrite of a working compositor (4 batches →
  ShaderMaterials) with regression risk, to buy capability (native
  SkinnedMesh path, morph targets) that is explicitly deferred. The depth
  bridge survives a port (tuned ortho near/far reproduces the same linear
  window-depth map), so deferral is safe — nothing about Option A
  forecloses B.
- *Rejected: interleaving raw GL and three.js render calls in one frame
  (Option C).* Loses: three.js caches GL state assuming it owns the
  context; raw calls between three renders desync its cache
  (`renderer.resetState()` is a band-aid). Two canvases are worse — GL
  contexts cannot share a depth buffer, killing per-pixel occlusion, the
  core requirement. Single context + single state owner per frame is
  mandatory; A is the smallest blast radius that satisfies it.
- *Rejected: hand-rolled animation runtime.* Skinning math is trivial
  (~10 shader lines), but clip sampling/slerp/wrapping is where the real
  complexity lives; three.js's CPU-side animation system is battle-tested
  and renderer-independent.
- **ADR**: this becomes `docs/decisions/0007` (dynamic meshes in the
  compositor: single-context/single-state-owner; three.js-as-libraries;
  full-renderer adoption deferred with a known migration path).

### D2 — GPU palette skinning, one draw call per character

Vertex shader: `worldPos = Σ wᵢ · palette[jᵢ] · pos`,
`normal = normalize(Σ wᵢ · mat3(palette[jᵢ]) · normal)`, 4 influences
(glTF upper bound). Palette = per-joint `bone.matrixWorld · boneInverse`,
sampled per frame on the CPU (mixer.update), uploaded as a uniform
`mat4[]` (cap 64; CesiumMan ≈ 30). One draw call per character — palettes
differ per instance, so instancing across characters is impossible without
a per-instance joint texture; that optimization waits for a demonstrated
need (dozens of characters).

Per-instance data (yaw + translation, like sprites: `aInst`-style), so
moving a character is a per-frame float update — the instance array is
already rebuilt every frame.

### D3 — Depth bridge: same formula, new varying

Mesh vertex computes `vDepth = dot(worldPos, VIEW_DIR)` (the varying);
fragment writes `gl_FragDepth = uDepthA * vDepth + uDepthB`, reusing the
sprite program's exact `uDepthA`/`uDepthB` uniforms
(`DEPTH_LINEAR_RANGE`). Screen position uses the same CPU constants
(`SCREEN_RIGHT`/`SCREEN_UP`/PPU/origin) inlined into the vertex shader.
No matrices beyond the palette; the "no camera matrices" invariant holds.

### D4 — Draw order: opaque meshes between shadows and sprites

Frame order: ground → shadows → **meshes** (opaque, depth write, blend
off) → sprites (blended, depth test LEQUAL, `gl_FragDepth`) → overlay.
Correctness by case analysis: mesh-in-front kills sprite fragments via
depth; sprite-in-front blends over mesh; sprite-transparent pixels
(g-buffer-empty discard) reveal mesh; mesh-vs-mesh is plain z-buffer.
This is why meshes must be opaque — transparent meshes would need
sort/split logic and are out of scope.

### D5 — Shading parity: SH ambient + key factor inside ACES

Sprite final color:
`sRGB(ACES(albedo·E_env(N)) · factor)`. Mesh final color:
`sRGB(ACES(albedo · SH_env(N) · factor))` — the dynamic-light factor is
applied *inside* the tonemap, replicating where sprites carry it
(baked into the texel). The SH probe: 9 RGB coefficients (L2 diffuse
irradiance) projected once per environment from a downsampled
equirectangular scan (or the procedural env's eval function), applied
per-pixel as the quadratic normal polynomial (~10 ALU — effectively
free). Environment resolution: loaded bundles' provenance (first
resolvable wins), else the built-in default. ACES + sRGB fits copied from
the bake tonemap.

The mesh fragment shader **copies** `SHADE_CHUNK` (plus ACES) into its own
source. The shared chunk is never edited — the sprite path must stay
byte-identical.

Known gap, accepted: SH ambient is diffuse-only; sprites carry the path
tracer's speculars. Characters read slightly matte — matches the
double-shading tolerance of ADR 0003.

### D6 — Asset: committed CesiumMan, three.js-parsed

CesiumMan GLB committed under `src/app/assets/` with a CC-BY attribution
note (in-repo asset, like the base mesh). Loader: GLTFLoader `parse()`,
walk scene for `SkinnedMesh` → extract interleaved
position/normal/JOINTS_0/WEIGHTS_0 + indices into a raw-GL VBO/IBO;
skeleton bones + `boneInverses` + `AnimationClip` stay in three.js
objects as the CPU pose engine. Static fallback: if the asset has no
skin, the palette is identity (keeps the batch testable with any glTF).

### D7 — Brush integration without persistence

Placement gains a mesh kind (asset ref + position/height/yaw) in the
in-memory world document only; the brush dropdown gains the built-in
character. Ghost = same mesh draw at the cursor (animated or bind-pose —
bind pose is cheaper and reads fine as a preview). Contact shadows reuse
the ellipse machinery (footprint-based). Erase resolves topmost across
both kinds (existing depth-key comparison). **Mesh placements are
editor-session state and are never serialized** (ADR 0006): world JSON
stays `isoinfinity-world/3`; save/load code untouched.

## Risks / Trade-offs

- [Editing shared GLSL shifts every sprite pixel] → mesh shader copies
  `SHADE_CHUNK`; sprite program source untouched; regression hash guards.
- [Depth-test coupling: sprites now see mesh depth] → no meshes placed ⇒
  no mesh depth writes ⇒ frame bitwise identical; empty-batch skip stays.
- [Uniform vertex budget: 64-joint palette = 256 vec4] → over GLES3
  minimum (256 vec4) but fine on all real desktop/mobile GL; joint cap
  enforced at load (assets above cap fail with a named error); texture
  palette is the escape hatch if ever needed.
- [three.js pose engine leaks into render loop cost] → per-frame cost is
  `mixer.update` + ~30 mat4 multiplies per character — negligible; no GL
  calls to desync state.
- [Look mismatch: matte characters vs specular sprites] → accepted gap
  (diffuse-only SH); revisit with a specular term only if it reads wrong
  in practice.
- [Regression detection has no automated runtime harness] → scratch-verify
  gains a fixed mesh-in-scene golden hash; `npm run build` +
  `npm run verify:bundles` confirm the untouched surface.

## Migration Plan

Strictly additive; no deployment/migration concerns. Rollback = revert.
Bake bundles and world JSON formats unchanged; old worlds load as before.

## Open Questions

None material. (Deferred to later changes, by design: serialization of
mesh placements, terrain/dynamic ground plane and its placement-`y`
semantics, multi-character instancing, locomotion.)
