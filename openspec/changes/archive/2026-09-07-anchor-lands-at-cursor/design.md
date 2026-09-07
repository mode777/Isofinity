## Context

The authored placement anchor (ADR 0008) already records each view's `originPx`, and the draw path already lands that pixel at the placement's projected position (`emit` in `src/app/components/WorldEditor.tsx`). The only thing between the cursor and the anchor is the placement-point convention: `placeAt` (`src/app/store/world.ts`) and the ghost both subtract half a cell (`gx - 0.5, gz - 0.5`) from the cursor's ground position — a leftover of the era when placements were cell-aligned and every asset anchored at its box min corner. Placement is free-form today, so the offset is pure convention.

## Goals / Non-Goals

Goals:

- The full 3D anchor point lands exactly at the cursor's ground position, at the brush height, for every anchor choice.
- Ghost and landed placement use the identical point (they already share `emit`; only the input coordinates change).

Non-Goals:

- Bake-side changes of any kind (manifests, `originPx`, provenance, ADR 0008's authoring half).
- Picking/erase, mesh placement, world persistence format.

## Decisions

### D1 — Remove the half-cell offset at the placement entry points, not in the world model

`placeAt` and the ghost emission stop subtracting 0.5 and hand the cursor's ground position straight to `world.place`. The `Placement` record keeps storing a plain ground position; nothing downstream (depth keys, picking, persistence) changes meaning.

*Why here:* the offset exists in exactly one semantic place — "where does a brush click land" — and the ghost shares the same input. Changing the world model or the draw path would touch far more code for the same result.

*Alternative considered:* compensating in the draw path by offsetting non-default anchors (a per-anchor aim rule, e.g. "ground-center anchors land at the cell center"). Rejected: it reintroduces cell thinking the user explicitly removed, and it makes the anchor's meaning depend on its position — the opposite of ADR 0008's "the anchor is the handle".

### D2 — One rule for every anchor, including the default corner anchor

The default box-min-corner anchor also lands cursor-exact (no offset). This shifts default-anchored placements half a cell down-right compared to today; that is the point — "where I click is where the anchor goes" must not have exceptions, or the mental model breaks again.

*Alternative considered:* keeping the offset for min-corner anchors to preserve cell-filling muscle memory. Rejected: two rules with the same UI is exactly the confusion this change removes.

### D2a — Height rule: the anchor lands at the cursor's 3D hover point

The anchor's world position is `(mouse ground x, brush height, mouse ground z)` — the cursor acts as a 3D point hovering `brush height` above its ground track. Consequences, spelled out in the spec:

- anchor on the ground ⟺ brush height = 0;
- asset base height = brush height − anchor y, so a raised anchor (hook, y = 1) placed at height 0 **sinks** the asset 1 unit (ADR 0008's rule, kept and confirmed); setting brush height = anchor y stands it on the ground;
- height 1 with a ground-anchored asset = the sprite stands as if the cursor hovered 1 unit above the ground.

*Alternative considered:* the anchor rides at brush height + anchor y so the asset's base always sits at the brush height. Rejected: it makes the anchor's authored y dead for placement (the base never depends on it), resurrecting what ADR 0008 explicitly rejected, and it breaks "the origin point is exactly the mouse position" whenever the anchor is raised — the anchor would float above the hover point with no cursor-visible reason.

### D3 — Character (mesh) placement keeps its own convention for now

`placeAt` also routes the character brush with the same `- 0.5` shift. Changing it here would couple the sprite rule to mesh placement semantics that have no anchor concept yet. It keeps today's behavior; a later change can align it once meshes get authored anchors.

*Alternative considered:* changing both now. Rejected: mesh placements have no per-asset anchor, so "cursor = origin" is undefined for them; bundling it would force an arbitrary choice.

### D4 — In-memory placement state stays untouched (ADR 0006)

`Placement` serialization (`isoinfinity-world/5`) is unchanged: stored ground positions keep their meaning, old worlds load and re-render identically. Only the mapping from cursor to ground position changes — pure editor input, never serialized chrome.

## Risks / Trade-offs

- [Default-anchored assets (all built-in primitives, legacy bundles) land half a cell off from muscle memory] → Accepted and intended; the ghost shows the exact result while dragging, so re-aiming is immediate. Called out in the docs update.
- [Users expect the *visual base* under the cursor, not the anchor] → For assets whose anchor is not their visual foot (default corner anchor), the sprite body extends away from the cursor; that is what the anchor is for (ADR 0008), and re-anchoring in the bake editor fixes per-asset feel without new placement rules.

## Migration Plan

Single editor behavior change, no data migration. Rollback is reverting the two `- 0.5` removals. Docs note the new convention at merge time.

## Open Questions

None.
