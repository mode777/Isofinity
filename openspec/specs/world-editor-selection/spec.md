# world-editor-selection Specification

## Purpose

Lets a user select an existing world placement — a baked sprite, an animated
character, or a point light — in order to inspect and adjust it and to move it
on the ground, with sprite picking resolved pixel-accurately from the baked
g-buffers.

## Requirements

### Requirement: Select tool selects a placement

The world editor SHALL offer a Select tool. With it active, clicking a
placement SHALL select that placement, clicking empty space SHALL clear the
selection, and pressing Escape SHALL clear the selection. At most one placement
SHALL be selected at a time. Selecting a placement SHALL NOT by itself change
the world, place anything, or mark the document dirty. The Select tool SHALL be
mutually exclusive with the pencil, eraser, and point-light tools; switching to
another tool SHALL NOT move any placement, and MAY clear the selection. A
left-press that lands on no placement SHALL clear the selection rather than
falling through to placement.

#### Scenario: Selecting a placed sprite

- **WHEN** the user activates the Select tool and clicks on a placed sprite
- **THEN** that sprite becomes the selected placement and is highlighted in the
  viewport

#### Scenario: Clicking empty space deselects

- **WHEN** the user clicks a point with no placement under the cursor while the
  Select tool is active
- **THEN** the selection is cleared and no placement is added or removed

#### Scenario: Escape clears the selection

- **WHEN** the user presses Escape while the Select tool has a selection
- **THEN** the selection is cleared

#### Scenario: Selecting does not dirty the document

- **WHEN** the user selects a placement in a saved world and then clears the
  selection
- **THEN** the document is not marked dirty and no history command is recorded

### Requirement: Sprite selection is pixel-accurate

When the Select tool resolves a sprite placement at the cursor, it SHALL test
the cursor pixel against the placement's baked g-buffer silhouette rather than
against its ground footprint: a cursor pixel inside the placement's transparent
margin SHALL NOT select it, while a cursor pixel inside its opaque silhouette
SHALL. The test SHALL use the document's in-memory sprite g-buffers — the same
data the surface-snap read uses — and SHALL NOT require a GPU readback or a
picking framebuffer.

When several sprite placements cover the cursor pixel, the selection SHALL
resolve to the nearest one by per-fragment depth — the placement's baked
g-buffer depth plus its world offset — matching the compositor's per-pixel
occlusion, so the sprite that is visibly on top is the one selected. The
placement's height SHALL be included, so a raised placement is selected exactly
where it is drawn.

#### Scenario: Transparent sprite margin is not selectable

- **WHEN** the user clicks a pixel that lies inside a sprite's rectangular
  bounds but in its baked transparent area, with nothing else under the cursor
- **THEN** no sprite is selected

#### Scenario: Overlapping sprites resolve to the visually topmost

- **WHEN** two overlapping sprites cover the cursor pixel and one is drawn over
  the other
- **THEN** the visible (nearest) sprite is selected, not the one behind it

#### Scenario: Raised sprite is selected where it is drawn

- **WHEN** a sprite is raised above the ground plane and the user clicks a pixel
  of its drawn silhouette above its ground footprint
- **THEN** the raised sprite is selected

### Requirement: Character and point-light selection

A character (mesh) placement SHALL be selectable when the cursor is within a
small screen-space tolerance of the placement's projected ground anchor. A
point light SHALL be selectable when the cursor is within a small screen-space
tolerance of its projected emitter point. Candidates from every kind SHALL be
compared by depth so that, when a cursor is near more than one kind of
placement, the nearer one is selected, matching the compositor's ordering.
Selecting a point light SHALL present the same light properties as selecting it
with the point-light tool.

#### Scenario: Selecting a character

- **WHEN** the user activates the Select tool and clicks on a placed character
- **THEN** the character becomes the selected placement and is highlighted

#### Scenario: Selecting a point light

- **WHEN** the user activates the Select tool and clicks on a placed point light
- **THEN** the light becomes the selected placement and its radius, energy,
  color, and position controls are shown

### Requirement: Point lights show a clickable, draggable icon

