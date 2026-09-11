/**
 * Node-runnable self-check for the world editor's placement picking and
 * placement updates (run via `npm run verify:selection`). Covers the
 * sprite g-buffer silhouette pick (transparent margin, overlap depth,
 * raised placement), mesh/light proximity, and `World` id/update
 * bookkeeping.
 */
import { DataUtils } from 'three';
import type { SpriteSet } from './assets.js';
import { pickPlacementAt, pickSpriteAt } from './selection.js';
import { World } from './world.js';

let failures = 0;
const check = (name: string, ok: boolean): void => {
  if (!ok) {
    failures++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`ok: ${name}`);
  }
};

/** A 2x2 single-layer sprite set; `depths[i]` fills layer i's texel (0,0). */
function makeSet(depths: number[]): SpriteSet {
  const size = 2;
  const layers = depths.map((d) => {
    const g = new Uint16Array(size * size * 4);
    // Texel (0,0): non-zero normal (coverage) + the given baked depth.
    g[0] = DataUtils.toHalfFloat(1);
    g[3] = DataUtils.toHalfFloat(d);
    return g;
  });
  return {
    ids: depths.map((_, i) => `layer${i}`),
    maxW: size,
    maxH: size,
    sizes: depths.map(() => [size, size]),
    origins: depths.map(() => [0, 0]),
    anchors: depths.map(() => [0, 0, 0]),
    ppus: depths.map(() => 1),
    gbufferLayers: layers,
    renderLayers: [],
  };
}

// project maps a world point to a world-image pixel: screen x = world x,
// screen y = world y (height shifts up the screen, like toPx).
const project = (x: number, _z: number, y: number): [number, number] => [x, y];
const PPU = 1;

// --- sprite silhouette ------------------------------------------------------

{
  const set = makeSet([1]);
  const sprites = [{ id: 11, x: 0, y: 0, z: 0, layer: 0 }];

  check('opaque texel is picked', pickSpriteAt(set, sprites, 0, 0, PPU, project)?.id === 11);

  // Texel (1,1) was left empty — its pixels are transparent margin.
  check(
    'transparent margin misses',
    pickSpriteAt(set, sprites, 1.5, 1.5, PPU, project) === null,
  );

  // The raised sprite draws at screen y = height; its ground footprint is
  // at y = 0 and must not select it.
  const raised = [{ id: 12, x: 0, y: 5, z: 0, layer: 0 }];
  check('raised sprite is picked where drawn', pickSpriteAt(set, raised, 0, 5, PPU, project)?.id === 12);
  check('raised sprite misses at its ground footprint', pickSpriteAt(set, raised, 0, 0, PPU, project) === null);
}

// --- overlap resolves to the nearest per-fragment depth ---------------------

{
  const set = makeSet([1, 2]);
  const sprites = [
    { id: 21, x: 0, y: 0, z: 0, layer: 0 },
    { id: 22, x: 0, y: 0, z: 0, layer: 1 },
  ];
  check('overlap picks the nearer depth', pickSpriteAt(set, sprites, 0, 0, PPU, project)?.id === 22);
}

// --- mesh and light proximity ----------------------------------------------

{
  const set = makeSet([1]);
  const meshes = [{ id: 31, x: 0, y: 0, z: 0, height: 2 }];
  const lights = [{ id: 41, x: 0, y: 0, z: 0 }];

  check(
    'mesh column is picked',
    pickPlacementAt(set, [], meshes, [], 0.2, 1, PPU, project)?.kind === 'mesh',
  );
  check(
    'mesh column misses off to the side',
    pickPlacementAt(set, [], meshes, [], 5, 1, PPU, project) === null,
  );
  check(
    'light emitter is picked',
    pickPlacementAt(set, [], [], lights, 0.5, 0, PPU, project)?.kind === 'light',
  );
  const lightHit = pickPlacementAt(set, [], [], lights, 0.5, 0, PPU, project);
  check('light hit carries its id', lightHit?.kind === 'light' && lightHit.id === 41);
}

// --- World id allocation and updates ---------------------------------------

{
  const w = new World();
  const sprite = w.place(0, 0, 'a');
  const meshId = w.placeMesh('character', 1, 1);
  const light = w.placeLight(2, 2, 0, 3, 1, '#ffd9a0');
  check(
    'ids are unique across kinds',
    sprite.id !== meshId && meshId !== light.id && sprite.id !== light.id,
  );

  check('placementAt finds the sprite', w.placementAt(sprite.id) === sprite);
  w.updatePlacement(sprite.id, { x: 10, z: 10 });
  check('updatePlacement moves x/z', sprite.x === 10 && sprite.z === 10);

  w.updatePlacement(sprite.id, { dir: 'e' });
  check('updatePlacement changes facing', sprite.dir === 'e' && sprite.y === 0);

  w.place(20, 20, 'b');
  const sorted = w.list();
  check(
    'list stays sorted by depth key',
    sorted.every((p, i) => i === 0 || sorted[i - 1].key <= p.key),
  );

  w.updateMesh(meshId, { y: 4 });
  check('updateMesh moves height', w.meshAt(meshId)?.y === 4);

  const direct = w.place(0, 0, 'c');
  const removed = w.removeSprite(direct);
  check('removeSprite reports identity + index', removed?.placement === direct);
  w.insertSprite(direct, removed!.index);
  check('insertSprite preserves the id', w.placementAt(direct.id) === direct);

  // Erase/undo round trip for the other kinds (the store's erase command
  // relies on remove-by-id then insert restoring the exact object).
  const meshRemoved = w.removeMeshById(meshId);
  check('removeMeshById reports the placement', meshRemoved?.placement.id === meshId);
  w.insertMesh(meshRemoved!.placement, meshRemoved!.index);
  check('insertMesh restores the mesh', w.meshAt(meshId)?.y === 4);

  const lightRemoved = w.removeLightById(light.id);
  check('removeLightById reports the placement', lightRemoved?.placement.id === light.id);
  w.insertLight(lightRemoved!.placement, lightRemoved!.index);
  check('insertLight restores the light', w.lightAt(light.id) === light);
}

if (failures > 0) {
  throw new Error(`${failures} check(s) failed`);
}
console.log('selection-verify: all checks passed');
