# Proposal: Unified deferred lighting + point lights

## Why

The compositor shades each draw forward (sprite/mesh/ground fragments each
apply the dynamic lights themselves), so a new light type means touching
every shader path, and light response already differs per path (the mesh
applies the factor post-tonemap, sprites and ground pre-tonemap). POE — our
reference architecture — applies dynamic lights (torches, spell bursts) as
deferred screen-space passes over baked position/normal data. Unifying on
that shape now removes the per-path shading drift, makes the future lighting
feature space (point lights first) a single shared implementation, and gives
point lights an architecture that does not scale cost with per-fragment
light loops baked into every draw.

## What Changes

- **BREAKING (rendering internals)**: the world compositor restructures
  from forward per-fragment shading to a two-phase frame:
  1. a geometry pass drawing ground, meshes and sprites into an offscreen
     FBO with two attachments — a screen-space g-buffer
     (RGBA16F: world normal + linear depth, the same layout as the per-sprite
     bake g-buffer) and an unlit color surface (RGBA8: albedo·AO, where a
     sprite's albedo·AO *is* its baked render texel);
  2. a fullscreen deferred light pass over the default framebuffer that
     reconstructs world position from g-buffer depth (ADR 0001 machinery),
     evaluates ambient (SH irradiance, uniform across all geometry), the key
     directional light, and all point lights, and applies the ADR 0003
     multiplicative factor once, for everything.
- All dynamic lights — directional key included — are evaluated in the
  deferred light pass. The Dynamic-light switch pins the factor to identity
  by skipping the pass (the composite shows the pure prerendered image,
  exactly as today).
- New: **point light placements** — a placeable/erasable placement kind
  (like sprites) with position (world x/y/z), radius, energy, and color.
  Cap of 16 concurrently rendered point lights (compile-time constant).
  Rendering: per-fragment evaluation in the deferred pass with a quadratic
  window attenuation to zero at the radius.
- The grounding-shadow pixel class maps to the ground plane in the screen
  g-buffer (up-normal, ground-plane depth) instead of being g-buffer-empty;
  the flat ground batch and the material ground write up/surface normals and
  depth so point lights pool on the floor.
- Mesh shading unifies with sprites: the mesh writes its env-lit tonemapped
  texel as albedo and the deferred pass applies the light factor (today it
  applies the factor post-tonemap in its own shader) — a small, accepted
  appearance shift that removes the double-shading inconsistency (ADR 0003
  successor, new ADR).
- World serialization bumps to `isoinfinity-world/6` (point light
  placements persist with position/radius/energy/color); the loader keeps
  accepting `/1`–`/5` (old files load unchanged, no light placements) and
  the save format is additive — no bake-format change.
- Editor: the world editor gains a point-light placement tool (place/erase
  like sprites) and point-light properties (radius, energy, color, position)
  in the context-sensitive properties panel.

## Capabilities

### New Capabilities

- `runtime-deferred-lighting`: the unified two-phase compositor frame —
  screen-space g-buffer construction across ground/mesh/sprite draws, the
  deferred light pass (ambient + directional + point lights, position
  reconstruction from depth), the Dynamic-light-off degenerate case, and
  point light rendering requirements (cap, attenuation, placement mapping).

### Modified Capabilities

- `runtime-sprite-rendering`: the shading requirement relocates — sprites
  write baked render texels as albedo·AO into the screen g-buffer instead of
  applying the light factor per fragment; grounding-shadow pixels gain a
  ground-plane g-buffer mapping; occlusion, discard and hit-test semantics
  unchanged.
- `runtime-mesh-rendering`: meshes write normals/depth/albedo into the
  screen-space g-buffer and receive lighting from the deferred pass (no
  per-mesh factor application); appearance unifies with sprite light
  response.
- `runtime-ground-rendering`: the ground (flat batch and material plane)
  writes up/surface normals and depth into the screen-space g-buffer so the
  deferred pass lights it.
- `world-persistence`: format `isoinfinity-world/6` — point light
  placements (position, radius, energy, color) persist and restore;
  `/1`–`/5` tolerance unchanged.
- `integrated-editor`: point-light placement tool and point-light
  properties panel (radius, energy, color, position).

## Impact

- `src/runtime/renderer.ts` — frame restructure (FBO + 2 attachments, light
  pass program, UBO point-light block, present path); the largest change.
- `src/runtime/world.ts` — point light placement kind (in-memory model).
- `src/app/store/world.ts` + `src/app/document.ts` — `/6` serialization,
  light placement persistence.
- `src/app/components/WorldEditor.tsx` + properties panel — placement tool,
  per-light properties, light marker/gizmo on the ground.
- `src/app/realtime.ts` — per-frame light upload wiring.
- `scratch-verify.html` — compositor checks move to reading the deferred
  output; new checks for g-buffer attachment contents.
- Docs: `docs/runtime.md` (pass structure), `docs/glossary.md` (new terms),
  `docs/roadmap.md`, and a new ADR (unified deferred lighting; successor to
  ADR 0003's factor placement, extension of ADR 0009's compositor).
- No change to `src/bake/` or the `isoinfinity-bake` format.

### Non-goals

- Point-light shadows (shadow maps or shadow-blend modulation) — the RT2
  alpha channel is reserved as the future hook.
- Per-light scissored light quads (the fullscreen loop with radius early-out
  is the v1; scissoring is a pure optimization later).
- Transparency: deferred cannot represent alpha-ordered transparent
  geometry in the g-buffer; a forward transparent pass after lighting is the
  future shape (POE-style emissive materials), not built here.
- Clustered/tiled lighting, light LOD, or >16-light scaling.
- Bake pipeline or bake-format changes; the bake view keeps its own
  compositing path.
- Mesh locomotion/terrain serialization concerns.

### Format-version impact

- `isoinfinity-world/6`: additive — a world file may carry point light
  placements (`position`, `radius`, `energy`, `color`); every `/1`–`/5`
  file loads unchanged (no light placements). Saving emits `/6`.
- No bake-format change; sprite bundles are untouched.
