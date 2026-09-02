## Purpose

Saving and restoring runtime world scenes — sprite placements and light
state — as versioned JSON files in the workspace's `worlds/` folder, so a
built scene survives sessions and can be shared as a file.

## ADDED Requirements

### Requirement: Save the current world into the workspace

While a workspace is connected, the runtime editor SHALL offer a world save
control that writes the current scene to `worlds/<name>.json`: every placed
sprite (its asset id and ground position) plus the full light state (key
azimuth/elevation, intensity, key and ambient colors, dynamic-light switch,
and sun-position inputs). The file SHALL be plain JSON carrying a format
marker (`isoinfinity-world/1`) so the layout can evolve. The user SHALL be
able to name the world, with a sensible default offered; saving over an
existing name SHALL replace that file. With no workspace connected the
save control SHALL be unavailable (or disabled).

#### Scenario: Saving writes a complete scene file

- **WHEN** the user names a world and saves it while connected
- **THEN** `worlds/<name>.json` exists in the workspace and contains every
  placement and the light state as it was on screen

#### Scenario: Saving again with the same name replaces the file

- **WHEN** the user saves a second world under a name that already exists
- **THEN** `worlds/<name>.json` reflects the latest save and no duplicate
  file is created

### Requirement: Load a world from the workspace

While connected, the runtime editor SHALL list the `worlds/` folder's JSON
files and let the user load one. Loading SHALL clear the current scene and
restore the saved placements and light state exactly. Placements whose
sprite asset is not currently loaded SHALL be skipped, with the status area
naming the skipped asset ids while the rest of the scene loads. A file that
fails to parse SHALL produce a named error and leave the current scene
unchanged.

#### Scenario: Round trip restores the scene

- **WHEN** the user loads a world they previously saved
- **THEN** the same sprites stand at the same ground positions and the
  light controls show the saved values

#### Scenario: Missing assets are skipped, not fatal

- **WHEN** a world file references a sprite asset id that is not loaded
- **THEN** those placements are skipped, the status area names the missing
  asset ids, and every remaining placement is restored

#### Scenario: Corrupt world file is rejected without side effects

- **WHEN** the user picks a file that fails to parse as a world
- **THEN** the status area names the error and the current scene is
  unchanged
