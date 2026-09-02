# Design: path-traced-bake-render

## Context

The bake tool renders one raster MRT draw per bake (`src/bake/bake.ts`):
unlit albedo (sRGB PNG) + g-buffer EXR (world normal + linear ray depth),
packaged as `isoinfinity-bake/3` zip bundles and consumed by a raw-WebGL2
runtime that shades albedo with a Lambert key + ambient. All bake camera
math lives in `src/bake/iso.ts` / `src/shared/iso.ts` (fixed 45°/30°
orthographic, box-framed). Constraints: WebGL2 only (no WebGPU), TypeScript
+ Vite, three.js 0.185 already in the tree, no browser available in the dev
environment for verification.

The PoE baseline (`docs/poe-rendering-baseline.md`) bakes a lit "final"
image AND an unlit albedo; dynamic lights conform to the baked image. This
change adds the lit pass without touching the frozen g-buffer (see
proposal.md for scope; requirements in the delta specs).

## Goals / Non-Goals

**Goals:**

- Path-traced `render` + optional `ao` passes, pixel-aligned with the
  raster passes, transparent background, deterministic for fixed settings.
- HDRI equirect environments (`.hdr`) with rotation/intensity/exposure.
- Full PBR material consumption (base color, metallic-roughness, normal
  maps) for the render stage only.
- Bundle format `/4` with optional passes; parser accepts `/3` and `/4`.
- Runtime per-sprite baked/unlit display mode with a global dynamic-light
  kill switch.

**Non-Goals:**

- Any change to the raster pass shaders, depth/normal conventions, or the
  `frameIsoBox` camera math.
- External/offline renderers (Blender/Cycles, Mitsuba) — evaluated and
  rejected, see Decisions.
- Bake "application" shell (sessions/projects, batch queue, HDRI library
  management) — later growth; this change only extends the current page.
- Improvements to the runtime's dynamic lighting model.

## Decisions

### D1: Renderer = three-gpu-pathtracer, in-browser

Chosen over Blender/Cycles headless (industry standard but a Python
sidecar: new toolchain, re-implemented camera math and bundler, not
installable/verifiable here) and Mitsuba 3 (research-grade). Verified
against the library source (commit `171a224`):

- Ortho cameras: `CAMERA_TYPE = 1` define; ortho ray generation unprojects
  NDC ray origins through `invProjectionMatrix` with a shared direction
  (`camera_util_functions.glsl.js`). Works with a plain
  `three.OrthographicCamera` — i.e. the existing `frameIsoBox` camera.
- Transparency: `scene.background = null` → `backgroundAlpha = 0`
  (`WebGLPathTracer.js`); miss pixels write that alpha; accumulation then
  uses the library's manual-blend path so the target keeps per-pixel
  averaged RGBA without needing `EXT_float_blend`.
- Dedicated AO: `AmbientOcclusionMaterial` (raster material, BVH ray
  queries, cosine-hemisphere sampling, radius control) works with any
  camera including ours.
- Compat: peer `three >= 0.180` (we are on 0.185); adds
  `three-gpu-pathtracer` + `three-mesh-bvh` deps. Pin exact versions.

Risk hook: ortho + alpha are verified features but not the library's
primary path; the first task is a thin spike exercising exactly that
combination before anything builds on it.

### D2: Second renderer over the same scene, raster pass untouched

The raster MRT bake keeps producing albedo + g-buffer exactly as today
(same `bakePrimitive` call path). The PT stages reuse the already-built
three.js scene (meshes, transforms) and the same ortho camera object, so
alignment is structural, not tuned. The raster pass's custom ShaderMaterial
is material-independent, so feeding the scene full PBR materials for the PT
stage cannot perturb it.

Alternative considered: PT for everything including g-buffer — rejected:
g-buffer is frozen by requirement, and raster coverage (hard 0/1 alpha) is
the hit-testing contract (see D6).

### D3: Ortho camera reuse and AA jitter

Pass the exact `frameIsoBox` `OrthographicCamera` to
`WebGLPathTracer.setScene(scene, camera)`; update camera →
`pathTracer.updateCamera()` + `reset()`. The library jitters NDC per sample
(tent filter) for anti-aliasing, which is projection-agnostic — ortho edges
converge to true-AA. Sprite rect and `originPx` come from the same
`frameIsoBox` call as the raster bake.

### D4: Render pass export = library accumulation + three's tonemap chunks

Readback of the accumulated target is linear float RGBA (straight alpha:
object pixels ≈ 1, background → 0). Export composites that through a
fullscreen quad whose material includes three's `<tonemapping_fragment>`
(`renderer.toneMapping = ACESFilmicToneMapping`) and
`<colorspace_fragment>` into an RGBA8 target, then `readPixels` → PNG
bytes. This makes the exported file pixel-identical to the preview by
construction (same shader chunks), avoiding a JS-side ACES reimplementation
that could drift from three's fit. Alpha passes through untone-mapped.

AO export: same quad path with a pass-through material (no tonemap), or
direct readback — AO is already display-ready grayscale.

