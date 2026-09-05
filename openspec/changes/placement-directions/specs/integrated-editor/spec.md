## MODIFIED Requirements

### Requirement: World editor toolbar

A world editor SHALL render a toolbar above its content offering Save, a
pencil placement tool, an eraser toggle, a surface-snap toggle, and a
numeric placement-height field. Save
SHALL prompt for a file name, defaulting to the world's saved name or the
next free `world-N`, and SHALL write the world to the workspace's `worlds/`
folder under the chosen name when a workspace is connected; cancelling
SHALL abort without writing or clearing the dirty state. The pencil tool
SHALL be the active placement tool by default; the brush it places is
chosen from a dropdown grouped into **Primitives** (the built-in test
primitives) and **Sprites** (the workspace's saved sprite bundles, listed
when a workspace is connected). Next to the brush dropdown the toolbar
SHALL offer a direction control listing the active brush's placeable
directions (N/E/S/W) as specified by the brush-direction requirement.
Clicking or dragging on the world canvas
with the pencil places the chosen brush at the pointed cell; the eraser
toggle (and the right mouse button) removes placements. The surface-snap
toggle SHALL control whether placements take their height from the visible
surface under the cursor (on) or from the user-adjusted placement height
(off), as specified by the placement-height requirement; the height field
edits that adjusted height as specified there; both SHALL be per-document
in-memory editor state. The toolbar SHALL replace the
previous per-layer tool strip.

#### Scenario: World toolbar offers save, pencil, and brush dropdown

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar shows Save, a pencil tool marked active, and a brush
  dropdown whose groups list the built-in primitives and the workspace's
  saved sprites

#### Scenario: Surface-snap toggle and height field are available

- **WHEN** the user activates a world editor tab
- **THEN** the toolbar shows a surface-snap toggle that can be switched on
  and off and a numeric height field showing the current placement height,
  and both persist across tab switches within the session

#### Scenario: Saving prompts with a sensible default

- **WHEN** the user activates Save in an unsaved world editor
- **THEN** the prompt offers the first free `world-N` name, and accepting
  writes `worlds/<name>.json` when connected

#### Scenario: Pencil places the selected brush

- **WHEN** the user picks a brush and clicks a cell with the pencil active
- **THEN** an instance of that brush appears at the cell and the world tab
  turns dirty

#### Scenario: Eraser remains available

- **WHEN** the user toggles the eraser and clicks a placed sprite, or
  right-clicks a placed sprite with the pencil active
- **THEN** that placement is removed

## ADDED Requirements

### Requirement: Brush direction selection

A world editor SHALL let the user choose which way the current brush faces
when the brush is a sprite baked with more than one placeable view slot
(N/E/S/W). A direction control next to the brush dropdown SHALL list the
active brush's available directions in N, E, S, W order and SHALL be
enabled only while the active brush is a multi-view sprite; for
single-view sprites and primitives it SHALL be disabled (or hidden) and
the brush faces north. Picking a direction SHALL make subsequent
placements face that way, and the ghost preview SHALL show the brush as
that direction's view. Pressing the `E` key (without modifier keys) in the
world editor SHALL cycle the brush through its available directions in
N → E → S → W order, wrapping around and skipping directions the sprite
does not provide; for a single-view brush or while a text field, select,
or other form control has keyboard focus it SHALL do nothing. The chosen
brush direction SHALL be per-document in-memory editor state: it SHALL
never by itself mark the document dirty nor reach a saved file — a
placement's direction is persisted only when placed, as specified by
world persistence. Already-placed sprites SHALL keep their direction; the
eraser SHALL stay direction-independent.

#### Scenario: Multi-view brush offers its directions

- **WHEN** the user picks a sprite whose bundle stores north, east, and
  west views with render passes
- **THEN** the direction control next to the brush dropdown lists N, E, and
  W with east currently placeable, and picking W makes the next placement
  face west

#### Scenario: Ghost reflects the chosen direction

- **WHEN** the user switches the brush direction while the ghost preview is
  visible
- **THEN** the ghost immediately shows the brush as the newly chosen
  direction's view, occluded as that view would be placed

#### Scenario: E key cycles through available directions

- **WHEN** the user presses `E` with a north/east/west brush active
- **THEN** the brush direction advances N → E → W → N, skipping the absent
  south view

#### Scenario: E key wraps around

- **WHEN** the user presses `E` while the brush faces its last available
  direction
- **THEN** the brush wraps to its first available direction (north when
  provided)

#### Scenario: Single-view brush has no direction choice

- **WHEN** the active brush is a primitive or a single-view sprite and the
  user opens the direction control or presses `E`
- **THEN** the control is disabled (or absent) and pressing `E` changes
  nothing

#### Scenario: E key does not fight text entry

- **WHEN** the user presses `E` while typing in the placement-height field
- **THEN** the letter is entered into the field and the brush direction is
  unchanged

#### Scenario: Placed sprites keep their direction

- **WHEN** the user changes the brush direction after placing sprites
- **THEN** the already-placed sprites still face their original directions
