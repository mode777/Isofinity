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

/** Drain and report all pending GL errors. */
function glErrors(label: string, gl: WebGL2RenderingContext): void {
  for (let i = 0; i < 8; i++) {
    const err = gl.getError();
    if (err === gl.NO_ERROR) break;
    log(`  [GL] ${label}: 0x${err.toString(16)}`, 'fail');
  }
}

function locations(label: string, renderer: Renderer): void {
  const gl = renderer.context;
  const prog = renderer.meshProgram;
  const attr = (name: string): string => `${name}=${gl.getAttribLocation(prog, name)}`;
  const uni = (name: string): string => {
    const loc = gl.getUniformLocation(prog, name);
    return `${name}=${loc === null ? 'NULL' : 'ok'}`;
  };
  log(
    `  ${label}: attrs ${[attr('aPos'), attr('aNormal'), attr('aWeight'), attr('aJoint')].join(' ')} | ` +
      `unis ${[uni('uPalette[0]'), uni('uOrigin'), uni('uYaw'), uni('uProj'), uni('uRes'), uni('uView')].join(' ')}`,
  );
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

  // Byte-level comparison against the Node reference (ref-dump): if these
  // differ from the Node values, the browser parse itself is the fault.
  const f = (a: Float32Array, n: number): string => [...a.slice(0, n)].map((v) => v.toFixed(4)).join(', ');
  log(`positions[0..8]: ${f(asset.geometry.positions, 9)}`);
  log(`normals[0..8]:   ${f(asset.geometry.normals, 9)}`);
  log(`joints[0..7]:    ${f(asset.geometry.joints, 8)}`);
  log(`weights[0..7]:   ${f(asset.geometry.weights, 8)}`);
  log(`indices[0..11]:  ${[...asset.geometry.indices.slice(0, 12)].join(', ')}`);

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
    locations(stage.label, renderer);
    glErrors('init', renderer.context);
  }

  // Sprite-less frames: the sprite batch is skipped (count 0).
  let last = performance.now();
  let frames = 0;
  const loop = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const { renderer, stage, canvas } of renderers) {
      stage.draw(renderer, canvas, stage.label.includes('animated') || stage.label.includes('textured') ? dt : null);
      if (frames === 1) {
        glErrors(stage.label, renderer.context);
        reportFrame(stage.label, renderer);
      }
    }
    frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  log('All stages rendering. The first row that looks wrong localizes the fault.', 'pass');
}

/** Objective readback analysis: background coverage + distinct colors. */
function reportFrame(label: string, renderer: Renderer): void {
  const canvas = renderer.context.canvas as HTMLCanvasElement;
  const px = new Uint8Array(canvas.width * canvas.height * 4);
  renderer.readPixels(px);
  const bg = px[0];
  let content = 0;
  const colors = new Set<number>();
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    const key = (px[i * 4] << 16) | (px[i * 4 + 1] << 8) | px[i * 4 + 2];
    if (Math.abs(px[i * 4] - bg) + Math.abs(px[i * 4 + 1] - bg) + Math.abs(px[i * 4 + 2] - bg) > 12) content++;
    colors.add(key);
  }
  log(
    `  ${label}: content ${(100 * content / (canvas.width * canvas.height)).toFixed(1)}%, distinct colors ${colors.size}`,
  );
}

void main();
