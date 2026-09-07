## 1. Placement input

- [x] 1.1 In `src/app/store/world.ts` `placeAt`: remove the `- 0.5` ground offsets for the sprite-brush branch so `world.place` receives the cursor's ground position directly (character branch unchanged). Verify by reading the call: the sprite placement ground position equals `placeAt`'s `gx, gz` arguments.
- [x] 1.2 In `src/app/components/WorldEditor.tsx` ghost emission: remove the matching `- 0.5` offsets (`hover.ground[0] - 0.5` → `hover.ground[0]`, same for z) so the ghost and `placeAt` feed the identical point. Verify in the browser: the ghost's anchor pixel sits exactly under the cursor at any zoom/pan.
- [x] 1.3 Confirm erase/pick and depth-key paths are untouched (no `- 0.5` in `runtime/world.ts` picking); verify by grep that the only changed offsets are the two placement inputs.
- [x] 1.4 Fix anchored-sprite depth compositing: the baked g-buffer depth is measured from the box corner but the image is drawn from the authored anchor, so `emit`'s instance depth offset and `effectiveHeight`'s snap unprojection must subtract `dot(VIEW_DIR, anchor)`. Thread the 3D anchor into `SpriteLayer` (`resultToLayer`, `loadBundleViews` north = provenance origin, extra views = `slotAnchorPoint`, primitive brushes = `[0,0,0]`) and `SpriteSet.anchors`. Verify: two objects at the same position with the same height intersect per-pixel instead of one perching on the other (user's cube+ground-center-stool scene at (0,0,0)).

## 2. Verification

- [x] 2.1 Browser check (`npm run dev` → world editor): with a ground-center-anchored sprite and brush height 0, the anchor point (select the placement → ground highlight) lands exactly at the click point; with the default corner-anchored primitive, the box min corner lands at the click point. Verify ghost and landed placement coincide while dragging.
- [x] 2.2 Browser check: raised/negative brush heights — the anchor lands at the cursor's ground position at that height (asset hangs/sinks accordingly), and the ghost matches.
- [x] 2.4 Browser check (depth regression, user's simplified scene): world with `cube` and a ground-center-anchored stool both at (0,0,0), y = 0 — the two must render as intersecting solids (per-pixel occlusion), with the stool's legs occluded by the cube's nearer faces, not perched flat on top; also verify a stool placed beside a cube stands on the floor.
- [x] 2.3 Run `npm run verify:bundles` and `npm run build` — both must pass (no bake/format behavior changed).

## 3. Docs

- [x] 3.1 Update `docs/runtime.md` placement description: the anchor point lands exactly at the cursor's 3D hover point (mouse ground track at the brush height — height 1 = cursor hovering 1 unit above the ground), free-form, no cell offset; spell out the height arithmetic (anchor on ground ⟺ brush height 0; asset base on ground ⟺ brush height = anchor y, so raised anchors sink at height 0 and standing them needs brush height = anchor y).
- [x] 3.2 Amend `docs/decisions/0008-authored-placement-anchor.md` with a short note: the placement-point convention is now cursor-exact (this change), anchor authoring semantics unchanged.
- [x] 3.3 Update `docs/roadmap.md` with the landed change.
