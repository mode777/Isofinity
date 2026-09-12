## ADDED Requirements

### Requirement: Editor toolbars use icon buttons with tooltips

The bake editor's and world editor's main toolbars SHALL use icon-only
buttons (inline SVG glyphs) with a tooltip describing each action, in a
shared visual style; the bake editor toolbar SHALL NOT use text buttons
for actions that exist as icons. The bake toolbar SHALL offer, as icon
buttons: save, save as, render pass, bake all views, remove the active
view, and place in world — each keeping its existing enable/disable
conditions and existing action. The world toolbar SHALL offer save and
save as as icon buttons, and its surface-snap toggle SHALL be an icon
button that keeps the active-state highlight while snap is on and its
existing tooltip. Tooltips remain the discoverable name of every icon
action.

#### Scenario: Bake toolbar shows icons, not text

- **WHEN** a bake editor document is open
- **THEN** its toolbar shows icon buttons for save, save as, render pass,
  bake all, remove view, and place in world, each with a tooltip naming
  the action

#### Scenario: Save As is available in both editors

- **WHEN** the bake editor or world editor toolbar is shown
- **THEN** it contains a save-as icon button next to the plain save
  button, and activating it opens the workspace save dialog (or the
  no-workspace fallback) instead of saving in place

#### Scenario: Snap toggle renders as an icon with active state

- **WHEN** the world editor's placement mode is active and surface snap is
  toggled on
- **THEN** the snap control renders as an icon button in the highlighted
  active state, and toggling it off removes the highlight

#### Scenario: Disabled icon buttons keep their conditions

- **WHEN** a bake document has no baked result
- **THEN** its save and save-as icon buttons are disabled, exactly as the
  previous text buttons were
