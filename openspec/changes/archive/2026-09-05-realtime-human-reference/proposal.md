## Why

Getting an asset's scale right in the sprite editor is guesswork: the model
scale / height-in-meters fields are numbers, and the fixed iso frame gives no
intuitive sense of how big the object will feel once placed in a world. A
human-scale reference figure in the Realtime 3D view makes scale immediately
judgeable while setting up the bake — before any pass is rendered.

## What Changes

- Add a **Human** toggle to the sprite viewport's view-controls row (next to
  the existing Box toggle).
- When on, the **Realtime 3D view** draws a simple procedural humanoid figure
  of fixed reference height **1.8 m** (1 world unit = 1 m) standing on the
  ground plane beside the asset, inside the bake's fixed isometric camera
  frame. The figure is placed relative to the camera frame so it stays visible
  in every view slot (it does not rotate with the slot's model yaw).
- The figure is pure editor chrome: it never participates in a bake, never
  appears in any baked pass (g-buffer or render), and is never serialized into
  sprite bundles or world files.
- The toggle's state is per sprite document, in-memory only (ADR 0006) — it
  persists across view and tab switches, not across saves.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: new requirement for a toggleable human-scale reference
  in the sprite viewport's Realtime 3D view, sibling to the existing
  bounding-box overlay requirement.

## Impact

- `src/app/realtime.ts` — build the reference figure (procedural geometry) and
  show/hide it, like the existing box overlay group.
- `src/app/document.ts` — in-memory toggle field on `BakeDocument`.
- `src/app/store/bake.ts` — toggle action (no dirty marking, mirroring
  `setBoxOverlay`).
- `src/app/components/SpriteEditor.tsx` — view-controls button and prop
  wiring.
- Docs: `docs/runtime.md` (sprite editing section) and `docs/roadmap.md`.
  No glossary change expected; no new format concepts. No ADR — this is a
  scoped editor-chrome feature that follows ADR 0006's existing state model.

**Format-version impact: none.** `isoinfinity-bake/6` is untouched; no
manifest fields change and old bundles open exactly as before.

**Non-goals:**

- No human reference in the 2D views (Normals/Depth/Render) — those show
  baked passes; the figure must never be baked.
- No human reference in the world editor view.
- No configurable reference height or multiple reference figures; a fixed
  1.8 m figure keeps the feature simple (assumption recorded in design).
- No scale-guide overlays in the bake camera itself — the figure exists only
  in the editor preview and cannot influence baked output.
