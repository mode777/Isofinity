# Isofinity

A 2D renderer for 2D pre-rendered graphics with dynamic lighting.

Isofinity is designed to render pre-rendered isometric sprites and tilesets
while applying real-time dynamic lighting on top of them.

## Goals

- Render pre-rendered 2D/isometric graphics
- Dynamic lighting composited over static pre-rendered assets
- High performance batched rendering

## Status

Early inception — API and architecture under active design. The bake tool
and runtime editor live in one integrated React editor (`index.html`,
`src/app/`): open or create sprite assets and worlds from the project
browser, bake passes with a GPU path tracer, and place sprites into
dynamically lit isometric worlds.

## Documentation

- `docs/bake-pipeline.md` — bake conventions and the sprite bundle format
- `docs/runtime.md` — integrated editor, document model, world rendering
- `docs/poe-rendering-baseline.md` — the Pillars of Eternity rendering
  architecture this project designs against
- `docs/glossary.md` — vocabulary · `docs/recipes.md` — feature
  touchpoints · `docs/roadmap.md` — done/planned
- `docs/decisions/` — architecture decision records

## License

TBD
