## Context

The runtime currently has two sprite display paths in `SPRITE_FRAG`
(`src/runtime/renderer.ts`): unlit (albedo × dynamic lights) and baked
(render texel × dynamic lights, selected by the per-instance `vBaked`
flag). Boot bakes (`bakeSpriteLayers`, `src/runtime/assets.ts`) are
raster-only, so boot primitives have no render pass and can only display
unlit — the blocker that has kept both paths alive. The bake side already
has a headless-capable path tracer: `PtBaker` (`src/bake/pt.ts`) takes a
primitive + environment and returns the tonemapped, sRGB-encoded render
pass as bytes, independent of the bake tool UI.

See proposal.md for motivation; the delta spec holds the behavior contract.

## Goals / Non-Goals

**Goals:**

- One display path: every sprite = prerendered image × dynamic lights.
- Boot sprites become first-class rendered sprites (procedural environment,
  no asset files, no user input).
- Runtime stops consuming the albedo pass entirely.

**Non-Goals:**

- No bake-tool changes and no bundle-format bump (`isoinfinity-bake/4`
  stays; albedo keeps shipping in bundles — the runtime just ignores it).
- No changes to light controls, ground shading, placement UX, or the
  Dynamic light switch semantics.
- No quality knobs exposed for the boot bake (samples/bounces are internal
  constants for now).

## Decisions

### D1: Coverage moves from albedo alpha to g-buffer emptiness

With albedo out of the renderer, fragment discard switches to the
documented g-buffer emptiness test (`normal == 0`, NEAREST-sampled).
Background pixels are exactly zero in both attachments of the same MRT
draw, so the discard set is identical to the old `albedo.a < 0.01` test —
occlusion boundaries, `gl_FragDepth` writes, and footprint picking are
unchanged. Blending keeps the render pass's AA alpha (as baked mode always
did), so soft-edge pixels still render and blend. Alternative considered:
keep uploading albedo just for its alpha channel — rejected, VRAM and
upload cost for zero behavioral difference.

### D2: Boot render passes via `PtBaker` + a procedural equirect environment

`bakeSpriteLayers` becomes async: after the existing raster MRT bake, it
feeds the same primitive to a shared `PtBaker`
(`setPrimitive(prim, RUNTIME_PPU)`) with a generated environment and
collects `renderPass()` output per primitive. The environment is a
128×64 RGBA-float `DataTexture` in equirect mapping, filled by a pure
function: vertical sky gradient, darker ground below the horizon, and a
warm sun disc (cosine-lobe) placed at the default key light direction
(azimuth 60°, elevation 45°) so baked light and the dynamic key light
agree by construction — minimizing the double-shading mismatch at default
settings. Intensity/exposure 1, rotation 0. Alternatives: shipping an HDRI
binary (asset weight, licensing questions) or a raster fake-render (two
quality tiers, defeats the purpose). `WebGLPathTracer` samples the env by
direction, exactly like `HDRLoader`-loaded equirects, so the PT accepts the
DataTexture unchanged.

The `PtImage` comes back in GL readback order (bottom-up), so the runtime
flips it to top-down with the same convention as `bakeFloatToBytes` before
padding into the texture array.

### D3: Bundle loading requires the render pass

`layerFromBundle` throws a named error (`bundle has no render pass —
re-bake with an environment`) when `parseBake` reports no render pass,
covering both `/3` bundles and `/4`-without-render; it also stops decoding
the albedo PNG. `parseBake` itself stays permissive (it validates format
and manifest, not pass selection) so the bake tool keeps using it for `/3`
inspection.

### D4: Single instance path; the baked flag disappears

`SPRITE_VERT` loses `aInst3`/`vBaked` (stride 48 → 32 bytes); `renderFrame`
stops computing the flag; `Renderer.setSprites` loses the albedo parameter
and its texture array. The `renderLayers`-null handling disappears too —
every layer now has render bytes (upload layers are `Uint8Array`, not
`Uint8Array | null`).

### D5: Boot is async with a status placeholder

The module-level boot sequence moves into an async `main()`: bake all
primitives (raster + PT), build the renderer, then start the RAF loop.
`#status` shows "Baking sprites…" while PT runs, so the blank canvas has an
explanation. PT compilation dominates the first bake; subsequent primitives
reuse the compiled tracer (BVH rebuild per primitive is cheap at these mesh
sizes).

## Risks / Trade-offs

- [Boot latency: 7 path-traced bakes at page load] → Small sprites
  (~96×64 px at 64 px/unit) with the shared tracer; expected a few
  seconds. If it regresses, lower boot samples first (one constant).
- [Procedural env look differs from users' HDRI-baked bundles] → Accepted:
  boot sprites only need to look coherent on the default scene; bundles
  bring their own bake.
- [v3 bundle rejection breaks previously loadable files] → Deliberate:
  unlit display no longer exists, so those bundles have no displayable
  image. Named error says why; re-baking with an HDRI produces a `/4`
  bundle that loads.
- [Sun direction baked into the env diverges if the default light changes]
  → The env builder reads the same constants; a follow-up that moves the
  default light must update one place (noted in code by co-locating the
  function with the light defaults' consumer).

## Migration Plan

Single deploy; no persisted state, no asset changes. Old `/3` zips stop
loading (named error) — re-bake to restore. Rollback = revert commit.

## Open Questions

None — boot-bake quality constants are internal and tunable later without
touching specs.
