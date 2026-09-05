## Context

The sprite editor's Realtime 3D view (`src/app/realtime.ts`,
`RealtimeMeshView`) is a three.js lit mesh preview of the document's source,
framed by the bake's fixed isometric camera (`frameIsoBox`, ADR 0005: slots
rotate the model, never the camera). Scale is set numerically in the
properties panel — uniform scale or height in meters (`scale = height /
extentY`); world units are meters, so a 1.8 m reference maps 1:1 onto world
units. See proposal.md for motivation.

The view already has one scene-space overlay: the bounding-box overlay
(`buildBoxOverlay`), a `Group` toggled via `setBoxOverlay`
(`src/app/store/bake.ts`) from a view-controls button in
`SpriteEditor.tsx`, with per-document in-memory state (`boxOverlay?: boolean`
on `BakeDocument`). The human reference follows this exact pattern.

## Goals / Non-Goals

**Goals:**

- A human figure at a fixed, true world scale (1.8 m) standing on the ground
  plane beside the asset in the Realtime 3D view, visible in every view slot.
- Zero influence on baked output; zero persisted state.
- Follow the box overlay's established wiring (document field → store action
  → view-controls button → scene group).

**Non-Goals:**

- No appearance in the 2D views (they display baked passes) or the world
  editor.
- No configurable reference height, unit labels, or multiple figures.
- No change to the realtime view's fit framing (zoom 1 keeps matching the
  bake frame).
- No ADR: this applies ADR 0006's existing state model, it does not settle a
  new cross-cutting trade-off.

## Decisions

### 1. Procedural low-poly humanoid, built in `realtime.ts`

Build the figure from three.js primitives (box/capsule torso, sphere head,
two legs) scaled so total height is exactly the reference constant.

- *Rejected: loading a humanoid glTF* — adds an asset dependency and load
  path to a zero-dependency preview; licensing and loading cost for
  something that only needs to read as "a person".
- *Rejected: billboard silhouette texture* — needs an image asset and reads
  wrong as the (fixed) camera orbits nothing; a lit mannequin shades
  consistently with the view's existing fixed lights.
- *Rejected: a ruler/scale bar* — precise but does not answer "how big does
  this feel next to a person", which is the request.

Material: neutral, semi-matte (`MeshStandardMaterial`, similar roughness to
the preview), so it reads as an object in the scene rather than UI.

### 2. Fixed reference height 1.8 m, one named constant

`HUMAN_REFERENCE_HEIGHT = 1.8` (meters = world units) in `realtime.ts`.
1.8 m is the conventional game-dev human reference. Not user-configurable
(configurability is a non-goal; a later change can lift the constant if
needed). Assumption recorded here: the user asked for "a human reference"
without a height; 1.8 m is the reasonable default.

### 3. Position: fixed in the camera frame, hugging the yaw-rotated box

The figure is NOT rotated by `applySlotModelRotation` — it belongs to the
viewer's frame, not the asset (the camera never moves; ADR 0005). Its ground
position is computed per construction from `yawRotatedBoxSize(prim.size,
yawDeg)`: a small fixed gap outside the box's camera-facing corner, standing
on y = 0. This keeps it beside the asset and clear of it in all four slots.

### 4. Depth-tested scene object (unlike the box overlay)

The box overlay draws with `depthTest: false` (annotation semantics). The
human figure is a scale proxy and must read as physically present, so it
renders depth-tested with the rest of the scene. Because it stands outside
the box extent (decision 3), the asset cannot normally occlude it.

### 5. Fit framing is unchanged

At zoom 1 the camera keeps framing exactly the bake box + padding. Small
assets will leave the 1.8 m figure partly out of frame at fit; the user
zooms out (shared zoom constants already allow it).

- *Rejected: extending the fit frame to include the figure* — it would
  silently redefine zoom 1 per document and break visual comparability with
  the 2D pass views, which is the realtime view's stated purpose.

### 6. State: in-memory document field, never serialized (ADR 0006)

`humanReference?: boolean` on `BakeDocument`, next to `boxOverlay`, marked
"never written into bundles"; a `setHumanReference(docId, on)` store action
mirroring `setBoxOverlay` (no dirty marking, no render invalidation — the
figure cannot affect passes). The button sits in the view-controls row and
is disabled under the same condition that disables Realtime 3D (no source
geometry, per `viewAvailability`). Component passes the flag through the
existing `RealtimeCanvas` props; the view rebuilds are unnecessary — the
figure is created once per `RealtimeMeshView` construction and shown/hidden
via `visible`, like the overlay.

## Risks / Trade-offs

- [Figure partly outside the fit frame for small/short assets] → accepted;
  zoom out to see it. Framing stays bake-comparable (decision 5).
- [1.8 m may not match a project's actual human scale] → single named
  constant; trivially adjustable; non-goal to expose as UI for now.
- [Very wide models could overlap the figure] → the figure hugs the
  yaw-rotated box corner with a fixed gap; worst case is partial
  intersection, acceptable for an editor aid.
- [Extra draw cost] → negligible (~hundreds of triangles, one more mesh).

## Migration Plan

None — no persisted format is touched (`isoinfinity-bake/6` unchanged, world
JSON unchanged). Rollback is removing the toggle, field, and figure builder.

## Open Questions

None.
