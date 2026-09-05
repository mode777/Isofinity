## 1. Camera clip fit

- [x] 1.1 In `src/bake/iso.ts` `frameIsoBox`, extend the existing 8-corner camera-space loop to also track min/max camera-space Z and set `near`/`far` from them per design D1 (margin + positive-epsilon guard for flat boxes) — verify `npm run build` passes and a box that fits the old slab still yields the same `left/right/top/bottom`, `width/height` and `originPx`
- [x] 1.2 Confirm no consumer edits are needed by grepping near/far usage (`bake.ts`, `pt.ts`, `realtime.ts`, `export.ts`, `src/runtime/`) — verify only projection-matrix consumers exist and `reconstructWorldPos` never reads them

## 2. Verification

- [x] 2.1 Add a framing check to `src/bake/scratch-verify.ts`: frame a box large enough to violate the old fixed slab (e.g. `[8, 4, 8]`) and assert all 8 corners lie strictly inside `[near, far]` in camera space for every view slot, plus unchanged lateral framing for a small box — verify the new check passes in the browser harness (`npm run dev` → `/scratch-verify.html`) and existing bundle hashes for small primitives are unchanged
- [x] 2.2 Run `npm run verify:bundles` and `npm run build` — verify both pass (bundle format untouched)

## 3. Docs

- [x] 3.1 Note in `docs/bake-pipeline.md` (Camera section) that the projection's depth clip planes are derived from the framed box, not fixed — verify the wording matches the implementation
- [x] 3.2 Add the landed change to `docs/roadmap.md` — verify the row format matches neighboring entries
