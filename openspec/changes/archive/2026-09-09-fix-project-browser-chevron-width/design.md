## Context

The project browser tree (`src/app/components/ProjectBrowser.tsx`,
`DirNodeView`) renders folder rows as a `.dirtree-dir` flex div holding a
`.dirtree-caret` button (fixed `width: 1.2rem`, `flex: none`) and a
`.dirtree-name` button (`flex: 1; min-width: 0`). The shared tree CSS also
serves the workspace file dialog's `DirTree` (`src/app/components/fileTree.tsx`).

The bug is a specificity conflict in `src/app/app.css`: the browser-wide rule
`.browser li button { display: block; width: 100% }` (line 246,
specificity 0,1,2) beats `.dirtree-caret` (0,1,0), so the caret button takes
the full row width and the flex row pushes the name out of the panel. See
proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Caret returns to its compact fixed width in the project browser tree.
- Other browser rows (file entries etc.) keep their full-width,
  ellipsis-truncating behavior.

**Non-Goals:**
- No markup or component changes; no file-dialog-specific rework.

## Decisions

- **Restrict the browser rule to direct children: `.browser li > button`.**
  Tree caret and name buttons live inside a `.dirtree-dir` wrapper div, so
  they are no longer matched; every other browser row button is a direct
  child of its `li` and keeps `width: 100%`. This fixes the root cause
  (an over-broad selector) instead of patching specificity afterwards.
  - Alternative considered: raising `.dirtree-caret` specificity (e.g.
    `button.dirtree-caret`). Rejected — it leaves the over-broad rule in
    place and invites the same conflict for future tree row elements.
  - Alternative considered: removing `width: 100%` and using flex on the
    row instead. Rejected — larger blast radius across all browser lists.
- No change to `.dirtree-caret` itself; its 1.2rem width incl. padding is
  already compact.

## Risks / Trade-offs

- [A browser row button is later nested in a wrapper div and loses full
  width] → Mitigation: the rule change is one selector; verify the browser's
  file rows still span the panel width (spec scenario covers it).
- [File dialog caret regression] → Mitigation: none needed; the file
  dialog's `.dirtree` rows use the same wrapper structure, and its root
  caret is a `span` untouched by `li button` rules.

## Migration Plan

Single CSS edit; deploy is the normal Pages build. Rollback = revert the
commit. No data, format, or API impact.

## Open Questions

None.