Every placed point light SHALL be marked in the world viewport by a small
editor-chrome icon drawn at the light's projected emitter point. The icon
SHALL be visible whenever the world document is open, regardless of the
active tool, and SHALL have a constant on-screen size that tracks the
viewport's zoom and pan with the world image (editor chrome anchored to the
world position, like the selection highlight). The icon SHALL be tinted with
the light's sRGB color so distinct lights are distinguishable; a selected or
hovered light's icon SHALL keep the same treatment as its selection
highlight (the light's radius ring).

Clicking within the icon's hit area — the same small screen-space tolerance
around the projected emitter the existing light pick uses — SHALL select that
light wherever the existing pick already selects lights (the Select tool; the
point-light tool's click-near-a-light behavior). Dragging a light by its icon
with the Select tool SHALL move the light along the ground plane exactly as
dragging the selected light does (live move; one undoable move command on
release). When the cursor rests within an icon's hit area with the Select
tool or the point-light tool active, the light's radius ring SHALL be shown
as hover feedback.

The icons SHALL be overlay chrome: they SHALL NOT be serialized into world
files, showing them SHALL NOT mark the document dirty, and they SHALL NOT
affect the rendered scene, the bake pipeline, or the light's deferred-light
contribution. Icons SHALL NOT consume clicks from placement brushes: with a
brush tool active, clicking on an icon SHALL place the brush as if the icon
were not there.

#### Scenario: Every placed light shows its icon

- **WHEN** a world contains two point lights of different colors and no
  placement is selected
- **THEN** each light shows a small icon at its emitter point, tinted with
  that light's color, in every tool mode

#### Scenario: Icon tracks zoom and pan

- **WHEN** the user zooms or pans the world viewport
- **THEN** each light icon stays anchored to its light's emitter point in the
  world image and keeps the same on-screen size

#### Scenario: Clicking an icon selects the light

- **WHEN** the user clicks on a light's icon with the Select tool
- **THEN** that light becomes the selected placement and its radius ring
  highlight appears

#### Scenario: Dragging an icon moves the light

- **WHEN** the user drags a light's icon with the Select tool and releases
- **THEN** the light follows the cursor during the drag and the move is one
  undoable command; undo returns the light to its pre-drag position

#### Scenario: Hovering an icon previews the radius ring

- **WHEN** the cursor rests within a light icon's hit area with the Select
  tool or the point-light tool active
- **THEN** the light's radius ring is shown while the cursor stays there

#### Scenario: Icons are chrome, not content

- **WHEN** the user selects a light, saves the world, and inspects the file
- **THEN** the file contains the light's placement data but no icon data, and
  selecting or hovering the icon did not mark the document dirty

#### Scenario: Brush clicks pass through icons

- **WHEN** a placement brush is active and the user clicks on a light icon
- **THEN** the brush places at that spot as usual and the light is not
  selected

### Requirement: Eraser uses placement picking

The eraser SHALL remove the placement resolved by the same pixel-accurate
pick the Select tool uses, rather than by ground footprint: a sprite is
erasable only where its baked g-buffer silhouette covers the cursor (its
transparent margin erases nothing), and a mesh or point light is erasable
near its projected anchor. When placements of different kinds overlap, the
eraser SHALL remove the one the Select tool would pick at that pixel.
Erasure SHALL record an undoable removal command (undo restores the exact
removed placement) and SHALL clear the selection when it targeted the removed
placement. Dragging the eraser across the viewport SHALL remove each picked
placement as the cursor passes over it; the eraser's hover SHALL highlight the
placement a click would remove using the same outline as the selection, and a
right-click with any other tool SHALL erase by the same rule.

#### Scenario: Transparent margin erases nothing

- **WHEN** the eraser clicks a pixel inside a sprite's rectangular bounds but
  in its baked transparent area, with nothing else under the cursor
- **THEN** no placement is removed

#### Scenario: Eraser removes the picked placement

- **WHEN** two overlapping sprites cover the cursor and the eraser clicks there
- **THEN** the visibly topmost sprite — the one the Select tool would pick — is
  removed

#### Scenario: Dragging erases successive placements

- **WHEN** the user drags the eraser across several placed sprites
- **THEN** each placement the cursor passes over is removed in turn

#### Scenario: Undo restores an erased placement

- **WHEN** the user erases a placement and undoes
- **THEN** the exact removed placement returns at its position, height, facing,
  and shadow strength

### Requirement: Selection highlight

The viewport SHALL visibly mark the selected placement with an editor-chrome
highlight anchored to its world position that tracks the viewport's zoom and
pan, so the selection is identifiable among overlapping placements. For a
selected sprite the highlight SHALL be a bounding box outlining the sprite
exactly as it is drawn (the projected extent of the placement's baked view at
its position, height, and facing), so the box matches the sprite's screen
silhouette bounds. For a selected character or point light the highlight SHALL
be an equivalent marker at the placement (the height gizmo, or the light's
radius ring). The highlight SHALL be overlay chrome: it SHALL NOT be serialized
into world files and showing it SHALL NOT mark the document dirty.

#### Scenario: Highlight follows zoom and pan

- **WHEN** the user zooms or pans the viewport with a placement selected
- **THEN** the highlight stays anchored to the selected placement's world
  position, scaling and moving with the projected image

#### Scenario: Selected sprite shows a bounding box

- **WHEN** the user selects a sprite
- **THEN** a bounding box outlines the sprite as drawn, moving and resizing with
  the sprite's position, height, and facing

#### Scenario: Highlight never reaches the saved file

- **WHEN** the user selects a placement, saves the world, and inspects the file
- **THEN** the file contains the placement's data but no selection or highlight
  data

### Requirement: Dragging a selected placement moves it

With the Select tool active, pressing the left button on a placement SHALL
select it, and dragging with the left button held SHALL move that placement
along the ground plane, free-form in x and z, following the cursor. A sprite or
character SHALL keep its height while it moves (only x and z change); a point
light's emitter SHALL follow the cursor. The move SHALL update the placement
live during the drag. On release, a drag that changed the position SHALL record
exactly one move command on the document's undo/redo history — the pre-drag
position for undo and the final position for redo — and SHALL mark the document
dirty. A press-and-release that did not move SHALL leave the placement
unchanged and SHALL NOT record a command or mark the document dirty.

#### Scenario: Dragging moves a sprite on the ground

- **WHEN** the user presses on a selected sprite and drags across the viewport
- **THEN** the sprite follows the cursor's ground position during the drag and
  stays at the same height

#### Scenario: One undo returns the placement to where the drag began

- **WHEN** the user drags a placement to a new spot and then undoes once
- **THEN** the placement is back at its pre-drag position, and redo moves it to
  the dragged position

#### Scenario: Click without dragging records nothing

- **WHEN** the user presses and releases on a placement without moving the
  pointer
- **THEN** the placement does not move, no history command is recorded, and the
  document is not marked dirty

#### Scenario: Dragging a character or a light

- **WHEN** the user drags a selected character or point light
- **THEN** its ground position follows the cursor and the move is one undoable
  command

### Requirement: Selected placement property editing

With a placement selected, the properties panel SHALL let the user edit that
placement's properties: its ground position (x and z) and height for a sprite
or character, and additionally its grounding-shadow strength (opacity, 0 off to
1 full) for a sprite. A selected point light SHALL expose its existing light
properties (radius, energy, color, and position). Every edit SHALL apply to the
world immediately and SHALL be recorded as an undoable world edit, and it SHALL
mark the document dirty.

Each height control — the selected sprite's, the selected character's, and the
selected point light's — SHALL pair its numeric field with a slider spanning
−2 to +2 world units, adjusting the placement height relative to its value at
the start of each drag: the thumb SHALL rest centered (no offset), dragging
SHALL apply the thumb's offset on top of that drag-start value continuously,
and releasing SHALL recenter the thumb (the next drag re-anchors on the height
current then, so repeated drags compound), with each applied step recorded
through the same edit path as a numeric commit. The slider SHALL be a pointer
shortcut only: it SHALL NOT clamp the placement's stored height, and typed
values SHALL keep applying exactly regardless of the band.

#### Scenario: Editing a selected sprite's height

- **WHEN** the user selects a sprite and changes its height in the properties
  panel
- **THEN** the sprite renders at the new height and the edit can be undone

#### Scenario: Editing a selected sprite's shadow opacity

- **WHEN** the user selects a sprite and changes its grounding-shadow strength
- **THEN** the sprite's baked grounding shadow is composited at the new
  strength and the edit can be undone

#### Scenario: Editing a selected placement's position

- **WHEN** the user changes the x or z value of a selected sprite, character,
  or light
- **THEN** the placement moves to that ground position immediately

#### Scenario: Slider adjusts a selected sprite's height

- **WHEN** the user selects a sprite at height 0 and drags its height
  slider to the +2 end
- **THEN** the sprite's height follows the offset live up to 2 and renders
  as it drags, the thumb recenters on release, and undo returns the sprite
  to its pre-drag height

#### Scenario: Slider adjusts a selected character's height

- **WHEN** the user drags the slider next to a selected character's height
  field
- **THEN** the character's height follows the dragged offset live, and
  undo returns it to its pre-drag height

#### Scenario: Slider adjusts a selected light's height

- **WHEN** the user drags the slider next to a selected point light's height
  field
- **THEN** the light's emitter height follows the dragged offset live, its
  rendered contribution moves with it, and undo returns it to its pre-drag
  height

#### Scenario: Typed value outside the slider band stays exact

- **WHEN** a selected sprite stands at height 5 and the user looks at its
  height row
- **THEN** the height field shows exactly 5 and the slider sits centered
  with no offset; typing `-3` into the field still applies exactly −3
  with the slider staying centered

### Requirement: Selected sprite facing

A selected sprite's facing SHALL be editable from the properties panel and the
keyboard. The panel SHALL offer a direction control listing the sprite asset's
available baked directions (N/E/S/W order), enabled when the asset has more than
one placeable direction (disabled or absent otherwise, with the placement
keeping its facing), and choosing a direction SHALL change the placement's
facing immediately, redraw it from that view, and record an undoable edit. While
the Select tool is active and a sprite is selected, pressing the `E` key (no
modifiers, not while typing in a form control) SHALL cycle that placement's
facing through its available directions with wrap; with no sprite selected, or
under any other tool, `E` SHALL keep cycling the active brush's direction as
before. Changing a placement's facing SHALL NOT change its ground position,
height, or footprint picking.

#### Scenario: Direction dropdown changes a placement's facing

- **WHEN** the user selects a multi-view sprite and picks another direction
- **THEN** the placement immediately shows that view and the change can be
  undone

#### Scenario: E cycles the selected sprite's facing

- **WHEN** the Select tool is active with a multi-view sprite selected and the
  user presses `E`
- **THEN** the placement advances to its next available direction, wrapping at
  the end, not the brush's direction

#### Scenario: E still cycles the brush without a selected sprite

- **WHEN** another tool is active, or the Select tool has no sprite selected,
  and the user presses `E`
- **THEN** the active brush's direction cycles as before

#### Scenario: Single-view sprite has no facing control

- **WHEN** the selected sprite is a single-view asset
- **THEN** the direction control is disabled (or absent) and pressing `E` does
  not change its facing

### Requirement: Selection is in-memory and cleared when stale

Selection SHALL be per-world-document in-memory editor state (ADR 0006):
preserved across tab switches and view recreation, never serialized into world
files, and never changing the world file format. When the selected placement no
longer exists — because it was erased, or because undo/redo removed it — the
selection SHALL clear. Selecting and deselecting SHALL NOT be recorded on the
undo/redo history.

#### Scenario: Selection survives a tab switch

- **WHEN** the user selects a placement in one world tab, switches to another
  tab, and switches back
- **THEN** the same placement is still selected and the world file contains no
  selection data

#### Scenario: Stale selection clears after undo

- **WHEN** the user places a sprite, selects it, and undoes the placement
- **THEN** the selection is cleared because the placement no longer exists

### Requirement: Selected sprite can be deleted from the properties panel

When a sprite placement is selected with the Select tool, its properties
section SHALL offer, next to the Deselect control, a Delete control that
removes the placement from the world. Deleting SHALL behave like erasing
the placement with the eraser: the removal is recorded as an undoable
command and the selection is cleared. Deselect SHALL continue to leave the
placement in place.

#### Scenario: Delete removes the selected sprite

- **WHEN** a sprite placement is selected and the user activates Delete in
  its properties section
- **THEN** the placement is removed from the world and the selection is
  cleared

#### Scenario: Delete is undoable

- **WHEN** a selected sprite is deleted via the properties section and the
  user performs undo
- **THEN** the placement is restored

#### Scenario: Deselect still keeps the placement

- **WHEN** a selected sprite's Deselect control is activated
- **THEN** the selection is cleared and the placement remains in the world


### Requirement: Hidden layers are not pickable

Placement picking — the Select tool, the eraser, and drag interactions on
selected placements — SHALL consider only placements on visible layers. With
the sprite layer hidden, clicks SHALL pass through sprite placements as if
the space were empty; with the mesh layer hidden, the skinned character
SHALL NOT be selectable. Picking SHALL NOT itself change layer visibility,
and the layer dropdown's state SHALL NOT change what a pick returns beyond
excluding hidden layers.

A selection that exists while its layer is hidden SHALL be kept rather than
cleared, but its selection highlight SHALL NOT be drawn while the layer is
hidden; showing the layer again SHALL restore the highlight. Hiding the
ground layer changes no pick results (the ground is not a placement) —
clicks on empty space keep deselecting as before.

#### Scenario: Clicks pass through a hidden sprite layer

- **WHEN** the sprite layer is hidden and the user clicks where a sprite
  placement stands (over the ground)
- **THEN** the click does not select or erase that sprite; with the Select
  tool it deselects as if empty space were clicked

#### Scenario: Hidden character is not selectable

- **WHEN** the mesh layer is hidden and the user clicks the character with
  the Select tool
- **THEN** the character is not selected, and a click falls through to
  whatever is visible underneath (or deselects)

#### Scenario: Eraser skips hidden layers

- **WHEN** the sprite layer is hidden and the user right-clicks where a
  sprite placement stands
- **THEN** no placement is removed

#### Scenario: Selection survives hiding its layer

- **WHEN** a sprite is selected and the user hides the sprite layer, then
  shows it again
- **THEN** the selection is kept throughout, the highlight is not drawn
  while the layer is hidden, and the highlight reappears when the layer
  returns
