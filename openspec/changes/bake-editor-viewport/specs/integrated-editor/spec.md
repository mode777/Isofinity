## MODIFIED Requirements

### Requirement: Sprite editor toolbar

A sprite editor SHALL render a toolbar above its content offering Save,
Place in world, and a viewport view-mode switcher. Save SHALL prompt for a
file name, offering the document's current name as the default; cancelling
the prompt SHALL abort the save without writing a file or clearing the
dirty state. With a workspace connected, Save SHALL write the bundle to the
workspace's `sprites/` folder under the chosen name; without a connection it
SHALL fall back to downloading the bundle. Place in world SHALL behave as
specified by the placement requirement (target an open world tab or create
a new world). The view-mode switcher SHALL offer the four viewport views —
Realtime 3D, Normals, Depth, Render — with the active view marked; a view
whose required data is unavailable SHALL be disabled and explain why on
hover. The toolbar SHALL NOT duplicate the properties panel's bake and
render pass actions.

#### Scenario: Save prompts with the current name

- **WHEN** the user activates Save in a sprite editor whose document was
  opened from `robot.sprite`
- **THEN** the prompt is prefilled with `robot` (or `robot.sprite`), and
  accepting it writes the bundle to `sprites/` under that name when a
  workspace is connected

#### Scenario: Cancelling the save prompt saves nothing

- **WHEN** the user cancels the file-name prompt
- **THEN** no file is written or downloaded and the document stays dirty

#### Scenario: Save falls back to download without a workspace

- **WHEN** the user saves a sprite document with no workspace connected
- **THEN** the bundle downloads as a `.sprite` file instead of failing

#### Scenario: Place in world from the toolbar

- **WHEN** the user activates Place in world on a baked sprite document
- **THEN** the sprite becomes a placeable layer in the active world
  document (or a new world when none is open), with no bundle file written

#### Scenario: View-mode switcher marks the active view

- **WHEN** the user activates Depth in the sprite toolbar
- **THEN** Depth is marked active, the viewport shows the depth view only,
  and the previously active view is no longer shown

#### Scenario: Unavailable views are disabled

- **WHEN** a sprite document has no render pass yet
- **THEN** the Render view button is disabled with a tooltip explaining
  that the render pass must be baked first, while the toolbar still offers
  no bake or render action — those live in the properties panel

## ADDED Requirements

### Requirement: Sprite editor viewport shows one view at a time

The sprite editor's content area SHALL be a single viewport panel that
fills the remaining editor space between the toolbar and the status bar
(within the center editor region), replacing the side-by-side pass figures.
The viewport SHALL display exactly one of four views at a time, selected by
the toolbar's view-mode switcher:

- **Realtime 3D** — a real-time 3D render of the document's source
  geometry (its primitive or loaded model mesh) lit by a fixed default
  light, drawn from the bake's fixed isometric camera. It SHALL NOT be a
  shading of the baked render pass. It is available when the document has a
  bake source with resolvable geometry.
- **Normals** — the g-buffer world-normal visualization (available when a
  raster bake exists).
- **Depth** — the g-buffer ray-depth visualization (available when a raster
  bake exists).
- **Render** — the path-traced baked render pass (available when a render
  pass exists).

When the active view's data is unavailable (for example after opening a
bundle without provenance or before the first bake), the viewport SHALL
show a placeholder naming what is needed instead of a blank area. View-only
documents SHALL still display their baked passes (Normals, Depth, Render).

#### Scenario: Only one view is displayed

- **WHEN** the user switches a sprite viewport from Normals to Render
- **THEN** only the baked render is displayed — the normals image is not
  shown anywhere in the editor

#### Scenario: Realtime 3D shows live geometry

- **WHEN** the user selects Realtime 3D on a sprite document whose source
  is a primitive or a loaded model
- **THEN** the viewport renders that source's actual mesh in real time
  under a fixed default light from the isometric bake camera, independent
  of any baked pass

#### Scenario: Views before the first bake

- **WHEN** a new sprite document opens and its raster bake has not finished
- **THEN** the viewport shows a placeholder explaining the bake is
  required, and Realtime 3D becomes selectable as soon as the source
  geometry is available

#### Scenario: View-only bundle shows its passes

- **WHEN** the user opens a `.sprite` bundle without provenance
- **THEN** Normals, Depth, and Render remain selectable and display the
  bundle's baked passes, while Realtime 3D is disabled for lack of source
  geometry

### Requirement: Viewport pan and zoom with corner zoom controls

The sprite viewport SHALL support panning and zooming the displayed view.
Zoom controls SHALL overlay one corner of the viewport offering zoom out,
a zoom percentage readout, zoom in, and a fit action (for example
`− 75% + ⤢`). The zoom percentage SHALL be relative to the image's native
pixel size (100% = one image pixel per screen pixel) and SHALL update as
zoom changes. Mouse-wheel zooming SHALL zoom around the cursor position;
dragging SHALL pan; zoom SHALL be clamped to a finite range. The fit action
SHALL restore a zoom and pan that shows the whole image. In the Realtime 3D
view the same controls SHALL zoom and pan the 3D camera's view of the
mesh.

#### Scenario: Corner controls adjust zoom

- **WHEN** the user activates zoom out until the readout shows `75%`
- **THEN** the displayed image shrinks to 75% of its native pixel size and
  the readout shows `75%`

#### Scenario: Wheel zoom centers on the cursor

- **WHEN** the user wheel-zooms in with the cursor over a detail of the
  image
- **THEN** the zoom increases and the point under the cursor stays under
  the cursor

#### Scenario: Dragging pans

- **WHEN** the user drags inside the viewport
- **THEN** the displayed view follows the drag, including beyond the panel
  edges

#### Scenario: Fit restores the whole image

- **WHEN** the user has zoomed and panned away from the image and activates
  fit
- **THEN** the whole image is visible inside the viewport again

#### Scenario: Realtime view zooms its camera

- **WHEN** the user zooms or pans while the Realtime 3D view is active
- **THEN** the mesh's rendered view zooms and pans accordingly, and the
  isometric viewing direction is unchanged

### Requirement: Sprite viewport state is per-document in-memory

The sprite viewport's view mode, zoom, and pan SHALL be held per sprite
document in memory. Switching to another tab and back SHALL restore the
view exactly as left, without re-baking. This state SHALL NOT be written
into saved bundles; reopening a sprite SHALL start at the default view
(fit zoom, first available view).

#### Scenario: View survives a tab round trip

- **WHEN** the user sets a sprite tab to the Depth view at 150% zoom,
  switches to a world tab, and switches back
- **THEN** the sprite tab shows the Depth view at 150% zoom immediately,
  with no new bake run

#### Scenario: View state is not saved into bundles

- **WHEN** the user saves a sprite document viewed at 400% zoom and reopens
  it later
- **THEN** the reopened sprite starts at the default view, not 400%
