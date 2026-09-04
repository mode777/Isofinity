# Architecture decisions

Short, numbered records of durable architecture decisions — the **why**
behind invariants that span multiple modules or formats. Behavior
requirements live in `openspec/specs/`; the per-change process records
(proposals, full design docs) live in `openspec/changes/`; this directory
holds only what stays true after a change is archived.

## Index

| # | Status | Decision |
| - | ------ | -------- |
| [0001](0001-depth-instead-of-a-position-pass.md) | Accepted | Depth instead of a position pass |
| [0002](0002-per-pixel-color-through-a-required-render-pass.md) | Accepted | Per-pixel color ships through a required path-traced render pass (albedo/AO passes removed) |
| [0003](0003-multiplicative-shading-of-the-prerender.md) | Accepted | Multiplicative shading of the prerendered image |
| [0004](0004-single-file-sprite-zip-container.md) | Accepted | Single-file `.sprite` zip container |
| [0005](0005-multi-view-rotates-the-model-not-the-camera.md) | Accepted | Multi-view bakes rotate the model, not the camera |
| [0006](0006-three-layer-state-model.md) | Accepted | Three-layer state model (persisted / in-memory / engine objects) |

## Adding a decision

Copy [`TEMPLATE.md`](TEMPLATE.md) to `NNNN-short-slug.md`, fill it in, and
add a row to the index. Keep it short —
context, decision, consequences, rejected alternatives. Do not restate
behavior that `openspec/specs/` already pins down; link instead. Supersede
by marking the old entry Superseded and linking forward; do not delete
accepted records.
