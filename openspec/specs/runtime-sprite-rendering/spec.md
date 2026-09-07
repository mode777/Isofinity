## Purpose

How the runtime displays baked sprites once asset bundles carry
pre-rendered lit passes: each placed sprite renders from the baked beauty
image, re-lit in real time by the g-buffer normals, while per-pixel
occlusion and hit-testing stay driven by the baked g-buffer in every mode.

## Requirements

### Requirement: Bundles must carry a rendered pass

The editor's bundle parser SHALL accept `isoinfinity-bake/4` and
`isoinfinity-bake/5` format prefixes (unknown prefixes fail with a named
error), but a bundle SHALL NOT be placed unless it carries its rendered
pass: loading a bundle without `<id>-render.png` SHALL fail with a named
error and place no sprite. A `/4` or `/5` bundle that includes the rendered
pass SHALL load as today: the lit image is uploaded as the sprite's display
layer.

#### Scenario: v3 bundle is rejected

- **WHEN** the user loads an `isoinfinity-bake/3` bundle
- **THEN** loading fails with a named error and no sprite is placed

#### Scenario: v4 bundle without a render pass is rejected

- **WHEN** the user loads a `/4` bundle whose manifest lists no render pass
- **THEN** loading fails with a named error and no sprite is placed

#### Scenario: v4 bundle with a render pass

- **WHEN** the user loads a `/4` bundle that includes `<id>-render.png`
- **THEN** the editor uploads the lit image as the sprite's display layer
  and places it

#### Scenario: v5 bundle with a render pass

- **WHEN** the user loads a `/5` bundle that includes `<id>-render.png`
- **THEN** the editor uploads the lit image as the sprite's display layer,
  places it, and restores the bundle's provenance for editing

### Requirement: Extra bundle views are placeable per view

When a sprite bundle is loaded into a world document — as a brush or on
world open — each view slot it stores (the north view plus any extra
E/S/W views) SHALL load as a placeable view of the same asset, provided
that view carries its own rendered pass. A view without a rendered pass
SHALL NOT be placeable: it SHALL be skipped with a status note while the
bundle's placeable views still load (the same rendered-pass rule a whole
bundle follows today). Each view SHALL keep its own baked sprite size and
origin; a `/4` or `/5` bundle (or any bundle storing only north) SHALL
load exactly as today — a single north-facing view.

#### Scenario: Multi-view bundle exposes all its directions

- **WHEN** the user picks a sprite whose `/6` bundle stores N, E, S, and W,
  all with render passes
- **THEN** the world document holds all four views of that asset and every
  direction is placeable

#### Scenario: View without a render pass is not placeable

- **WHEN** a bundle's east view has a g-buffer but no rendered pass
- **THEN** east is skipped with a status note and the remaining placeable
  views (at least north) still load

#### Scenario: Older bundles stay single-view

- **WHEN** the user picks a `/4` or `/5` bundle as a brush
- **THEN** only the north view loads and no direction control is offered
  for it

### Requirement: Per-pixel occlusion stays g-buffer driven

Per-pixel occlusion between sprites SHALL not depend on shading: depth
comes from the baked g-buffer, and sprite coverage for fragment discard
comes from g-buffer emptiness (the hard raster coverage of the same bake
draw) — never from the antialiased alpha of the render pass. Every placed
sprite instance SHALL add its placement's world offset — ground position
and height — to the baked g-buffer depth in the shared global reference
frame, so occlusion and interpenetration stay pixel-accurate at any
height: a raised sprite occludes exactly along its baked silhouette
against the ground and against other placements, whether stacked, sunk
into, or beside them. Cursor placement and erase keep using ground-
footprint picking; erase SHALL remove the placement with the greatest
depth key — the topmost — among the placements whose ground footprint
contains the cursor.

#### Scenario: Interpenetrating sprites resolve pixel-accurately

- **WHEN** two sprites overlap in depth
- **THEN** the per-pixel occlusion boundary between them follows the baked
  g-buffer depth

#### Scenario: Stacked sprites resolve pixel-accurately

- **WHEN** a sprite is placed at a height above another sprite's ground
  position so their silhouettes overlap on screen
- **THEN** the per-pixel occlusion boundary between them follows the baked
  g-buffer depth with the raised placement's offset applied, and the
  raised sprite's pixels hide the underlying sprite exactly where its own
  g-buffer is opaque

#### Scenario: Partial render-pass alpha never drops fragments

- **WHEN** a sprite pixel lies inside the baked g-buffer coverage but its
  render-pass alpha is partial (antialiased edge)
- **THEN** the fragment is still rendered and blends with the partial alpha
  rather than being discarded

#### Scenario: Erase removes the topmost placement

- **WHEN** two placements' ground footprints both contain the cursor and
  one stands higher than the other
- **THEN** erasing removes the higher placement first, and a repeat erase
  removes the lower one

### Requirement: Ambient light is a per-channel color

The ambient fill term SHALL be a per-channel color set by an ambient color
picker (the picked sRGB color converted to linear RGB per channel). The
runtime SHALL NOT provide a separate ambient scalar/intensity control; the
brightness of the ambient fill comes solely from the picked color.

