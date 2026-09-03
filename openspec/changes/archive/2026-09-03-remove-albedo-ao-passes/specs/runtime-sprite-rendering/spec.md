## MODIFIED Requirements

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
