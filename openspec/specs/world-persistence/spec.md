# world-persistence Specification

## Purpose
Saving and restoring runtime world scenes — sprite placements and light
state — as versioned JSON files in the workspace's `worlds/` folder, so a
built scene survives sessions and can be shared as a file.

## Requirements

### Requirement: Save the current world into the workspace

While a workspace is connected, the runtime editor SHALL offer a world save
control that writes the current scene to `worlds/<name>.json`: every placed
sprite (its asset id, ground position, height, and direction) plus the full
light state (key azimuth/elevation, intensity, key and ambient colors,
dynamic-light switch, and sun-position inputs). The file SHALL be plain JSON
carrying a format marker (`isoinfinity-world/3`) so the layout can evolve;
each placement's height SHALL be optional in the file (a ground-level
placement may omit it), and each placement's direction SHALL be optional (a
north-facing placement may omit it). The user SHALL be able to name the
world, with a sensible default offered; saving over an existing name SHALL
replace that file. With no workspace connected the save control SHALL be
unavailable (or disabled).

#### Scenario: Saving writes a complete scene file

- **WHEN** the user names a world and saves it while connected
- **THEN** `worlds/<name>.json` exists in the workspace and contains every
  placement — asset id, ground position, height, and direction — plus the
  light state as it was on screen

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

### Requirement: Load a world from the workspace

While connected, the runtime editor SHALL list the `worlds/` folder's JSON
files and let the user load one. Loading SHALL clear the current scene and
restore the saved placements — including each placement's height and
direction — and light state exactly. The parser SHALL accept
`isoinfinity-world/1`, `isoinfinity-world/2`, and `isoinfinity-world/3`
files: a `/1` placement, or a `/2` placement without a height field, SHALL
restore at ground level; a stored height SHALL be rejected as malformed
unless it is a finite number. A placement without a direction field SHALL
restore facing north; a stored direction SHALL be rejected as malformed
unless it names a view slot (`n`, `e`, `s`, or `w`). Placements whose sprite
asset is not currently loaded SHALL be skipped, with the status area naming
the skipped asset ids while the rest of the scene loads; a skipped asset's
loadable directions SHALL still restore for its loadable placements. A file
that fails to parse SHALL produce a named error and leave the current scene
unchanged.

#### Scenario: Round trip restores the scene

- **WHEN** the user loads a world they previously saved
- **THEN** the same sprites stand at the same ground positions, heights, and
  directions, and the light controls show the saved values

#### Scenario: Older world files still load

- **WHEN** the user loads an `isoinfinity-world/1` file
- **THEN** every placement restores at ground level facing north and the
  rest of the scene loads exactly as before

#### Scenario: Missing height defaults to ground

- **WHEN** the user loads an `isoinfinity-world/2` file in which a
  placement omits the height field
- **THEN** that placement restores at ground level

#### Scenario: Missing direction defaults to north

- **WHEN** the user loads an `isoinfinity-world/2` file, or a `/3` file in
  which a placement omits the direction field
- **THEN** that placement restores facing north

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
