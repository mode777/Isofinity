/**
 * Browser diagnostic for the dynamic-mesh path (`/mesh-debug.html`):
 * renders escalating stages of the pipeline — unskinned cube, CesiumMan
 * bind pose, frozen pose, animated, textured — each on its own canvas, so
 * the first broken stage localizes the fault (attributes vs geometry vs
 * palette upload vs animation vs shading).
 */
import {
  CharacterPlayer,
  bindPosePalette,
  makeCubeMesh,
  parseCharacterAsset,
} from '../runtime/meshAsset.js';
import cesiumManUrl from './assets/CesiumMan.glb?url';
import { meshYawMat, Renderer } from '../runtime/renderer.js';
import { RUNTIME_PPU } from '../runtime/assets.js';

const PPU = RUNTIME_PPU;
// The stages draw their subject at the world origin, which projects to
// exactly (ORIGIN_X, ORIGIN_Y) — the canvas center for 260x400.
const ORIGIN_X = 130;
const ORIGIN_Y = 250;

const out = document.getElementById('out')!;
function log(msg: string, cls?: 'pass' | 'fail'): void {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  out.appendChild(line);
}

interface Stage {
  label: string;
  expectation: string;
  draw: (renderer: Renderer, canvas: HTMLCanvasElement, dt: number | null) => void;
}

async function main(): Promise<void> {
  const asset = await parseCharacterAsset(await (await fetch(cesiumManUrl)).arrayBuffer());
  const cube = makeCubeMesh(0.5);

  const player = new CharacterPlayer(asset);
  player.update(0);
  const frozen = new Float32Array(player.palette);

  const stages: Stage[] = [
    {
      label: '1. unskinned cube (identity palette, white)',
      expectation: 'a clean white cube standing on its ground spot',
      draw: (renderer, canvas) => {
        renderer.setMesh(cube.geometry, { image: null, factor: [0.9, 0.9, 0.9] });
        const off = cube.worldOffset;
        renderer.render(new Float32Array(8), 0, null, null, { zoom: 1, panX: 0, panY: 0 }, [
          {
            palette: bindPosePalette(1),
            origin: [off[0], off[1], off[2]],
            yawMat: meshYawMat(0.5),
          },
        ]);
        void canvas;
      },
    },
    {
      label: '2. CesiumMan bind pose (identity palette, white)',
      expectation: 'a clean standing figure, no texture',
      draw: (renderer) => {
        renderer.setMesh(asset.geometry, { image: null, factor: [0.85, 0.85, 0.85] });
        const off = asset.worldOffset;
        renderer.render(new Float32Array(8), 0, null, null, { zoom: 1, panX: 0, panY: 0 }, [
          {
            palette: bindPosePalette(asset.geometry.jointCount),
            origin: [off[0], off[1], off[2]],
            yawMat: meshYawMat(0),
          },
        ]);
      },
    },
    {
      label: '3. CesiumMan frozen pose (palette at t = 0, white)',
      expectation: 'a clean figure in a walk pose',
      draw: (renderer) => {
        renderer.setMesh(asset.geometry, { image: null, factor: [0.85, 0.85, 0.85] });
        const off = asset.worldOffset;
        renderer.render(new Float32Array(8), 0, null, null, { zoom: 1, panX: 0, panY: 0 }, [
          {
            palette: frozen,
            origin: [off[0], off[1], off[2]],
            yawMat: meshYawMat(0),
          },
        ]);
      },
    },
    {
      label: '4. CesiumMan animated (palette per frame, white)',
      expectation: 'a walking figure',
      draw: (renderer, _canvas, dt) => {
        renderer.setMesh(asset.geometry, { image: null, factor: [0.85, 0.85, 0.85] });
        const off = asset.worldOffset;
        if (dt !== null) player.update(dt);
        renderer.render(new Float32Array(8), 0, null, null, { zoom: 1, panX: 0, panY: 0 }, [
          {
            palette: player.palette,
            origin: [off[0], off[1], off[2]],
            yawMat: meshYawMat(0),
          },
        ]);
      },
    },
    {
      label: '5. CesiumMan textured + SH ambient (the full editor path)',
      expectation: 'the textured, lit walking character',
      draw: (renderer, _canvas, dt) => {
        renderer.setMesh(asset.geometry, asset.surface);
        const off = asset.worldOffset;
        if (dt !== null) player.update(dt);
        renderer.render(new Float32Array(8), 0, null, null, { zoom: 1, panX: 0, panY: 0 }, [
          {
            palette: player.palette,
            origin: [off[0], off[1], off[2]],
            yawMat: meshYawMat(0),
          },
        ]);
      },
    },
  ];

  const rows = document.getElementById('rows')!;
  const renderers: { renderer: Renderer; stage: Stage; canvas: HTMLCanvasElement }[] = [];

  for (const stage of stages) {
    const row = document.createElement('div');
    row.className = 'row';
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 400;
    const caption = document.createElement('div');
    caption.innerHTML = `<b>${stage.label}</b><br>expect: ${stage.expectation}`;
    row.appendChild(canvas);
    row.appendChild(caption);
    rows.appendChild(row);

    const renderer = new Renderer(canvas, [new Uint8Array(4)], [new Uint16Array(4)], 1, 1);
    renderer.setLight({ dir: [0.5, 0.7071, 0.5], key: [1.2, 1.1, 0.9], ambient: [0.35, 0.35, 0.4] });
    renderer.setMeshFrame(ORIGIN_X, ORIGIN_Y, PPU);
    renderer.setShProbe(new Float32Array([
      // The procedural sky projected to radiance-SH (roughly): a bright
      // warm sun above, dim ground — enough to model the figure.
      2.0, 1.9, 1.7,
      0, 0, 0,
      0.8, 0.8, 0.8,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
    ]));
    renderers.push({ renderer, stage, canvas });
  }

  // Sprite-less frames: the sprite batch is skipped (count 0).
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const { renderer, stage, canvas } of renderers) {
      stage.draw(renderer, canvas, stage.label.includes('animated') || stage.label.includes('textured') ? dt : null);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  log('All stages rendering. The first row that looks wrong localizes the fault.', 'pass');
}

void main();
