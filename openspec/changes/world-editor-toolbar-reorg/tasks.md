# Tasks: World editor toolbar reorganization

## 1. Icons and styles

- [x] 1.1 Create `src/app/components/icons.tsx` with inline-SVG icon
      components (`IconSave`, `IconUndo`, `IconRedo`, `IconSelect`,
      `IconPencil`, `IconLight`, `IconEraser`), `currentColor` glyphs sized
      for ~16px buttons; verify `npm run build` typechecks the module.
- [x] 1.2 Add toolbar/tool-bar CSS to `src/app/app.css`: `.icon-btn`
      (square, centered glyph), `.toolbar-separator` or group wrapper, and
      `.tool-bar` (absolute overlay inside `.world-viewport`, left edge,
      `.zoom-controls`-style floating panel, vertical flex, ~2rem wide,
      ~1.75rem buttons, active-tool highlight); verify the styles compile
      into the dev build.

## 2. Full-bleed world editor

- [x] 2.1 In `src/app/App.tsx` render `center center-viewport` for world
      docs too (comment: the class means "viewport editor, full-bleed",
      shared by bake and world tabs); verify with `npm run dev` that the
      world editor reaches the center region's edges with only the
      `.world-editor` inset.
- [x] 2.2 Tighten `.world-editor` padding/gap and `.editor-toolbar`
      padding/margin/gap per design D5; verify visually that the toolbar is
      a single compact row and the viewport dominates the panel, and that
      the sprite editor is unchanged.

## 3. Toolbar rework

- [x] 3.1 In `WorldEditor.tsx` replace the Save/Undo/Redo text buttons with
      `.icon-btn` icon buttons (same `onClick`/`disabled` logic, tooltips
      keep names + shortcuts); verify save dialog, undo/redo, and disabled
      states still work in the browser.
- [x] 3.2 Add the global-vs-contextual separator and move the brush
      `<select>` and Snap toggle into a contextual group rendered only when
      `doc.tool` is a placement tool (not `select`/`eraser`/`point-light`;
      includes the initial no-brush state), keeping the existing
      focus-blur and store actions; verify the dropdown groups and snap
      behavior are unchanged while visible.
- [x] 3.3 Verify contextual state survival: with snap on and a brush
      chosen, switch to eraser and back — snap still on, same brush chosen
      (`doc.tool`/`doc.brush`/`doc.surfaceSnap` store fields untouched).

## 4. Vertical tool bar

- [x] 4.1 Add the tool bar to `WorldEditor.tsx` inside `.world-viewport`:
      four icon buttons (Select, Pencil, Light, Eraser) wired to the
      existing `setTool` calls (pencil via `lastBrush`), active highlight
      from `doc.tool`, tooltips carrying the old button titles; verify each
      tool activates with its previous semantics.
- [x] 4.2 Verify the bar does not capture canvas input: place/erase/pick
      and pan/zoom behave identically with the bar present, clicks on the
      bar never place or pan, and the active-tool hint text still tracks
      the tool.

## 5. Docs and gates

- [x] 5.1 Update `docs/runtime.md` (world editor toolbar description →
      icon buttons + viewport tool bar + contextual controls) and add the
      done-entry to `docs/roadmap.md`; verify statements match the shipped
      UI.
- [x] 5.2 Run `npm run build` (typecheck + production build) and
      `openspec validate world-editor-toolbar-reorg --strict`; leave the
      visual browser pass to the user (no bake/runtime code touched, so
      `verify:bundles`/`verify:mesh`/`verify:selection` are unaffected).
