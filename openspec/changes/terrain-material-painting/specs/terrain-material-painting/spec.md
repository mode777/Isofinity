## Purpose

Lets world authors paint up to four ground materials onto the world floor
with a soft radius-and-hardness brush, storing per-pixel coverage in a world
splat texture and blending material seams by each material's displacement
height.

## ADDED Requirements

### Requirement: The ground binds up to four material slots

The ground SHALL support up to four material slots, each independently bound
to a `.material` zip from the workspace's `materials/` folder, with one
shared tile scale. Slot 0 SHALL be the default binding. A slot with no
material bound SHALL contribute no coverage and SHALL be reported as a
notice rather than treated as an error. The ground's rendered materials
SHALL be determined by the slot bindings plus the painted coverage, not by a
single selected material.

#### Scenario: Several materials blend on the ground

- **WHEN** the user binds materials to three slots and paints each across
  part of the ground
- **THEN** the ground renders all three materials in the regions where
  their coverage is non-zero

#### Scenario: Rebinding a slot keeps its painted shape

- **WHEN** the user rebinds a slot to a different material zip
- **THEN** the painted coverage for that slot is unchanged and the ground
  re-renders that shape with the new material

#### Scenario: Unbound slot contributes nothing

- **WHEN** a slot has no material bound
- **THEN** that slot contributes no coverage to the blend and the status
  area reports it as unbound

### Requirement: The terrain paint brush paints coverage

The world editor SHALL provide a terrain paint tool whose brush is
cursor-anchored with an adjustable **radius** in world units and an
adjustable **hardness** in [0, 1]. A hardness of 0 SHALL give a fully soft
edge and a hardness of 1 a hard edge. Dragging with the tool active SHALL
paint a continuous stroke along the cursor path, and single clicks SHALL
paint one dab; stroke dabs SHALL be spaced closely enough that a fast drag
leaves no gaps. Painting SHALL affect only the ground plane. The viewport
SHALL show a brush gizmo: an outer ring at the brush radius and an inner
ring at the hardness boundary, drawn over the finished frame.

#### Scenario: Painting a material

- **WHEN** the user selects the terrain paint tool, chooses a material slot,
  and drags the brush across the ground
- **THEN** that slot's coverage increases along the stroke and the ground
  re-renders with that material

#### Scenario: Hardness changes the edge

- **WHEN** the user paints with hardness 0 and then with hardness 1
- **THEN** the first stroke fades gradually from the material to its
  neighbours and the second has a crisp edge

#### Scenario: Painting outside the ground does nothing

- **WHEN** the cursor is outside the ground plane's bounds
- **THEN** the brush neither paints nor extends coverage beyond the plane

#### Scenario: The brush gizmo tracks the cursor

- **WHEN** the terrain paint tool is active and the cursor moves over the
  ground
- **THEN** the outer radius ring and inner hardness ring follow the cursor
  at the current radius and hardness

### Requirement: Painting replaces the previous material

The four coverage values at any ground pixel SHALL form a partition of unity
(their sum is 1). Painting a slot SHALL move the coverage vector toward that
slot's unit basis vector by the brush's per-pixel falloff and opacity, so
painting one material over another replaces it rather than tinting both.
Coverage values SHALL remain normalized after any sequence of strokes.

#### Scenario: Painting over a material replaces it

- **WHEN** the ground is fully covered by material A and the user paints
  material B at full opacity over a region
- **THEN** that region renders material B, not a mix of A and B

#### Scenario: Coverage stays normalized

- **WHEN** the user paints many overlapping strokes with different slots
- **THEN** the four coverage values still sum to 1, with no channel drifting
  above or below the normalized range

### Requirement: Material seams blend by displacement height

Where two or more materials' coverages meet, the ground SHALL use each
material's displacement map, when present, as a per-pixel surface height and
favor the higher material, so the boundary follows surface detail instead of
a straight coverage fade. A material without a displacement map SHALL be
treated as neutral height. Displacement SHALL affect blend weights only; the
ground geometry SHALL remain flat and SHALL NOT be displaced.

#### Scenario: Seam follows displacement detail

- **WHEN** two materials with displacement maps meet with soft coverage
  overlap
- **THEN** the transition between them varies with the displacement detail
  rather than a uniform gradient

#### Scenario: Missing displacement is neutral

- **WHEN** a material has no displacement map
- **THEN** its blend weight follows its painted coverage with no height bias

#### Scenario: Uniform coverage is unaffected

- **WHEN** one slot's coverage is 1 everywhere in a region
- **THEN** that region renders only that material regardless of displacement

### Requirement: Painted coverage persists with the world

The painted coverage SHALL be saved as an image (PNG) beside the world JSON
in the workspace's `worlds/` folder, and referenced from the world file; it
SHALL be restored when that world is loaded. The stored image SHALL encode
the four material coverages in its RGBA channels. When no workspace is
connected, painting SHALL remain session-only and the user SHALL be told it
will not persist. A missing or unreadable coverage image SHALL NOT fail the
load: the ground SHALL fall back to slot 0 covering everything, with a
status notice naming the problem.

#### Scenario: Painted ground round-trips

- **WHEN** the user paints the ground, saves the world, and loads it again
- **THEN** the ground's material coverage is restored

#### Scenario: Missing coverage image falls back

- **WHEN** a world file references a coverage image that is absent or
  unreadable
- **THEN** the world still loads, the ground shows slot 0 everywhere, and
  the status area names the missing image

#### Scenario: No workspace is session-only

- **WHEN** no workspace is connected and the user paints the ground
- **THEN** painting works for the session and the status area notes that it
  will not persist

### Requirement: A paint stroke is undoable

Each paint stroke (from pointer down to pointer up) SHALL be one undoable
edit: undoing it restores the coverage as it was before the stroke, and
redoing it re-applies the painted result. A stroke SHALL affect only the
ground coverage, not placements or other world state.

#### Scenario: Undo a stroke

- **WHEN** the user paints a stroke and then undoes it
- **THEN** the ground coverage returns to its pre-stroke state and the
  material coverage that stroke added is gone

#### Scenario: Redo a stroke

- **WHEN** the user undoes a paint stroke and then redoes it
- **THEN** the painted coverage is applied again

### Requirement: Resizing the ground preserves the painting

When the ground's width or depth changes, the painted coverage SHALL be
resampled to the new extent so the painting keeps its relative position on
the plane, rather than being discarded or clipped.

#### Scenario: Painting survives a resize

- **WHEN** the user paints a region and then resizes the ground
- **THEN** the painted region still appears at the same relative position on
  the resized plane
