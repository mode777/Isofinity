## Context

See `proposal.md` for motivation and `specs/world-editor-selection/spec.md`
plus `specs/integrated-editor/spec.md` for the required behavior.

Current state that shapes the approach:

- The world document holds editor state in memory (`tool`, `heightLevel`,
  `shadowLevel`, `brushDir`, `selectedLightId`) alongside the `World`
  placement container. Per ADR 0006 none of this chrome is serialized, and the
  newly added `history` stack is in-memory too.
- The `World` container gives point lights and meshes stable numeric ids
  (`nextMeshId`); sprite `Placement`s have no id (erase/undo rely on object
  identity and array index).
- The renderer draws sprites from two in-memory `TEXTURE_2D_ARRAY` sources:
  baked g-buffer layers (coverage = non-zero normal) plus render layers.
  `src/runtime/surfaceSnap.ts` already reads those g-buffers on the CPU with the
  exact padded-stride texel indexing and per-fragment depth formula the shader
  uses (`d = g.a + VIEW_DIR·(pos − anchor)`, max `d` = nearest).
- The point-light tool already selects a light through `selectedLightId`, and
  the properties panel already edits a selected light's position.
- The world toolbar currently hosts the height field and shadow field, and the
  direction control sits next to the brush dropdown.

## Goals / Non-Goals

**Goals:**

- One selection model covering sprites, characters, and point lights, with
  pixel-accurate sprite hit-testing driven by the already-loaded g-buffers.
- Drag-to-move integrated with the existing undo/redo stack at one command per
  drag.
- Consolidate brush height/shadow/direction and selected-placement properties
  into the right properties panel.

**Non-Goals:**

- No GPU picking/id framebuffer, no readback stall.
- No multi-select, marquee, copy/paste, or delete-key removal.
- No change to placement/erase ground-footprint picking.
- No new serialized state and no world format bump.

## Decisions

### D1 — Unified selection identity

Give sprite `Placement`s a stable `id`, allocated from the same counter the
`World` already uses for meshes/lights (rename `nextMeshId` to `nextId`). Replace
`selectedLightId` on the world document with
`selection: { kind: 'sprite' | 'mesh' | 'light'; id: number } | null`. The
point-light tool and the Select tool both set this field; the panel derives
which editor to show from `kind`.

- *Why:* the Select tool must express "exactly one placement of any kind", and
  stale-clearing becomes a single existence check. Mesh/light ids already exist;
  only sprites need one.
- *Alternative (rejected):* keep per-kind `selected*` fields. They can disagree
  (a light and sprite selected at once) and every operation must clear several
  fields.
- *Alternative (rejected):* store the `Placement` object reference. Object
  identity is not a stable React/store key and does not match the id-based mesh
  and light model.

The id is runtime-only and never serialized (ADR 0006): world files keep
`isoinfinity-world/6` and unchanged fields.

### D2 — CPU g-buffer silhouette pick for sprites, proximity for meshes/lights

Add a picker next to `surfaceHeightAt` in `src/runtime/` that, given the sprite
set and the placements drawn with their layer indices, returns the id of the
nearest placement whose baked g-buffer texel at the cursor's world-image pixel
is non-empty, using the same `floor((w − boxOrigin)/scale)` indexing and the
same per-fragment `d` as the shader. G-buffer-empty grounding-shadow pixels are
therefore not selectable. Characters are picked by a screen-space tolerance
around their projected anchor, and point lights by a tolerance around their
projected emitter (the same rule the point-light tool uses today). Candidates
across kinds are compared by depth so the visually nearest wins.

- *Why:* the g-buffers are already resident in memory, so silhouette-accurate
  picking costs a CPU loop over the placements on click and is testable in Node
  exactly like `surfaceHeightAt`.
- *Alternative (rejected):* a GPU id pass (extra FBO attachment, per-object id
  output in every geometry shader, `readPixels` stall). It adds renderer
  surface for every future geometry program, and none of it can be verified in
  this headless environment, whereas the CPU path is deterministic and
  verifiable. This trade-off is worth an ADR (`docs/decisions/`).
