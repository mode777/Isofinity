# world-persistence Specification

## Purpose
Saving and restoring runtime world scenes — sprite/light placements, ground
material state, and painted ground coverage — as versioned JSON files (plus a
coverage PNG sidecar) in the workspace's `worlds/` folder, so a built scene
survives sessions and can be shared as a file.

## Requirements

### Requirement: Save the current world into the workspace

While a workspace is connected, the runtime editor SHALL offer a world save
control that writes the current scene to `worlds/<name>.json`: every placed
sprite (its asset id, ground position, height, and direction), every point
light placement (its ground position, height, radius, energy, and color),
plus the full light state (key azimuth/elevation, intensity, key and ambient
colors, dynamic-light switch, and sun-position inputs). The file SHALL be
plain JSON carrying a format marker (`isoinfinity-world/8`) so the layout
can evolve; each placement's height SHALL be optional in the file (a
ground-level placement may omit it), and each sprite placement's direction
SHALL be optional (a north-facing placement may omit it). The file SHALL
also record the ground state: up to four ground material slot bindings (each
a material file name; omitted when no slot is bound), the ground tile scale
(optional — omitted at the default scale), the ground plane's width and
depth in world units (optional — omitted at the default 12 × 12), the
painted coverage descriptor (the coverage image's file name and its texels
per world unit; omitted when nothing is painted), and the world's selected
HDRI file name (optional — omitted when the environment is inherited from
sprite bake provenance). When coverage is recorded, the save SHALL also
write the coverage image as a PNG beside the JSON in `worlds/`. The user
SHALL be able to name the world, with a sensible default offered; saving
over an existing name SHALL replace that file. With no workspace connected
the save control SHALL be unavailable (or disabled).

#### Scenario: Saving writes a complete scene file

- **WHEN** the user names a world and saves it while connected
- **THEN** `worlds/<name>.json` exists in the workspace and contains every
  placement — asset id, ground position, height, and direction — every
  point light with its position, radius, energy, and color, plus the light
  state as it was on screen

#### Scenario: Raised placements keep their height

- **WHEN** the user saves a world containing a placement above ground level
- **THEN** the saved file records that placement's height, and a
  ground-level placement may omit the height field

#### Scenario: Directions survive saving

- **WHEN** the user saves a world containing placements facing east, south,
  or west
- **THEN** the saved file records each placement's direction, and a
  north-facing placement may omit the direction field

#### Scenario: Saving again with the same name replaces the file

- **WHEN** the user saves a second world under a name that already exists
- **THEN** `worlds/<name>.json` reflects the latest save and no duplicate
  file is created

#### Scenario: Ground state survives saving

- **WHEN** the user saves a world whose ground has bound material slots, a
  non-default tile scale, and a user-selected HDRI
- **THEN** the saved file records the material slot bindings, the tile scale,
  and the HDRI file name

#### Scenario: Ground size survives saving

- **WHEN** the user saves a world whose ground plane is 24 × 8
- **THEN** the saved file records the ground width and depth, and a world
  at the default 12 × 12 may omit them

#### Scenario: Painted ground saves its coverage image

- **WHEN** the user saves a world whose ground has painted coverage
- **THEN** the saved JSON records the coverage descriptor and a PNG of the
  coverage is written beside the JSON in `worlds/`

### Requirement: Load a world from the workspace

While connected, the runtime editor SHALL list the `worlds/` folder's JSON
files and let the user load one. Loading SHALL clear the current scene and
restore the saved placements — including each placement's height and
direction — every point light placement (position, radius, energy, color),
and light state exactly. The parser SHALL accept `isoinfinity-world/1`
through `isoinfinity-world/8` files: a `/1` placement, or a `/2` placement
without a height field, SHALL restore at ground level; a stored height SHALL
be rejected as malformed unless it is a finite number. A placement without
a direction field SHALL restore facing north; a stored direction SHALL
be rejected as malformed unless it names a view slot (`n`, `e`, `s`, or `w`).
Point light entries SHALL be accepted from `/6` files (older files carry
none and load unchanged); a light entry whose position, radius, or energy
is not a finite number, or whose color is malformed, SHALL be rejected as
malformed. Ground state SHALL restore when present in a `/4` (or newer)
file: a `/7` or earlier file's single material SHALL restore as slot 0; a
`/8` file's material slot bindings SHALL restore into their slots. Each
material SHALL be resolved against the workspace's `materials/` folder — a
material that cannot be resolved or parsed SHALL be skipped with a
status notice while the rest of the scene loads — and the tile scale,
ground size, and HDRI SHALL restore when present and valid; a ground size
that is not a pair of finite positive numbers SHALL be rejected as
malformed. A `/8` file's painted coverage SHALL be restored from its
coverage image beside the JSON; a missing or unreadable coverage image SHALL
NOT fail the load — the ground SHALL fall back to slot 0 covering everything
with a status notice naming it — and a coverage descriptor that is not a
valid file name / positive texels-per-unit pair SHALL be rejected as
malformed. Files without a ground size (`/6` and older) SHALL restore the
ground at the default 12 × 12.
Placements whose sprite asset is not currently loaded SHALL be skipped,
with the status area naming the skipped asset ids while the rest of the
scene loads; a skipped asset's loadable directions SHALL still restore for
its loadable placements. A file that fails to parse SHALL produce a named
error and leave the current scene unchanged.