### D5: AO pass via AmbientOcclusionMaterial + running-average accumulation

Follow `example/aoRender.js`: swap scene materials to
`AmbientOcclusionMaterial` (shared BVH uniform), render progressive
samples into two targets with a `1/(n+1)` blend, jittered view offset for
AA. Same ortho camera and sprite rect; background stays alpha 0 via clear
color. Radius + samples are UI controls. Alternative white-HDRI GI rejected
(bakes GI, not AO; couples AO look to exposure); screen-space AO rejected
(bias, no BVH ray accuracy).

### D6: Coverage semantics stay split — raster alpha is the contract

PT coverage is sample-averaged (soft edges); raster coverage is hard 0/1.
Occlusion (`gl_FragDepth`) and hit-testing keep consuming raster coverage
and g-buffer depth; only display blends use the render pass's alpha. This
is spec'd (`runtime-sprite-rendering`) and prevents half-pixel silhouette
differences from perturbing picking/occlusion.

### D7: PBR materials from the existing glTF path

`loadGltf` already produces per-material merged draw groups via
`GLTFLoader`; today it reduces materials to base color. For the PT stage,
keep `GLTFLoader`'s full `MeshStandardMaterial` (base color map/factor,
metallic/roughness, normal map) on the scene; the raster pass continues to
override with its own ShaderMaterial. Normalize texture wrap/filter flags
across all materials (library gotcha: they must match) and expose the PT
texture-array packing size (`textureSize`, default 1024²) as a bake
setting; large albedo textures downscale into it. Alpha MASK →
`alphaTest` on the standard material so the PT honors cutoffs.

### D8: Bundle format /4 — additive, parser dual-accepts

Manifest `format: "isoinfinity-bake/4"`. G-buffer EXR and albedo PNG keep
byte conventions of `/3`. New optional entries `<id>-render.png` and
`<id>-ao.png`; manifest `passes` table lists which are present, plus a new
`environment` block (hdri name, rotation, intensity, exposure) and
`renderer` block (library + version, samples, bounces, denoise, seed) —
provenance metadata so a bake is reproducible from its bundle. `parseBake`
accepts `/3` and `/4`; unknown formats error by name. Old runtimes reject
`/4` — accepted break (no released API).

### D9: Runtime display mode

Assets gain optional `render` (and `ao`) layers in the existing sprite
texture arrays. Per-placement `displayMode: 'baked' | 'unlit'` plus a
default for new placements; toolbar UI for both. Baked mode samples the
render layer (its alpha drives blending); unlit mode is today's
`albedo * (ambient + key * dot(N,L))`. A global "dynamic lighting" switch
sets key/ambient to off — baked sprites unaffected, unlit sprites show raw
albedo. Occlusion code paths untouched (D6). v3 bundles: no render layer,
mode locked to unlit.

### D10: Determinism

Seed uniform is fixed per bake (seed input in the UI, default constant);
sample accumulation order is fixed; a fixed sample count reproduces a
given bake bit-for-bit on the same hardware/driver — sufficient for
golden-image diffing with small tolerance. Document that cross-GPU byte
equality is not a goal.

## Risks / Trade-offs

- [Library is single-maintainer; ortho+transparent is not its demo path]
  → D1 spike first (ortho camera + `backgroundAlpha 0` + readback on a
  cube); pin the dependency version; the raster path remains a working
  fallback if the PT path must be disabled.
- [PT is slow at 128 px/unit on large sprites (up to 8192²)]
  → progressive accumulation with a convergence bar; tiles setting;
  user-controlled sample budget; resolution (pxPerUnit) stays a choice.
- [Half-pixel mismatch between soft PT alpha and hard raster coverage]
  → display/occlusion contract split (D6), spec'd.
- [Texture-array packing can visibly downscale big albedo maps]
  → expose `textureSize`; surface the per-material texture scale in the
  status line so the cause is visible.
- [Row-order/readback flips are a proven bug class in this codebase]
  → reuse the existing flip helpers for every new pass readback; verify
  render/ao passes land top-down like the PNG path.
- [HDRI dynamic range can blow out the bake]
  → ACES + exposure control; default intensity 1; env intensity/rotation
  restart accumulation deterministically.
- [Denoiser (glslSmartDeNoise) is a screen-space approximation]
  → optional checkbox, default off; low-sample noise is preferable to
  smoothing artifacts in baked assets; real denoising (OIDN) is future work.

## Migration Plan

No data migration: bundles are files users re-export. Order of work —
spike (D1), PT render pass + export, AO pass, format /4 + bundler, PBR
materials, runtime display mode, docs. Runtime lands last so `/4` bundles
are immediately loadable; until then new passes are preview-only in the
bake tool. Rollback = revert; `/4` writer and dual-format parser are
independent enough to ship incrementally.

## Open Questions

- Default sample count / bounces / AO radius — tune during apply against
  the reference viewer quality; settings are user-facing so defaults are
  not contractual.
- Whether the AO pass ships in the same UI release as the render pass or
  lands as a fast-follow task — task order in tasks.md, no spec impact.