- *Alternative (rejected):* reuse the ground-footprint erase test. It selects a
  whole cell and would select a sprite through its transparent margin, failing
  the pixel-accuracy requirement.

### D3 — Drag move: live update, one undo command per drag

On left-press with the Select tool, pick and select; on hit, remember the
placement's start `(x, z)` and the pointer's start ground position (free-form,
via the existing `screenToGround` inverse). During the drag, set
`x = startX + (groundNow.x − groundStart.x)`, `z = startZ + (groundNow.z −
groundStart.z)` and publish through the store so the frame updates live; height
is preserved (sprite/character) and a light's emitter follows the same delta. On
release, if the position changed, push one `move` `HistoryCommand` (undo restores
the start `(x, z)`, redo applies the final `(x, z)`) and mark the document dirty.

- *Why:* the ground delta preserves the grab offset so the object does not jump
  under the cursor, and one command per drag keeps undo intuitive.
- *Alternative (rejected):* a command per pointer-move. It floods the history.
- *Alternative (rejected):* only commit on release. It removes live occlusion
  feedback and feels unresponsive.

### D4 — Brush/selected properties consolidate into the panel

Move the height field, shadow field, and direction dropdown out of the toolbar
into a `WorldProperties` **Brush** section, and add a selected-placement section
that edits the selection: sprite/character position and height plus sprite
shadow strength, or the existing point-light editor for a light. The
shift+mouse-move height adjustment, the `E`-key direction cycle, the
surface-snap toggle, and all tool buttons stay as they are.

- *Why:* the panel is already the home of per-object properties (lights), so
  this makes the two placement-property paths consistent, which the proposal
  asks for.
- *Alternative (rejected):* duplicate the controls in both places. Two sources
  of truth for one value confuse the user and double the wiring.

### D5 — Selection highlight in the overlay batch

Draw the selected placement's highlight in the existing overlay
`FlatBatchBuilder`: the projected footprint diamond at the placement's height
plus a vertical connect for sprites/characters, and reuse the point-light radius
ring (currently keyed on `selectedLightId`) for a selected light.

- *Why:* the overlay path is already per-frame chrome with no depth interaction
  and no serialization, so the highlight inherits those guarantees.

### D6 — Lifecycle

Clearing: Escape, an empty-space click, and a stale target after erase/undo/redo
clear `selection`. Switching tools does **not** clear it, so a selection made
with the Select tool stays visible and editable in the panel after switching to
the pencil or eraser. Selection and deselection are not history commands; only
moves and property edits are.

- *Why:* keeping the selection across tool switches matches the "properties go
  to the panel" intent and avoids losing the object you were inspecting.

## Risks / Trade-offs

- [The pick reads the same in-memory g-buffers the renderer uploads; a stale or
  unloaded layer would mis-pick.] → The picker skips placements whose layer
  index is out of range, exactly as `surfaceHeightAt` does.
- [Sprite depth tie-breaks could disagree with the renderer for grounding-shadow
  pixels.] → Those pixels are g-buffer-empty and excluded from selection.
- [Adding an `id` to `Placement` touches the core container.] → The id is
  runtime-only, allocated like mesh/light ids, and never serialized; existing
  save/load and undo behavior is unaffected.
- [Character/light picking is proximity-based, not silhouette-accurate.] →
  Documented non-goal; the tolerance can be tuned, and sprites — the common
  case — are pixel-accurate.
- [A drag that crosses into a pan or other gesture could leave a partial move.]
  → Only left-button drags with the Select tool move; middle-drag and
  right-button behavior is unchanged.

## Migration Plan

Code-only: no data migration and no format change. Rollback is reverting the
commit; saved worlds are byte-compatible before and after.

## Open Questions

- The exact screen-space tolerance for character/light picking is a tuning
  value that can be set during implementation without changing the specs or the
  approach.
