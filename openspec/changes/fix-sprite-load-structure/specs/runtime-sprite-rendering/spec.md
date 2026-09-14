## MODIFIED Requirements

### Requirement: Extra bundle views are placeable per view

When a sprite bundle is loaded into a world document — as a brush or on
world open — each view slot it stores (the north view plus any extra
E/S/W views) SHALL load as a placeable view of the same asset, provided
that view carries its own rendered pass and its decoded g-buffer depth
lies within the manifest's recorded depth range (compared with a small
half-precision epsilon). Depth outside the range — negative depth in
particular, the signature of a view-slot pass baked against a rotated
camera instead of the fixed one — makes the view unplaceable: an extra
view SHALL be skipped with a named status note naming the slot and the
stale-depth cause (a re-bake of the sprite fixes it), while the bundle's
placeable views still load; the north view failing the check SHALL fail
the whole bundle load with a named error, as a missing rendered pass
does. A view without a rendered pass SHALL NOT be placeable: it SHALL be
skipped with a status note while the bundle's placeable views still load
(the same rendered-pass rule a whole bundle follows today). Each view
SHALL keep its own baked sprite size and origin; a `/4` or `/5` bundle
(or any bundle storing only north) SHALL load exactly as today — a
single north-facing view. Resolving an extra view SHALL NOT re-read the
bundle file: the bytes read for the bundle SHALL be read at most once per
load and reused for every view of that asset, so adding a direction never
repeats the file read.

#### Scenario: Multi-view bundle exposes all its directions

- **WHEN** the user picks a sprite whose `/6` bundle stores N, E, S, and W,
  all with render passes and in-range depth
- **THEN** the world document holds all four views of that asset and every
  direction is placeable

#### Scenario: View without a render pass is not placeable

- **WHEN** a bundle's east view has a g-buffer but no rendered pass
- **THEN** east is skipped with a status note and the remaining placeable
  views (at least north) still load

#### Scenario: Stale-depth view is not placeable

- **WHEN** a bundle's east view carries a render pass but its decoded
  g-buffer contains negative depth values (outside the manifest's
  recorded depth range)
- **THEN** east is skipped with a named status note identifying the slot
  and the stale-depth cause, and the remaining placeable views (at least
  north) still load

#### Scenario: Stale-depth north fails the load

- **WHEN** a bundle's north view decodes with depth outside its recorded
  range
- **THEN** the bundle load fails with a named error and no view of that
  asset is placed

#### Scenario: Older bundles stay single-view

- **WHEN** the user picks a `/4` or `/5` bundle as a brush
- **THEN** only the north view loads and no direction control is offered
  for it

#### Scenario: Resolving an extra view does not re-read the bundle

- **WHEN** a multi-view bundle is loaded and a direction other than north is
  later resolved
- **THEN** the bundle file is read at most once for that load and the extra
  view resolves from the already-read bytes

## ADDED Requirements

### Requirement: Sprite layers upload at their own size

Each sprite layer's uploaded texture SHALL be its own baked dimensions, not
a rectangle padded to the largest sprite in the document. Adding a sprite
layer to an open world SHALL NOT rebuild or re-upload any layer already
present, except when the texture allocation must grow to fit the new layer
(a layer exceeding the allocated dimensions or a full slice capacity), which
re-uploads the existing layers once. Placing a large sprite SHALL NOT
increase the texture storage or upload work of any other layer.

#### Scenario: A small layer is not inflated to the largest sprite

- **WHEN** a world holds both a large and a small sprite and the sprite
  textures are (re)built
- **THEN** the small sprite's uploaded layer is its own dimensions and is not
  padded to the large sprite's size

#### Scenario: Adding a layer leaves existing layers untouched

- **WHEN** a new sprite layer is added that fits the current allocation
  (for example by resolving a new direction or acquiring a new brush)
- **THEN** layers already uploaded are not rebuilt or re-uploaded

### Requirement: Decoded-view cache is workspace-scoped

The per-session decoded-view cache SHALL key each entry by a
workspace-scoped identity (the connected workspace plus the file's relative
path) together with the file's size and last-modified time. Loading a
sprite from a second workspace whose relative path matches a cached entry
SHALL decode that workspace's bytes rather than reuse another workspace's
decoded views.

#### Scenario: Switching workspaces does not serve stale views

- **WHEN** the user loads `sprites/tree.sprite` from one workspace, then
  reconnects to a different workspace and loads its own
  `sprites/tree.sprite`
- **THEN** the second load decodes the second workspace's bytes; the first
  workspace's decoded views are not reused

#### Scenario: An unchanged file still reuses its decoded views

- **WHEN** the same workspace file is loaded again in the same session and
  its size and last-modified time are unchanged
- **THEN** its decoded views are reused from the cache with no re-read and no
  re-decode
