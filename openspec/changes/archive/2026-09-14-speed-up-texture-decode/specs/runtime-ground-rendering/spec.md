## ADDED Requirements

### Requirement: Decoded ground-material maps are cached for the session

When a ground material is loaded from the workspace, its decoded maps SHALL
be retained in a session cache keyed by a workspace-scoped identity (the
connected workspace plus the file's relative path) together with the file's
size and last-modified time. Re-applying the same material, or re-opening a
world that binds it in the same session, SHALL reuse the decoded maps rather
than re-parse and re-decode the archive. A material whose file size or
last-modified time changed SHALL be re-decoded, and a same-named material
from a different workspace SHALL be decoded independently. The cache SHALL
be in-memory engine state only — never written into worlds, materials, or any
persisted format (ADR 0006).

#### Scenario: Re-opening a world reuses decoded maps

- **WHEN** a world whose ground binds a material is opened, closed, and
  re-opened in the same session
- **THEN** the material's maps are served from the session cache and are not
  re-parsed or re-decoded

#### Scenario: A changed material re-decodes

- **WHEN** the material file's size or last-modified time changes between
  loads
- **THEN** the material is re-read and re-decoded

#### Scenario: Workspace-scoped

- **WHEN** the user loads `<name>.material` from one workspace and then loads
  the same-named material from a different workspace
- **THEN** the second load decodes the second workspace's archive rather than
  reusing the first
