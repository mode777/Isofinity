## Why

The world view renders only baked sprites. The end goal is animated,
skinned characters moving through the prerendered scenery — the classic
IE-games composition (POE renders real-time characters over baked worlds).
The architecture is already shaped for it: world-space linear depth
(`dot(worldPos, viewDir)`, ADR 0001) and the fixed camera (ADR 0005) make
the shared z-buffer a one-line formula, so now is the time to prove the
composition with a first skinned, animated character while keeping the
raw-GL compositor.

## What Changes

- New mesh render batch in the world compositor (`src/runtime/renderer.ts`),
  inserted between the shadow and sprite batches: opaque, depth-writing,
  instanced with per-instance yaw+translation, reusing the exact depth map
  `gl_FragDepth = 0.5 - dot(worldPos, viewDir)/128` (`DEPTH_LINEAR_RANGE`).
- GPU palette skinning: vertex shader blends up to 4 joint influences
  against a per-character joint palette (uniform `mat4` array, cap ~64
  joints); pose is sampled on the CPU per frame.
- three.js used as CPU-side libraries only (GLTFLoader parse +
  `AnimationMixer` as a renderer-independent pose engine) — three.js makes
  no GL calls; the compositor stays raw WebGL2 (Option A; full three.js
  renderer adoption explicitly deferred, ADR to record this).
- Shading parity for dynamic meshes: diffuse spherical-harmonics ambient
  probe projected from the sprites' bake environment (resolved via bundle
  provenance), the same key+ambient directional factor, then the bake's
  ACES tonemap — replicating the sprite formula
  `sRGB(ACES(albedo * E_env(N) * (ambient + key*ndl)))` including the
  accepted double-shading trade (ADR 0003). The shared `SHADE_CHUNK` is
  copied, never edited, so the sprite path stays byte-identical.
- Skinned-asset loading: glTF skins (joints, inverse binds,
  `JOINTS_0`/`WEIGHTS_0`) and animation clips parsed from a committed
  Khronos CesiumMan test asset (CC-BY, attribution in-repo).
- Character-as-brush: a built-in world-editor brush places/erases the
  animated character like a sprite placement (ghost preview, contact
  shadow, height, unit-footprint erase). Surface snap works as today
  (it reads sprite g-buffers, independent of brush kind).
- Scratch-verify harness gains a fixed mesh-in-scene hash for regression
  diffing of the new batch.
- New ADR documenting the architecture decision (single GL context, single
  state owner per frame; three.js-as-libraries vs deferred full-renderer
  port; the depth bridge survives either way).

## Capabilities

### New Capabilities

- `runtime-mesh-rendering`: dynamic (skinned, animated) meshes rendered
  inside the world compositor — depth- and light-integrated with baked
  sprites, placed via the brush machinery, in-memory only.

### Modified Capabilities

- (none — sprite rendering requirements are unchanged; the mesh batch is
  additive and a no-op when no meshes are placed)

## Impact

- **Code**: `src/runtime/renderer.ts` (new program/VAO/draw call — the only
  shared control-flow change), `src/runtime/world.ts` (placement kind),
  `src/runtime/assets.ts` (skinned asset loading), new
  `src/runtime/mesh*` module (pose engine, SH probe), `WorldEditor.tsx`
  (brush wiring, frame assembly), `src/app/assets/` (CesiumMan GLB).
- **Docs**: `docs/runtime.md` (renderer batches, world editor, lighting),
  `docs/glossary.md` (joint palette, SH probe, mesh placement),
  `docs/roadmap.md`; **not** `docs/bake-pipeline.md` — zero bake changes.
- **ADR**: new `docs/decisions/0007` (dynamic meshes in the compositor).
- **Format-version impact**: none. Bake bundles untouched
  (`isoinfinity-bake/6` stands); world JSON untouched
  (`isoinfinity-world/3` stands) — mesh placements are in-memory editor
  state and are never serialized (ADR 0006).
- **Verification**: `npm run build` + `npm run verify:bundles` stay green
  by construction (no bake/format code touched); visual regression via the
  extended scratch-verify harness (browser-side, user-run).

## Non-goals

- Mesh serialization in world JSON (placements vanish on reload).
- Locomotion/pathing/foot-planting — the character animates in place;
  moving it is place/erase by hand.
- Mesh placement via the project browser / `models/` workspace loading UI
  (only the built-in character brush ships).
- Surface snap onto meshes (snap reads sprite g-buffers only).
- Transparent meshes (the opaque-draw-first order argument does not cover
  them).
- Terrain / dynamic ground plane — a separate future change; noted
  couplings (placement `y` semantics, surface snap, contact shadows, depth
  budget) to be designed there. The mesh batch is intentionally
  mesh-generic so that change reuses it.
- Multiple simultaneous rigged characters (draw-call-per-character scales
  to dozens, but this change ships one character kind).
