# bake-presets — delta

## MODIFIED Requirements

### Requirement: Applying a preset

Picking a preset from the listing SHALL apply it immediately — no separate
apply action SHALL exist. Applying sets the document's sample and bounce
counts and switches the document's environment to the preset's environment —
loading the named HDRI from the workspace's `hdri/` folder, or switching to
the procedural environment — while leaving the document's texture size
unchanged. Applying SHALL change only the document's settings and
environment: it SHALL NOT trigger a render pass, and a render pass already
in flight SHALL be discarded rather than restarted; the passes stay as they
are until the user explicitly re-renders. A preset whose HDRI file is
missing from the workspace, or whose format marker is unknown, SHALL be
rejected with a named error and SHALL leave the document unchanged; a
rejected selection SHALL revert the dropdown to its placeholder instead of
keep showing a preset that is not applied.

#### Scenario: Applying a preset retunes the document

- **WHEN** the user picks a preset in the dropdown that specifies 512 samples
  and an HDRI present in `hdri/`
- **THEN** the document's sample count becomes 512, the named HDRI becomes
  the active environment with the preset's rotation/intensity/exposure/
  saturation, and the properties panel shows those values — applied on
  selection with no separate apply step

#### Scenario: Applying a preset does not render

- **WHEN** the user picks a preset for a document that already has a
  rendered pass
- **THEN** no render pass starts and the existing pass is left unchanged

#### Scenario: Applying a procedural preset

- **WHEN** the user picks a preset recorded with the procedural
  environment while the document currently uses an HDRI
- **THEN** the document switches back to the procedural environment

#### Scenario: Missing HDRI is a named error

- **WHEN** the user picks a preset whose HDRI file is no longer in the
  workspace's `hdri/` folder
- **THEN** the tool reports a named error, the document's settings and
  environment are unchanged, and the dropdown reverts to its placeholder

#### Scenario: Unknown format is rejected

- **WHEN** the user picks a preset file whose format marker is missing or
  unrecognized
- **THEN** the tool reports a named error and the document is unchanged

#### Scenario: Failed selection reverts the dropdown

- **WHEN** a picked preset fails to apply
- **THEN** the dropdown shows the placeholder again, not the failed preset

### Requirement: Preset listing and deletion

While connected, the sprite properties panel SHALL list the `.json` files of
the workspace's `presets/` folder by name, and the listing SHALL be re-read
on demand rather than served from a stale cache after external changes. The
panel SHALL offer a delete action that removes the chosen preset file and
updates the listing. The preset management section — save-as-preset, the
preset listing, delete, and file import — SHALL be the first section of the
sprite properties panel, placed above the source and rendering settings
sections.

#### Scenario: Listing reflects external changes

- **WHEN** a preset file is copied into `presets/` from the operating
  system and the user refreshes the listing
- **THEN** the new preset appears by name

#### Scenario: Deleting a preset

- **WHEN** the user deletes a preset from the listing
- **THEN** the file is removed from `presets/` and disappears from the
  listing

#### Scenario: Presets come before the rendering settings

- **WHEN** a sprite editor tab is active
- **THEN** the Presets section appears at the top of the properties panel,
  above the source, path-trace settings, and environment sections
