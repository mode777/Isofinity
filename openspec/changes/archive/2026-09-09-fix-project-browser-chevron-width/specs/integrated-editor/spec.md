## ADDED Requirements

### Requirement: Project browser folder rows fit the panel

In the project browser's directory tree, a folder row SHALL lay out its
expand caret and the folder name side by side within the panel width. The
caret SHALL occupy a compact fixed width; it SHALL NOT stretch to the row
width. The folder name SHALL start immediately to the right of the caret,
remain visible, and truncate with an ellipsis only when the available
panel width is genuinely too narrow for the full name. This SHALL hold at
every nesting depth.

#### Scenario: Folder name stays visible next to the caret

- **WHEN** the project browser shows a folder node at any depth
- **THEN** the folder name is visible to the right of a compact caret
  button, not pushed off the panel edge

#### Scenario: Nested folders still fit

- **WHEN** the user expands several nesting levels in a section of the
  project browser
- **THEN** each level's folder names remain readable within the panel,
  indented per level, truncating only when the name exceeds the space
  left of the panel edge

#### Scenario: Other browser buttons keep full width

- **WHEN** the project browser lists a file entry or other row whose
  button is a direct child of a list item
- **THEN** that button still spans the panel width and truncates with an
  ellipsis as before
