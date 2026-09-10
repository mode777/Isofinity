## 1. History core

- [x] 1.1 Add `src/runtime/history.ts` with a generic `HistoryStack` (push command, `undo()`, `redo()`, `canUndo`, `canRedo`, clear-on-new-record) and Node-runnable self-check; verify with `npx tsx src/runtime/history-verify.ts` (or extend an existing verify harness) covering undo/redo ordering and redo invalidation
- [x] 1.2 Extend `World` (src/runtime/world.ts) with the inverse-capable primitives the commands need — insert-at-index / remove-by-identity for each placement kind, preserving ids and sort keys — and verify via `npm run verify:mesh` still passing (world.ts is in its import graph) plus a manual round-trip in the self-check

## 2. Editor integration

- [x] 2.1 In `src/app/store/world.ts`, give `WorldDocument` a history stack and wrap the mutating actions (placeAt, eraseAt, placeMesh, placeLight, updateLight, delete light) so each records a do/undo command per design D1–D4; verify by typing (`npm run build`) and a scratch-verify style manual sequence: place → undo → place → redo
- [x] 2.2 Make undo/redo mark the document dirty and clear/refresh `selectedLightId` when its light is removed by an undo; verify the dirty-tab warning appears after save → edit → undo
- [x] 2.3 Keep history per document and out of serialization: confirm `saveWorld`/`parseWorldFile` are untouched and `isoinfinity-world/6` output is byte-identical for an unchanged scene (diff a saved file before/after undo use)

## 3. UI and shortcuts

- [x] 3.1 Add undo/redo buttons to the world toolbar with disabled states from `canUndo`/`canRedo`; verify in the browser that a fresh world shows both disabled and they enable after an edit/undo
- [x] 3.2 Wire Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z plus Ctrl/Cmd+Y (redo), active only when the active document is a world; verify in the browser that sprite-tab shortcuts are unaffected

## 4. Docs and gates

- [x] 4.1 Update `docs/runtime.md` (world document state gains history), `docs/glossary.md` (command, undo stack), and `docs/roadmap.md` (undo/redo done)
- [x] 4.2 Run the full gate: `npm run build`, `npm run verify:bundles`, `npm run verify:mesh`; update `/scratch-verify.html` only if world bake-adjacent behavior changed (expected: no) and note that final browser pass-through is the user's
