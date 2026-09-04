# bake-presets Specification

## Purpose

Named bake-setting presets stored in the workspace's `presets/` folder, so a
tuned bake look (sample budget + environment) can be saved from one sprite
document and applied to others across sessions.

## Requirements

### Requirement: Preset files live in the workspace presets folder

Bake-setting presets SHALL be stored as JSON files named `<name>.json` in the
workspace's `presets/` folder, marked `format: "isoinfinity-bake-preset/1"`.
A preset SHALL capture the path-trace sample count and bounce count and the
full environment — a procedural marker, or an HDRI file name plus rotation,
intensity, exposure, and saturation. A preset SHALL NOT capture the texture
size. Saving a preset under a name that already exists SHALL overwrite that
file.

#### Scenario: Saving a preset writes the file

- **WHEN** the user saves the current bake settings as a preset named
  "warm outdoor" while a workspace is connected
- **THEN** `presets/warm outdoor.json` exists in the workspace and holds the
  sample count, bounce count, and the active environment

#### Scenario: Overwrite replaces the old preset

- **WHEN** the user saves a preset with a name that already exists in
  `presets/`
- **THEN** the file is replaced and no duplicate is created

#### Scenario: Texture size stays out of presets

- **WHEN** the user saves a preset from a document with a custom texture
  size, then applies that preset to another document
- **THEN** the preset file contains no texture-size field and the receiving
  document's texture size is unchanged

### Requirement: Saving a preset from a sprite document

The sprite properties panel SHALL offer a save-as-preset action with a
user-supplied name. It SHALL capture the document's current sample count,
bounce count, and environment, and SHALL be unavailable for view-only
documents.

#### Scenario: Save captures the current settings

- **WHEN** a document with an HDRI environment and custom rotation and
  exposure saves a preset
- **THEN** the stored preset names that HDRI and carries those parameter
  values

#### Scenario: View-only documents cannot save presets

- **WHEN** the active sprite document is view-only
- **THEN** the save-as-preset action is disabled

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

### Requirement: Presets degrade gracefully without a workspace

Without a connected workspace, saving a preset SHALL download
`<name>.json`, and applying a preset SHALL accept a preset JSON file through
the file dialog or drag-drop, with the same format validation and named
errors as the workspace path. In browsers without the File System Access
API these fallbacks SHALL be the only preset workflow.

#### Scenario: Saving without a workspace downloads the preset

- **WHEN** the user saves a preset with no workspace connected
- **THEN** the browser downloads a `<name>.json` file carrying the same
  preset content

#### Scenario: Importing a preset file applies it

- **WHEN** the user picks or drops a valid preset JSON file while
  disconnected
- **THEN** it is applied to the document exactly as a workspace-listed
  preset would be

#### Scenario: Unsupported browser keeps the preset workflow

- **WHEN** the editor runs in a browser without the directory-picker API
- **THEN** presets still work through download and file import only
