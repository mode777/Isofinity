## ADDED Requirements

### Requirement: Sprite viewport bounding-box overlay

The sprite viewport SHALL offer a toggleable bounding-box overlay that
draws, on top of the active view:

- the projected edges of the asset box — the bake box the sprite was
  framed from, from the world origin `(0,0,0)` to the baked box extent;
- the world-origin marker at the sprite pixel the world origin projects
  to (the anchor world placement uses);
- the three world-axis lines (X, Y, Z) emanating from the origin, each
  distinguishable by axis.

The overlay SHALL be available in all four views — Realtime 3D, Normals,
Depth, and Render — drawing the same box semantics from the same document
data, so the box lines up with the baked passes' fixed isometric frame. It
SHALL be drawn from data the document already holds (baked box extent,
pixels-per-unit, origin pixel, fixed camera), so live bakes and opened
bundles — including view-only bundles — show it alike. The overlay SHALL
track the view's zoom and pan (it is anchored to image pixels, not the
panel). The toggle SHALL be a control in the viewport's view controls,
its state kept per sprite document in memory — persisting across view
switches and tab switches, not saved into sprite bundles.

#### Scenario: Toggle shows and hides the overlay

- **WHEN** the user activates the box toggle in the view controls
- **THEN** the box edges, origin marker, and axis lines appear over the
  active view, and deactivating the toggle removes them

#### Scenario: Overlay is consistent across views

- **WHEN** the user toggles the overlay on and switches from Render to
  Realtime 3D to Depth
- **THEN** every view shows the same projected box, origin marker, and
  axes aligned with the isometric frame, with no re-toggling needed

#### Scenario: Overlay on an opened view-only bundle

- **WHEN** the user opens a sprite bundle without provenance (view-only)
  and toggles the overlay on
- **THEN** the box, origin marker, and axes are drawn from the bundle's
  recorded box and origin pixel, aligned with its baked passes

#### Scenario: Overlay tracks zoom and pan

- **WHEN** the user zooms or pans the viewport with the overlay shown
- **THEN** the overlay stays anchored to the same image pixels, moving and
  scaling with the image

#### Scenario: Toggle state is per document

- **WHEN** the user enables the overlay on one sprite tab and switches to
  another sprite tab
- **THEN** each tab's viewport reflects its own overlay state, and
  switching back restores the first tab's enabled overlay
