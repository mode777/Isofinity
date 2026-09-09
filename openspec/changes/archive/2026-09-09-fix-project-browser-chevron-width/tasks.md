## 1. CSS fix

- [x] 1.1 In `src/app/app.css`, change the browser-wide button rule from
      `.browser li button` to `.browser li > button` (keeping the
      `display: block; width: 100%` declarations and a brief comment on the
      direct-child intent) and verify the project browser folder rows now
      render caret + name side by side per the spec.

## 2. Verification

- [x] 2.1 Run `npm run build` and confirm it passes (typecheck + build).
- [ ] 2.2 Browser check (`npm run dev` → project browser with a workspace
      containing nested `sprites/`/`models/`/`worlds/` folders): folder
      names are visible next to a compact caret at every nesting depth,
      file rows still span the panel width and truncate with ellipsis, and
      the workspace file dialog tree still lays out correctly.