#### Scenario: Ambient color tints the fill

- **WHEN** the user picks a colored ambient value
- **THEN** the ambient fill on every sprite and the ground takes on that
  hue, converted per channel to linear space

#### Scenario: No ambient scalar remains

- **WHEN** the light panel renders
- **THEN** it shows an ambient color picker and no ambient slider

### Requirement: Every sprite displays the shaded prerendered image

The runtime SHALL display every placed sprite by sampling its prerendered
lit image and shading it with the dynamic key + ambient lights
(multiplicatively, over the baked g-buffer normal), regardless of where the
sprite came from (boot bake or bundle). The ambient term SHALL be the
per-channel ambient color (see ADDED requirement above). The global
Dynamic light switch SHALL pin shading to identity when disabled (pure
prerendered image).

#### Scenario: Boot-baked sprites show rendered images

- **WHEN** the runtime page finishes loading
- **THEN** every test primitive displays as a path-traced, shaded sprite
  and responds to the key light controls

#### Scenario: Key light shading applies uniformly

- **WHEN** the user adjusts the key light or ambient controls
- **THEN** all placed sprites — boot-baked and bundle-loaded alike —
  respond identically to the change

### Requirement: Placements render their direction's view

Every placement SHALL be drawn from the baked view matching its placement
direction (north by default). Occlusion and dynamic lighting SHALL use
that view's own baked g-buffer — world-space normals and depth from the
same fixed isometric camera — so a placement faces as the rotated asset
stood at bake time and stays pixel-accurately occluded exactly as if that
view were the only one. Each view's sprite SHALL be drawn so that the
view's recorded origin anchor lands at the placement's projected position,
and the placement's ground position SHALL be exactly the cursor's ground
position at placement time — placement is free-form, with no cell offset:
the full 3D anchor point (the view's anchor, at the placement height) lands
exactly at the mouse position that placed it, in every direction. The
placement ghost SHALL be drawn at the same point so the preview matches
the landed placement exactly. A bundle without a recorded custom origin
anchors at its box min corner and SHALL render exactly as before this
change. Placement direction SHALL NOT change ground footprint picking or
erase behavior: both operate on the placement's ground footprint as today.

#### Scenario: Placement draws its direction

- **WHEN** the user places a brush facing east
- **THEN** the placement shows the asset's east view, shaded by the
  dynamic lights exactly like any other placement

#### Scenario: Directions occlude pixel-accurately

- **WHEN** a south-facing placement interpenetrates or stands behind other
  sprites
- **THEN** its hidden pixels resolve along its south view's baked
  silhouette, the same per-pixel depth boundary a north placement gets

#### Scenario: Direction does not change picking or erase

- **WHEN** the user right-clicks a spot holding an east-facing placement
- **THEN** the eraser removes the topmost placement under the cursor
  regardless of its direction

#### Scenario: Custom anchor lands at the placement point

- **WHEN** the user places an asset with the mouse at a ground position
  and a brush height of 0, and the asset's baked origin sits at its ground
  plane (for example its ground-plane center)
- **THEN** the anchor's ground point lands exactly at the mouse's ground
  position — no half-cell offset — and the ghost shown while dragging
  matches the landed placement exactly

#### Scenario: Brush height raises the anchor above the cursor's ground point

- **WHEN** the user places an asset with the brush height at 1 unit and
  the asset's baked origin sits at its ground plane
- **THEN** the anchor point lands exactly 1 unit above the mouse's ground
  position — as if the mouse cursor were hovering 1 unit above the ground —
  so the sprite stands one unit up with the anchor still on the cursor's
  ground track

#### Scenario: The anchor's height is always the brush height

- **WHEN** the user places any asset at any brush height
- **THEN** the anchor point's world height equals the brush height and its
  ground track equals the mouse's ground position, so the asset's base
  rides at (brush height − anchor y): a ground-anchored asset's base sits
  at the brush height, and an asset whose anchor y equals the brush height
  stands with its base on the ground

#### Scenario: Raised anchor sinks the asset accordingly

- **WHEN** the user places at ground level an asset whose baked origin sits
  one unit above the ground (for example a hook on a hanging sign)
- **THEN** the anchor point lands at the mouse's ground position, so
  the asset stands one unit lower than an identical asset anchored at its
  base

#### Scenario: Negative brush height sinks the anchor below the ground

- **WHEN** the user places an asset with a negative brush height
- **THEN** the anchor point lands exactly at the mouse's ground position at
  that height, so the asset hangs or sinks relative to the cursor by the
  anchor's own height offset regardless of the anchor's position in the
  asset

#### Scenario: Switching direction pivots around the anchor

- **WHEN** the user switches a placed asset's direction
- **THEN** the anchor point stays at the placement's ground position and
  the asset pivots around it

#### Scenario: Legacy sprites render unchanged

- **WHEN** the user places a sprite whose bundle records no custom origin
- **THEN** it draws with its box min corner exactly at the mouse's ground
  position and height

### Requirement: Runtime bakes rendered passes at boot with a procedural environment

The integrated editor SHALL make the built-in test primitives available as
placeable sprites without requiring any user-provided asset: their g-buffer
and rendered passes SHALL be baked using the built-in procedural environment
(no external HDRI asset) — an equirect gradient sky with a warm sun disc
whose direction matches the world editor's default key light. The
environment SHALL be a pure function so bakes are reproducible. A built-in
primitive SHALL have its rendered pass before it can be placed in a world.

#### Scenario: Boot bake needs no user input

- **WHEN** the user opens a built-in primitive from the project browser with
  no workspace connected and no HDRI loaded
- **THEN** the primitive is baked — a g-buffer plus a rendered pass from the
  procedural environment — and can be placed into a world without loading
  any external asset

### Requirement: Sprites load from the workspace listing

While a workspace is connected, the runtime editor's sprite loader SHALL
additionally list the `sprites/` folder's bundles (`.sprite` and `.zip`)
and loading an entry SHALL follow exactly the same path as a dialog-loaded
bundle: same parser, same rules (a bundle without its rendered pass is
still rejected), same unique-id handling when an asset id already exists.
The existing file dialog and drag-drop SHALL remain fully functional, with
and without a workspace.

#### Scenario: Sprite loaded from the workspace listing

- **WHEN** the user picks a `.sprite` bundle from the `sprites/` listing
- **THEN** the sprite loads, appears in the toolbar, and places exactly as
  if loaded through the file dialog

#### Scenario: Same rules apply to workspace loads

- **WHEN** the user picks a bundle that lacks its rendered pass from the
  `sprites/` listing
- **THEN** loading fails with the same named error as the dialog flow and
  no sprite is placed

#### Scenario: Duplicate asset ids stay unique

- **WHEN** a workspace bundle is loaded whose asset id already exists in
  the scene
- **THEN** the loaded copy gets a unique id exactly as the dialog flow does

#### Scenario: Dialog upload keeps working alongside the workspace

- **WHEN** a workspace is connected and the user loads a `.sprite` file
  through the existing file dialog instead
- **THEN** it behaves exactly as the zip dialog flow did before this change
### Requirement: Sprites composite baked grounding shadows

The sprite compositor SHALL recognize a third pixel class in the render
pass — pixels whose g-buffer value is empty (zero-length normal) but whose
render alpha is positive and whose color is the dark grounding tint — and
composite them as grounding shadows: alpha-blended without key/ambient
shading, without writing the placement's object depth. Object pixels
(g-buffer non-empty) and fully empty pixels SHALL composite exactly as
before; g-buffer-driven occlusion, hit-testing and discard semantics SHALL
be unchanged.

A grounding-shadow pixel SHALL write its **true ground-plane depth**: the
analytic intersection of the pixel's view ray with the placement's ground
cell plane, using the shared fixed-camera constants (a GLSL twin of the
CPU ground unprojection) — never the object's depth and never no depth.
With the existing painter-sorted batch and LEQUAL depth test this makes
the depth buffer resolve every interleaving pixel-accurately:

- a farther sprite's opaque pixels are darkened by the shadow drawn over
  them (the shadow's ground depth is nearer and passes the test),
- a nearer sprite's opaque pixels overwrite the shadow,
- overlapping shadows of different placements resolve to the nearer
  ground point instead of double-darkening.

#### Scenario: Shadow darkens the ground and things standing behind it

- **WHEN** a placement carrying a baked grounding shadow stands on the
  ground with another sprite behind it
- **THEN** the shadow patch darkens the bare ground and the base of the
  farther sprite, while sprites nearer than the shadow's ground area
  composite over it unmodified

#### Scenario: Shadow does not claim object depth

- **WHEN** any sprite is drawn after a placement with a grounding shadow,
  overlapping the shadow's pixels
- **THEN** the later sprite's per-pixel depth test resolves against the
  shadow's ground-plane depth, so no part of the world is occluded by the
  shadow's pixels

#### Scenario: Legacy sprites without shadow pixels are unchanged

- **WHEN** a sprite bundle baked before this change (or with the toggle
  off) is placed
- **THEN** its compositing is pixel-identical to the pre-change runtime —
  the shadow pixel class never fires

#### Scenario: Shadow stays visible with dynamic light off

- **WHEN** the Dynamic light switch pins shading to identity
- **THEN** the grounding shadow remains composited (it is part of the
  prerendered image, like the object's own baked light)

### Requirement: Raised placements suppress the baked grounding shadow

A placement whose height is not the ground level SHALL NOT composite its
baked grounding shadow from the sprite quad (it would float with the
object); the existing contact-shadow ellipse behavior covers those
placements as before. Ground-level placements composite the baked shadow.
The suppression SHALL be per-instance (the shader knows the placement
height) and SHALL NOT require separate draws or batches.

#### Scenario: Raised placement keeps the ellipses, drops the baked patch

- **WHEN** a placement with a baked grounding shadow is raised above the
  ground plane
- **THEN** the baked shadow pixels do not composite while the placement's
  contact-shadow ellipse still shows, and lowering it back to the ground
  restores the baked patch
