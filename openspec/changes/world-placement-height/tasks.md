# Tasks: world-placement-height

## 1. Runtime world state

- [x] 1.1 Add `y` to `Placement` and thread it through `World.place/removeAt/list` in `src/runtime/world.ts`; extend the depth key with the height term (`VIEW_DIR[1]·y`) and keep ground-footprint erase resolving to the max key (topmost). Verify with `npm run build`.
- [x] 1.2 Add per-document in-memory editor state `heightLevel: number` (default 0) and `surfaceSnap: boolean` (default false) to `WorldDocument` in `src/app/document.ts` (never serialized into world files). Verify with `npm run build`.

## 2. Rendering at height

- [x] 2.1 In `WorldEditor.tsx` `emit()`, add the height terms: depth offset gains `VIEW_DIR[1]·y`, and the sprite blit pixel-Y shifts by `y·SCREEN_UP[1]·PPU`; extend the world-image canvas headroom (`maxV`) so fit reveals stacked sprites; pass each placement's/ghost's `y` through. Verify in the browser (`npm run dev`): a placement made with a raised height renders offset up and occludes pixel-exactly against ground and raised neighbors.
- [x] 2.2 Ghost and hover: ghost renders at the effective height (2.5), slots into the painter order by the 3D key, and the height gizmo (landing diamond + plumb line) draws whenever the effective ghost height is > 0, hidden at ground level. Verify in the browser: raise the height, see the gizmo; lower to ground, see it disappear.
- [x] 2.3 Contact-shadow ellipses: draw order ground → shadows → sprites; CPU-projected ground-polygon ellipse under every placement with `y > 0` and under a raised ghost, size growing and opacity falling with height, none at ground level; tracking zoom/pan. Verify in the browser: raised placements show grounded shadows that follow zoom/pan, ground-level placements show none.

## 3. Height input and surface snap

- [x] 3.1 Height control: hold-shift + vertical mouse move over the viewport adjusts `heightLevel` via `movementY` (up raises, down lowers, ~0.01 units/px, clamp ≥ 0) without panning or zooming; hover tracking and drag-painting continue during adjustment; plain wheel, ctrl+wheel and shift+wheel keep the pan/zoom conventions (no shift carve-out in the wheel handler). Verify in the browser: shift+move raises/lowers the ghost, viewport stays put, scroll and pinch behave as before.
- [ ] 3.2 Surface snap: when `surfaceSnap` is on, compute the cursor's surface height CPU-side from the in-memory g-buffers (max `g.a + offset` over covering placements' non-empty texels; `worldPos = u·SCREEN_RIGHT + v·SCREEN_UP + d·VIEW_DIR`), overriding `heightLevel`; empty ground/nothing → 0. Verify in the browser: hovering a raised placement's top puts the ghost on it; hovering the grid keeps it grounded.
- [x] 3.3 Toolbar height field and snap toggle: add a numeric height input following the `SliderRow` value-field conventions (commit Enter/blur, clamp ≥ 0, reject empty/non-numeric, Escape cancels) plus the surface-snap toggle, both per-document state. Verify in the browser: typing 1.5 + Enter raises the ghost exactly; `-2` clamps to 0; junk input reverts; toggling snap switches the height source.

## 4. Persistence `/2`

- [x] 4.1 `parseWorldFile` in `src/app/store/world.ts`: accept `isoinfinity-world/1` and `/2`; per-placement optional finite `y` (absent → 0, non-finite → named error); save writes `/2` with `y` on every placement. Verify: round-trip a world with raised and ground-level placements — heights restore exactly; a hand-made `/1` file loads with all placements at ground level; a `y: "high"` entry fails with a named error and changes nothing.
- [x] 4.2 Wire `placeAt`/drag placement/ghost insertion to use the effective height (brush `heightLevel`, or snap result) and mark dirty on placement; erase unchanged except topmost-by-key. Verify in the browser: click places at the shown ghost height; erasing a stack removes the top first.

## 5. Verification and docs

- [x] 5.1 Update `scratch-verify.html` if any bake-adjacent harness output changes (expected: none — bake untouched) and run `npm run build` plus `npm run verify:bundles`; fix anything they surface.
- [x] 5.2 Update docs: `docs/runtime.md` (world rendering draw order, height input/snap, shadow/gizmo chrome), `docs/glossary.md` (placement height, surface snap, contact shadow), `docs/roadmap.md` (landed). Verify the docs read consistent with the spec deltas.
- [ ] 5.3 Full browser pass against the spec scenarios: stacking/interpenetration occlusion, shift-move height clamping, manual height input, snap override, per-document height/snap persistence across tab switches, `/1` and `/2` load, save round trip, gizmo/shadow chrome never dirtying or persisting. Confirm each spec scenario in the three deltas has observable behavior matching the build.
