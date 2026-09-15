# integrated-editor Delta

## MODIFIED Requirements

### Requirement: World editor toolbar

A world editor SHALL render a toolbar above its content offering, as icon
buttons (icons instead of text labels), Save, undo, and redo; the active
tool's contextual controls; and a short hint naming the active tool. The
global actions (Save, undo, redo) SHALL be visually separated from the
tool-contextual controls (for example by a divider between the groups).

Save SHALL prompt for a file name, defaulting to the world's saved name or
the next free `world-N`, and SHALL write the world to the workspace's
`worlds/` folder under the chosen name when a workspace is connected;
cancelling SHALL abort without writing or clearing the dirty state. The
undo/redo buttons SHALL undo and redo the document's world edits as
specified by the world-edit-history capability, and SHALL be disabled when
there is nothing to undo (or redo).

The tool-contextual controls are the brush controls — the current-brush
label, the "…" picker button that opens the asset browser (see the
world-asset-browser capability), and the previously-used-brushes dropdown —
plus the surface-snap toggle, and they SHALL be visible only while a
placement (pencil) tool is active — including when no brush is chosen yet.
With the Select, eraser, or point-light tool active they SHALL be hidden.
Hiding them SHALL NOT change their stored state: the chosen brush, the
previously-used list, and the snap toggle's on/off state are per-document
in-memory editor state and SHALL apply again when a placement tool is
reactivated.

The pencil tool SHALL be the active placement tool by default; it is
activated from the world viewport's tool bar (see the world-editor tool bar
requirement). The brush it places is chosen from the asset browser opened by
the "…" picker button; the label next to it SHALL name the current brush
(and a no-brush placeholder when none is chosen). The dropdown next to the
picker SHALL list the brushes this document has already used, most recently
used first, and SHALL offer no other entries: it starts empty, picking from
it acquires that brush exactly as a fresh pick from the browser does, and it
never lists primitives, sprites, or anything else that has not been used in
this document. The previously-used list SHALL NOT be serialized into world
files — a reopened world starts with an empty list. Clicking or dragging on
the world canvas with the pencil places the chosen brush at the pointed
cell; the right mouse button removes placements. The surface-snap toggle
SHALL control whether placements take their height from the visible surface
under the cursor (on) or from the user-adjusted placement height (off), as
specified by the placement-height requirement. The brush's placement height,
grounding-shadow strength, and direction SHALL be edited in the properties
panel's Brush section (see the properties-panel requirement), not in the
toolbar. The toolbar SHALL NOT host tool selection: the Select, pencil,
point-light, and eraser tools live in the world viewport's tool bar.

#### Scenario: World toolbar offers save, pencil, and brush dropdown

- **WHEN** the user activates a world editor tab with the pencil tool active
- **THEN** the toolbar shows Save, undo, and redo as icon buttons separated
  by a divider from the brush controls and surface-snap toggle, the tool bar
  in the viewport marks the pencil active, and the brush controls show the
  current brush's label, the "…" picker button, and the previously-used
  brushes dropdown

#### Scenario: Picker button opens the asset browser

- **WHEN** the user activates the "…" picker button in the toolbar
- **THEN** the asset browser modal opens (as specified by the
  world-asset-browser capability) without changing the active tool or brush

#### Scenario: Previously used brushes are listed

- **WHEN** the user picks brush `A`, then brush `B`, and then opens the
  dropdown in the same world document
- **THEN** the dropdown lists `B` first and `A` second, and choosing `A`
  activates it again as the placement brush

#### Scenario: Recent list starts empty and stays per document

- **WHEN** the user has used brushes in one world tab and then switches to
  another world tab that has not placed anything, and later reopens the
  saved first world
- **THEN** the second tab's dropdown is empty and the reopened world's
  dropdown starts empty (the list is not restored from the file)

#### Scenario: Contextual controls appear only in placement mode

- **WHEN** the user switches to the Select, eraser, or point-light tool
- **THEN** the brush controls and the surface-snap toggle are hidden from
  the toolbar, and switching back to a placement tool shows them again

#### Scenario: Surface-snap toggle and height field are available

- **WHEN** the user activates a world editor tab with a placement tool
  active
- **THEN** the toolbar shows a surface-snap toggle that can be switched on
  and off and it persists across tab switches within the session, the
  placement-height field lives in the properties panel's Brush section, and
  with the Select, eraser, or point-light tool active the toggle is hidden
  while keeping its state

#### Scenario: Contextual state survives tool switches

- **WHEN** surface snap is on and a brush chosen, the user switches to the
  eraser and back to the pencil tool
- **THEN** surface snap is still on and the same brush is still chosen,
  without the user re-picking either

#### Scenario: Brush properties live in the panel

- **WHEN** the user activates a world editor tab with a brush chosen
- **THEN** the toolbar shows no numeric height field and no direction
  control, and the properties panel's Brush section offers the placement
  height, grounding-shadow strength, and (for a multi-view sprite) the
  direction

#### Scenario: Select tool is available

- **WHEN** the user activates a world editor tab
- **THEN** the viewport's tool bar offers a Select tool alongside the
  pencil, eraser, and point-light tools

#### Scenario: Saving prompts with a sensible default

- **WHEN** the user activates Save in an unsaved world editor
- **THEN** the prompt offers the first free `world-N` name, and accepting
  writes `worlds/<name>.json` when connected

#### Scenario: Pencil places the selected brush

- **WHEN** the user picks a brush (from the asset browser or the
  previously-used dropdown) and clicks a cell with the pencil active
- **THEN** an instance of that brush appears at the cell and the world tab
  turns dirty

#### Scenario: Eraser remains available

- **WHEN** the user activates the eraser from the tool bar and clicks a
  placed sprite, or right-clicks a placed sprite with any tool active
- **THEN** that placement is removed
