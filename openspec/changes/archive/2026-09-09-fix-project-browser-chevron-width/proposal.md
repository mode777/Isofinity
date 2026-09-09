## Why

In the project browser's left list view, a folder row's expand chevron button
grows to the full row width, pushing the folder name off the right edge of
the panel — nested folders become unreadable. The cause is a CSS
specificity conflict: `.browser li button { width: 100% }`
(`src/app/app.css:246`) overrides `.dirtree-caret { width: 1.2rem }`
(`src/app/app.css:549`) because it has higher specificity, so the caret
button stretches instead of staying small.

## What Changes

- Scope the project browser's full-width button rule so it no longer applies
  to the directory-tree caret and name buttons inside `.dirtree` rows
  (they are nested in a `.dirtree-dir` div, so restricting the rule to
  direct children `li > button` fixes the caret without affecting other
  browser buttons).
- Keep the caret at its compact fixed width so the folder name starts
  immediately right of it and truncates with ellipsis only when the panel
  is genuinely too narrow.
- No markup changes, no behavior changes to expansion, selection, or the
  shared `DirTree` used by the workspace file dialog (whose own caret is
  not affected but benefits from the same rule staying correct).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `integrated-editor`: add a requirement that project browser folder rows
  lay out the expand caret and folder name side by side within the panel
  width — the caret occupies a compact fixed width and the folder name
  stays visible (truncating with ellipsis only when necessary), for all
  nesting depths.

## Impact

- `src/app/app.css` only (one selector change, possibly a clarifying
  comment). No TypeScript changes, no format-version impact, no bundle
  tolerance impact.
- Docs: no bake/runtime/glossary/roadmap impact; no ADR needed (pure CSS
  bug fix, no durable architectural decision).
- Verify via `npm run build` and a manual browser check
  (`npm run dev` → project browser with nested folders).

## Non-goals

- No redesign of the project browser or the directory-tree components.
- No changes to the workspace file dialog beyond inheriting the shared
  tree CSS.
- No new features (renaming, context menus, indentation guides).