#### Scenario: Round trip restores the scene

- **WHEN** the user loads a world they previously saved
- **THEN** the same sprites stand at the same ground positions, heights, and
  directions, the same point lights stand with the same radius, energy, and
  color, and the light controls show the saved values

#### Scenario: Older world files still load

- **WHEN** the user loads an `isoinfinity-world/1` file
- **THEN** every placement restores at ground level facing north, no point
  lights are created, and the rest of the scene loads exactly as before

#### Scenario: Missing height defaults to ground

- **WHEN** the user loads an `isoinfinity-world/2` file in which a
  placement omits the height field
- **THEN** that placement restores at ground level

#### Scenario: Missing direction defaults to north

- **WHEN** the user loads an `isoinfinity-world/2` file, or a `/3` file in
  which a placement omits the direction field
- **THEN** that placement restores facing north

#### Scenario: Lights round-trip through /6

- **WHEN** the user loads a `/6` world they previously saved with point
  lights
- **THEN** every light restores at its saved position with its saved
  radius, energy, and color

#### Scenario: Malformed light entry is rejected as malformed

- **WHEN** a `/6` file contains a point light whose radius is not a finite
  number
- **THEN** the file is rejected as malformed, the status area names the
  error, and the current scene is unchanged

#### Scenario: Ground state round-trips

- **WHEN** the user loads a `/8` world they previously saved with bound
  material slots, a tile scale, and an HDRI
- **THEN** the ground re-renders with those materials and tile scale and the
  environment uses the saved HDRI

#### Scenario: A /7 material restores as slot 0

- **WHEN** the user loads a `/7` world whose single ground material is a
  valid material in `materials/`
- **THEN** that material restores in slot 0 and the ground renders as before

#### Scenario: Painted coverage round-trips

- **WHEN** the user loads a `/8` world they previously saved with painted
  ground coverage
- **THEN** the ground's material coverage is restored from the coverage
  image beside the JSON

#### Scenario: Missing coverage image falls back with a notice

- **WHEN** the user loads a `/8` world whose coverage image is absent or
  unreadable
- **THEN** the world still loads, the ground shows slot 0 covering
  everything, and the status area names the missing image

#### Scenario: Ground size round-trips and defaults for older files

- **WHEN** the user loads a `/7` world saved at 24 × 8 and then a `/6`
  world with no ground size
- **THEN** the first world's ground plane spans 24 × 8 and the second
  restores at the default 12 × 12

#### Scenario: Malformed ground size is rejected as malformed

- **WHEN** a `/7` file records a ground size whose width is not a finite
  positive number
- **THEN** the file is rejected as malformed, the status area names the
  error, and the current scene is unchanged

#### Scenario: Malformed coverage descriptor is rejected as malformed

- **WHEN** a `/8` file records a coverage descriptor whose texels-per-unit
  is not a finite positive number
- **THEN** the file is rejected as malformed, the status area names the
  error, and the current scene is unchanged

#### Scenario: Unresolvable ground material is skipped, not fatal

- **WHEN** a loaded world file names a ground material missing from
  `materials/`
- **THEN** the status area names the missing material, the ground falls
  back to its default state, and the rest of the scene loads

#### Scenario: Missing assets are skipped, not fatal

- **WHEN** a world file references a sprite asset id that is not loaded
- **THEN** those placements are skipped, the status area names the missing
  asset ids, and every remaining placement is restored

#### Scenario: Corrupt world file is rejected without side effects

- **WHEN** the user picks a file that fails to parse as a world (including
  a placement whose height is not a finite number or whose direction is not
  a view slot)
- **THEN** the status area names the error and the current scene is
  unchanged
