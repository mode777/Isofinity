## 1. Occluder field (build)

- [x] 1.1 Add a single-source shadow-domain module holding `MAX_OFF_AXIS_DEG` (65) and `MIN_ELEVATION_DEG` (10) plus a `clampLightDirection` helper; verify with a Node check that boundary and out-of-domain directions clamp to the nearest valid direction and valid directions pass through unchanged
- [x] 1.2 Implement the CPU occluder build: unproject each placement's covered g-buffer texels via `SpriteSet` (the `surfaceSnap.ts` reconstruction), apply the placement's world offset, and splat the maximum surface height per world ground cell; verify a known primitive's footprint and peak height against hand-computed values
- [x] 1.3 Size the field from the ground extent under a texel budget (≤ 2048 on either axis) and document the cells-per-unit choice; verify a 128×128 world still builds within the cap
- [x] 1.4 Upload the field to an `R32F`, `NEAREST` texture and expose a debug readback; verify the GPU texture matches the CPU field for a small scene
- [x] 1.5 Ensure alpha-masked-out texels (empty g-buffer normal) contribute no occlusion; verify against the packed MASK test primitive (`src/bake/views-verify.ts` / scratch-verify coverage)

## 2. Directional shadow test (deferred pass)

- [x] 2.1 Add the occluder texture, sampler, and uniforms to the deferred light program and upload them per frame; verify `npm run build` and that the pass links (no shader-compile error at startup)
- [x] 2.2 Implement the height-field DDA in the light fragment shader: march from the reconstructed world position along the key light's horizontal direction, compare ray height to `max(staticHeight, dynamicHeight)`, apply a small normal-offset bias, and early-out past the field maximum / bounds; verify against a CPU reference in a `/scratch-verify.html` case at a fixed receiver/light
- [x] 2.3 Multiply only the key directional term by the binary visibility; verify ambient and albedo·AO are unchanged and that toggling the dynamic-light switch or using an empty occluder reproduces the pre-change frame exactly

## 3. Light-domain enforcement

- [x] 3.1 Clamp the light state at the point it becomes shader uniforms (`src/app/light.ts`) so the march and the shading use the same clamped direction; verify with a Node check that no uploaded direction leaves the domain
- [x] 3.2 Clamp the sun-position output (`src/shared/sun.ts`) into the domain so computed dawn/dusk/night directions never leave it; verify night and low-latitude cases clamp rather than go grazing
- [x] 3.3 Clamp the world editor's key-light azimuth/elevation fields and the sun-position controls to the domain and display the applied values; verify typed out-of-range input commits the clamped value (existing numeric-input clamp behavior)

## 4. Mesh shadow compounding

- [x] 4.1 Splat the CPU pose engine's world-space skinned vertices into a per-frame dynamic height texture over the mesh's footprint; verify in `/mesh-debug.html` that an animating character's cast shadow moves with its pose
- [x] 4.2 Make the march sample `max(static, dynamic)` so a receiver occluded by either is shadowed once; verify overlapping sprite and character shadows read as one continuous region with no seam or doubled darkening

## 5. Runtime wiring and rebuild triggers

- [x] 5.1 Rebuild the static field on world load and after every placement edit (add, move, height, facing, removal); verify moving and erasing a placement updates its cast shadow on the next frame with no bundle re-bake
- [x] 5.2 Keep the occluder field as engine state and the shadow/light UI state as in-memory editor state (ADR 0006); verify world save/load round-trips unchanged (`npm run verify:bundles` plus an existing world JSON load)
- [x] 5.3 Confirm the no-placement / no-mesh path is a no-op; verify a world without placements renders identically to the pre-change renderer for the same document state
- [x] 5.4 Confirm the system needs no new author input: no new property, toggle, bake action, or world/bundle field; verify a world with default settings casts shadows immediately on load with no configuration step

## 6. Documentation

- [x] 6.1 Add an ADR recording the reconstructed-occluder decision, the height-field representation, the light-domain cone, and the rejected alternatives, and add its row to `docs/decisions/README.md`
- [x] 6.2 Update `docs/runtime.md` (Lighting and Renderer sections), `docs/glossary.md` (occluder field, shadow visibility), and `docs/roadmap.md` (the planned "Real shadow mapping" item)
- [x] 6.3 Add a `docs/bake-pipeline.md` note on the bake-environment / double-shadow coupling (a sunless or overcast environment for dynamically-shadowed worlds)
- [x] 6.4 Document the out-of-the-box behavior in `docs/runtime.md`: shadows are automatic with no setup, the only fidelity-affecting (optional) knobs are material alpha mode, origin/scale, view slots, and environment, and the fixed-`PX_PER_UNIT` g-buffer sets occluder detail

## 7. Verification

- [x] 7.1 Add a Node-runnable `verify:shadows` check (occluder build math, height-field march vs. a reference, and light-domain clamping) and wire the npm script; verify it exits clean
- [x] 7.2 Run `npm run build` (typecheck + production build) and confirm it passes
- [x] 7.3 Run the browser harnesses (`/scratch-verify.html`, `/mesh-debug.html`) and confirm a day/night light sweep casts consistent, non-degenerate shadows with sprite and character shadows compounding; leave the browser run to the user
