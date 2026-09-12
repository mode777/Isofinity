## 1. Material parsing and arrays

- [ ] 1.1 Add a `disp` slot to `src/app/groundMaterial.ts` (`disp`/`displace`/`displacement` aliases) and decode it as an optional `ImageBitmap`; verify by extending a Node check that `matchMaterialMaps` selects each alias and reports a missing displacement map as a notice, not an error.
- [ ] 1.2 Add a normalized material-array descriptor (four decoded maps, per-slot `diffuse`/`normal`/`arm`/`disp`, equal size/format) and resample mismatched maps to a common size with a notice; verify with a Node check that four same-size materials produce four array layers and a mismatched one is resampled or reported.
- [ ] 1.3 Convert an EXR diffuse to RGBA8 sRGB for the array (accepted HDR loss) and keep decoded maps as engine objects on the document (never serialized, ADR 0006); verify `npm run build` typechecks.

## 2. Ground renderer: multi-material blend

- [ ] 2.1 Upload four `TEXTURE_2D_ARRAY` textures (diffuse/normal/arm/disp, four layers) plus the splat, and expose a `setGroundMaterials(materials, splat, tileScale)` API replacing `setGroundMaterial`; verify the ground program links and `npm run build` passes.
- [ ] 2.2 Implement the splat data-texture upload (RGBA8, `CLAMP_TO_EDGE`, `premultiplyAlpha:'none'`, `colorSpaceConversion:'none'`, `UNPACK_FLIP_Y_WEBGL` off) and a default `r=1` coverage; verify loading a world with no coverage PNG renders slot 0 (browser check left to the user).
- [ ] 2.3 Implement the height-seam composite in `GROUND_FRAG` (weights from splat RGB + derived `1-r-g-b`, `wf = w*max(h*scale+bias,0)` normalized, albedo/normal/ao composited, normal renormalized through the existing transform); verify `npm run build` and a browser visual pass.
- [ ] 2.4 Add the paint FBO and a CPU-side paint API (`paintDab(uv, radius, hardness, slot, opacity)` drawing one `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` quad with `colorMask` alpha off); verify a browser dab paints and no-gaps stamping along a drag.
- [ ] 2.5 Add splat readback (`readPixels` of a rect) and `texSubImage2D` re-upload helpers for undo/save/resize; verify round-trip in a Node-safe unit where possible and in the browser for GL.

## 3. Ground document state and store

- [ ] 3.1 Change `GroundState` to `materials: (string|null)[]` (length 4), add `paint: { file; texelsPerUnit } | null`, `maps: (GroundMaterialMaps|null)[]`, and in-memory splat/GL state marked never-serialized (ADR 0006); verify `npm run build`.
- [ ] 3.2 Add store actions: bind a slot, clear a slot, set the active paint slot, set brush radius/hardness, and paint/undo a stroke; verify tool actions update only the active document (`npm run build` plus a store-level check).
- [ ] 3.3 Resample coverage on `setGroundSize` (readback → 2D canvas scale → re-upload, fixed texels/unit) with a slot-0 fallback on failure; verify in the browser that paint keeps its relative position after a resize.

## 4. Paint tool, gizmo, and panel

- [ ] 4.1 Add `TERRAIN_PAINT_TOOL_ID` to the viewport tool bar with an icon, tooltip, active highlight, and no canvas input capture; verify the toolbar shows the tool and switching works (browser).
- [ ] 4.2 Implement pointer painting: dabs spaced at a fraction of the radius, interpolated between pointer events, constrained to the ground plane, one undoable stroke per pointer down–up; verify a fast drag leaves a continuous stroke and undo/redo restores coverage (browser).
- [ ] 4.3 Draw the brush gizmo (outer radius ring + inner hardness ring) with the projected ground-plane circle technique; verify it tracks the cursor, radius, and hardness (browser).
- [ ] 4.4 Add the **Paint** section to `WorldProperties.tsx` (radius, hardness, four material slot pickers with the active slot marked) shown only for the paint tool; verify it appears/hides with the tool and edits are per document (browser).
- [ ] 4.5 Add notices for painting an unbound slot and for session-only painting without a workspace; verify the status area shows them (browser).

## 5. Persistence: `isoinfinity-world/8` and coverage PNG

- [ ] 5.1 Extend `buildWorldFile`/`parseWorldFile` to `/8`: `ground.materials` array and `ground.paint` descriptor, `/7` single material → slot 0, malformed descriptor/size rejection; verify with a Node round-trip check (extend the existing verifier pattern).
- [ ] 5.2 Save the coverage PNG beside the JSON (`worlds/`), derive its name from the world name, write it before the JSON, and regenerate alpha as `1-r-g-b`; verify a saved world produces both files and reload restores coverage (browser; JSON shape checked in Node).
- [ ] 5.3 Load the coverage PNG as a data texture and fall back to slot 0 over everything with a status notice when it is missing/unreadable; verify the fallback path with a Node check for the descriptor and a browser check for rendering.
- [ ] 5.4 Keep painting session-only without a workspace (status notice) and ensure save/load sidecar naming survives Save As; verify in the browser.

## 6. Documentation, verification, and build

- [ ] 6.1 Update `docs/runtime.md` (ground multi-material/paint rendering, tool, paint panel, `/8` sidecar) and `docs/glossary.md` (splat, material slot, displacement map, height-seam blend) and verify the docs describe the shipped behavior.
- [ ] 6.2 Update `docs/roadmap.md` (terrain painting moved from planned to done) and add a `docs/decisions/` ADR for the world-owned paint asset, normalized-replace splat, and texture-array strategy; verify the ADR index has a row for it.
- [ ] 6.3 Add/extend a Node-runnable verifier for the `/8` world-file round trip and `disp` matching (mirroring `verify:bundles`) and run it.
- [ ] 6.4 Run `npm run build` (typecheck + production build) and the applicable Node verifiers; record the passing output. Leave browser paint/blend checks to the user.
