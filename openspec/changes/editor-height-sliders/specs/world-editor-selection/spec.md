## MODIFIED Requirements

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
−2 to +2 world units, adjusting the same placement height. Dragging the slider
SHALL apply the dragged value continuously within the band, with each applied
step recorded through the same edit path as a numeric commit. The slider SHALL
be a pointer shortcut only: it SHALL NOT clamp the placement's stored height,
a value outside the band SHALL keep its exact value with the slider thumb
parked at the nearer end, and dragging the thumb from that end SHALL pull the
height back into the band.

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

- **WHEN** the user drags the slider next to a selected sprite's height field
- **THEN** the sprite's height follows the dragged value between −2 and +2
  live, the move renders as it drags, and undo returns the sprite to its
  pre-drag height

#### Scenario: Slider adjusts a selected character's height

- **WHEN** the user drags the slider next to a selected character's height
  field
- **THEN** the character's height follows the dragged value between −2 and +2
  live, and undo returns it to its pre-drag height

#### Scenario: Slider adjusts a selected light's height

- **WHEN** the user drags the slider next to a selected point light's height
  field
- **THEN** the light's emitter height follows the dragged value between −2
  and +2 live, its rendered contribution moves with it, and undo returns it
  to its pre-drag height

#### Scenario: Typed value outside the slider band stays exact

- **WHEN** a selected sprite stands at height 5 and the user looks at its
  height row
- **THEN** the height field shows exactly 5 and the slider thumb sits parked
  at its +2 end; typing `-3` into the field still applies exactly −3 with
  the thumb parked at the −2 end
