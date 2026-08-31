# Technical Baseline: Pillars of Eternity Rendering

Source: Obsidian "Update #79: Graphics and Rendering" by Adam Brennecke
(May 2014). The closest public description of the exact architecture
Isofinity targets: pre-rendered scenes carrying depth/normal/albedo data,
lit dynamically in-engine.
https://eternity.obsidian.net/eternity/news/update--79-graphics-and-rendering-

This is our reference model. Anything POE solves here is a problem we will
also hit.

## The bake: four passes per prerendered scene

POE renders each background out of Maya as four layers/passes, then combines
them in-engine (Unity):

1. **Final** — the beauty image (color).
2. **Depth** — per-pixel depth of the prerendered geometry.
3. **Normal** — per-pixel world-space surface normals.
4. **Albedo** — lighting-free base color, for re-lighting.

These passes exist for exactly two purposes: **per-pixel occlusion** of
dynamic objects and **real-time dynamic lighting** over the static scene.

> Isofinity mapping: this is our G-buffer, except baked per *object*
> (position + normal + color per pixel) rather than as one full-screen
> background image. The passes are our albedo + baked world-space position +
> baked normals.

## Scene composition

- Backgrounds are brought in as a flat 2D plane; the whole world looks
  skewed in the editor. The illusion only comes together with an
  **orthographic camera at one fixed angle** — i.e., a fixed-view renderer.
- Raw prerenders are huge (multi-GB); a compression step runs before assets
  enter the game. Budget for a packaging/compression stage in the asset
  pipeline.

## Lighting model

- **Two directional lights** simulate the baked sun per scene:
  - **Key light** — matches the prerendered sun direction/color/intensity;
    driven by the day-night cycle (becomes moonlight at night).
  - **Fill light** — keeps unlit sides from going fully black.
  - Both are tuned per scene to match the prerender's baked light settings
    (direction, mood, atmosphere). The baked image is ground truth; dynamic
    lights conform to it.
- **Dynamic deferred lights** (point lights: torches, spell bursts) light
  the prerendered background plane directly — deferred lights "affect the
  background and characters" alike. This is the core render loop: sample the
  baked position/normal per pixel, shade, composite.
- **Day-night cycle** modulates the key light (and scene tint).

## Grounding tricks (solutions to problems we will face)

- **Sampled ambient ("quick and dirty GI")**: ambient color is sampled from
  the background image, so dynamic objects pick up local environment hues
  (green tint in jungle). Cheap, "great results with little impact on
  rendering performance". Equivalent for us: sample the baked albedo/light
  around an object's foot position.
- **Shadow-blend map**: a low-res control map (a) scales the key-light
  contribution on dynamic objects so they darken inside baked shadow areas,
  and (b) drives the dynamic shadow map value — the same map prevents
  *double shadows*. Equivalent for us: baked per-pixel data can answer
  "is this pixel in baked shadow" directly; still need the anti-double-
  shadow rule.
- **Shadow color matching**: dynamic shadows are tinted to match the baked
  shadow color (often a blue hue), not plain black.

## Materials & shader variants

- Standard material: albedo + **normal map** + **specular map** + **tint
  map** (per-item color customization for armor/hair/skin).
- Variants: **metal** (extra shininess + environment-map reflection),
  **cloth** (no shininess), **emissive** (ignores lighting entirely —
  fires, ghosts, glowing windows).

## Post-processing

- Optional, minimal: e.g. subtle **bloom** applied over environment and
  characters together. Lighting integration does the heavy lifting, not
  post.

## Standing implications for Isofinity

1. Four-pass bake = our asset format: color + world position + normal per
   pixel, per object. Confirmed viable at shipping scale.
2. Fixed orthographic camera is part of the design, not a limitation to
   work around.
3. The baked image is authoritative: dynamic lights are tuned to *match* the
   prerender (key/fill + per-scene settings), not to replace it.
4. Deferred point lights over the baked position/normal data are the core
   loop — POE proves it works on the background; Isofinity extends the same
   treatment to every object sprite.
5. Ambient-sampling and shadow-blend tricks are cheap, proven answers to
   "make dynamic content sit in baked light" — plan for them from day one,
   including the double-shadow and shadow-tint details.
6. Compression of baked data is a pipeline requirement (POE's raw passes
   exceeded gigabytes per scene).
