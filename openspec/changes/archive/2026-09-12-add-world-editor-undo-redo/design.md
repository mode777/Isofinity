## Context

World documents live in the in-memory editor store (`src/app/store/world.ts`,
`WorldDocument`); the scene itself is the framework-agnostic `World` class in
`src/runtime/world.ts`, which owns three arrays (sprite placements, mesh
placements, light placements) exposed through `list()/listMeshes()/listLights()`
and mutated via `place()/placeMesh()/placeLight()/updateLight()/removeTopAt()/
removeLight()`-style entry points. Mutations flow from editor actions
(`placeAt`, `eraseAt`, light property panel handlers) that already mark the
document dirty. ADR 0006 fixes the state tiers: persisted (world file),
in-memory (editor session), engine (renderer internals). Undo history belongs
squarely in the in-memory tier.

## Goals / Non-Goals

**Goals:**
- A small, framework-agnostic command-history module usable by the world
  document without coupling `World` (runtime) to the editor store.
- Exact inverse-based undo (delta commands, not full snapshots) so memory
  stays trivially small per action.
- Undo/redo integrates with the existing dirty-flag machinery.

**Non-Goals:**
- Undo for sprite/bake documents; persistence of history; coalescing policy
  beyond one command per editor action; collaborative or time-travel UI.

## Decisions

### D1: Command objects with do/undo, not state snapshots
Each history entry is a command pair `{ redo(), undo() }` capturing the
minimal delta (e.g. the removed `Placement` object and its array index; the
light id and before/after property patch). Alternatives: (a) full scene
snapshot per action — simplest but copies all arrays each stroke and diverges
from object identity (mesh/light ids are keys for engine-side animation
players, and snapshot-restore would need to preserve them); (b) memento of the
three arrays — same identity problem. Delta commands keep ids stable, which
matters because `doc.selectedLightId` and engine animation players hold ids.

### D2: History lives beside `World`, not inside it
A new `src/runtime/history.ts` (generic `HistoryStack`) plus a thin
`worldHistory` adapter in `src/app/store/world.ts` that wraps each mutating
editor action: it captures the delta, applies the mutation via the existing
`World` methods, and pushes the command. `World` itself stays a plain scene
container — commands call back into its existing public methods, so the
runtime gains no editor concepts. Alternative: embed the stack inside `World`
— rejected because `World` is also used by verify harnesses and headless
paths that must not grow editor state.

### D3: Undo/redo sets `dirty` unconditionally
Rather than tracking a "clean point" in the stack (which complicates
save-again-undo bookkeeping for little gain), any undo/redo marks the document
dirty. The spec pins this behavior.

### D4: Erase records full placement objects, remove-top only
Erase is defined as remove-top; its inverse is a re-insert of the exact
`Placement`/`MeshPlacement`/`LightPlacement` object at its prior array
position. For lights, deletion (via the properties panel) gets the same
treatment as an erase.

### D5: Keyboard shortcuts at the store/dispatch level
Key handling attaches where other world shortcuts live (the world editor's
existing key routing), gated on the active document kind being `world`, so
bake/sprite tabs are unaffected. Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y both redo.

## Risks / Trade-offs

- [Light id reuse after undo of delete] → commands re-insert the original
  object with its original id; `nextMeshId` is not rewound, so no future
  placement can collide.
- [Mesh placements are engine-adjacent (animation players keyed by id)] →
  undo/redo re-registers/unregisters through the same code path the editor
  actions already use; no new engine API.
- [Undo of a placement that referenced a since-deleted asset] → undo restores
  the placement record regardless; rendering already tolerates unresolvable
  assets the same way world load does (skips, not fatal).
- [History growth] → unbounded stack is acceptable for editing sessions;
  entries are tiny. A cap can be added later without spec change.

## Migration Plan

No data migration: runtime-only state, format untouched. Rollback is
reverting the commit; no persisted artifacts are affected.

## Open Questions

None.
