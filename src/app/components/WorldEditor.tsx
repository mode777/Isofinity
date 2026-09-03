import { useEffect, useMemo, useRef } from 'react';
import {
  SCREEN_UP,
  VIEW_DIR,
  groundToScreen,
  screenToGround,
} from '../../shared/iso.js';
import { RUNTIME_PPU, layersToSet } from '../../runtime/assets.js';
import { Renderer } from '../../runtime/renderer.js';
import { PRIMITIVE_KINDS } from '../document.js';
import type { WorldDocument } from '../document.js';
import { lightParams } from '../light.js';
import {
  eraseAt,
  placeAt,
  saveWorld,
  selectBrush,
  setTool,
  suggestWorldName,
} from '../store/world.js';
import { useEditor } from '../store/editor.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import { EditorToolbar } from './EditorToolbar.js';

const MARGIN = 8;
const GRID_N = 12;

const GRID_COLORS: [number, number, number] = [0.145, 0.153, 0.173];
const GRID_COLORS_ALT: [number, number, number] = [0.169, 0.178, 0.2];
const HIGHLIGHT_COLOR: [number, number, number] = [0.55, 0.62, 0.75];

const PPU = RUNTIME_PPU;

const minU = Math.min(
  ...[[0, 0], [GRID_N, 0], [0, GRID_N], [GRID_N, GRID_N]].map(
    ([x, z]) => groundToScreen(x, z)[0],
  ),
);
const maxU = Math.max(
  ...[[0, 0], [GRID_N, 0], [0, GRID_N], [GRID_N, GRID_N]].map(
    ([x, z]) => groundToScreen(x, z)[0],
  ),
);
const minV = Math.min(
  ...[[0, 0], [GRID_N, 0], [0, GRID_N], [GRID_N, GRID_N]].map(
    ([x, z]) => groundToScreen(x, z)[1],
  ),
);
const maxV = SCREEN_UP[1];

const CANVAS_W = Math.ceil((maxU - minU) * PPU) + MARGIN * 2;
const CANVAS_H = Math.ceil((maxV - minV) * PPU) + MARGIN * 2;
const ORIGIN_X = -minU * PPU + MARGIN;
const ORIGIN_Y = maxV * PPU + MARGIN;

function toPx(x: number, z: number): [number, number] {
  const [u, v] = groundToScreen(x, z);
  return [ORIGIN_X + u * PPU, ORIGIN_Y - v * PPU];
}

function buildGround(): Float32Array {
  const ground = new Float32Array(GRID_N * GRID_N * 6 * 5);
  let o = 0;
  const push = (x: number, z: number, c: [number, number, number]) => {
    const [px, py] = toPx(x, z);
    ground[o++] = px;
    ground[o++] = py;
    ground[o++] = c[0];
    ground[o++] = c[1];
    ground[o++] = c[2];
  };
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const c = (i + j) % 2 === 0 ? GRID_COLORS : GRID_COLORS_ALT;
      push(i, j, c);
      push(i + 1, j, c);
      push(i + 1, j + 1, c);
      push(i, j, c);
      push(i + 1, j + 1, c);
      push(i, j + 1, c);
    }
  }
  return ground;
}

const GROUND = buildGround();

export function WorldEditor(props: { doc: WorldDocument }): React.JSX.Element {
  const { doc } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<[number, number] | null>(null);

  // Stable unless the document's layers change (place-in-world, load).
  const spriteSet = useMemo(() => layersToSet(doc.layers), [doc.layers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    let renderer: Renderer;
    try {
      const hasLayers = doc.layers.length > 0;
      renderer = new Renderer(
        canvas,
        hasLayers ? spriteSet.renderLayers : [new Uint8Array(4)],
        hasLayers ? spriteSet.gbufferLayers : [new Uint16Array(4)],
        hasLayers ? spriteSet.maxW : 1,
        hasLayers ? spriteSet.maxH : 1,
      );
    } catch (err) {
      useEditor
        .getState()
        .setStatus(`Renderer init failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    renderer.setGround(GROUND);

    let instances = new Float32Array(256 * 8);
    const highlightData = new Float32Array(6 * 5);

    const renderFrame = (): void => {
      // Read the live document every frame; the rAF loop never stale-locks.
      const live = useEditor.getState().docs[doc.docId];
      if (!live || live.kind !== 'world') return;
      renderer.setLight(lightParams(live.light));

      const placed = live.world.list();
      if (instances.length < placed.length * 8) {
        instances = new Float32Array(placed.length * 8);
      }
      let count = 0;
      for (const p of placed) {
        const layerIndex = live.layers.findIndex((l) => l.id === p.primId);
        if (layerIndex < 0) continue;
        const scale = PPU / spriteSet.ppus[layerIndex];
        const [ox, oy] = spriteSet.origins[layerIndex];
        const [w, h] = spriteSet.sizes[layerIndex];
        const [cx, cy] = toPx(p.x, p.z);
        instances[count * 8] = cx - ox * scale;
        instances[count * 8 + 1] = cy - oy * scale;
        instances[count * 8 + 2] = layerIndex;
        instances[count * 8 + 3] = VIEW_DIR[0] * p.x + VIEW_DIR[2] * p.z;
        instances[count * 8 + 4] = w * scale;
        instances[count * 8 + 5] = h * scale;
        instances[count * 8 + 6] = w;
        instances[count * 8 + 7] = h;
        count++;
      }

      let highlight: Float32Array | null = null;
      const hover = hoverRef.current;
      if (hover) {
        const [gx, gz] = hover;
        highlight = highlightData;
        let o = 0;
        const push = (x: number, z: number) => {
          const [px, py] = toPx(x, z);
          highlight![o++] = px;
          highlight![o++] = py;
          highlight![o++] = HIGHLIGHT_COLOR[0];
          highlight![o++] = HIGHLIGHT_COLOR[1];
          highlight![o++] = HIGHLIGHT_COLOR[2];
        };
        push(gx - 0.5, gz - 0.5);
        push(gx + 0.5, gz - 0.5);
        push(gx + 0.5, gz + 0.5);
        push(gx - 0.5, gz - 0.5);
        push(gx + 0.5, gz + 0.5);
        push(gx - 0.5, gz + 0.5);
      }

      renderer.render(instances, count, highlight);
    };

    let raf = 0;
    const loop = (): void => {
      renderFrame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const pointerGround = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
      return screenToGround((px - ORIGIN_X) / PPU, -(py - ORIGIN_Y) / PPU);
    };
    const onMove = (e: PointerEvent): void => {
      hoverRef.current = pointerGround(e);
      if (e.buttons & 1) placeAt(doc.docId, hoverRef.current[0], hoverRef.current[1]);
    };
    const onDown = (e: PointerEvent): void => {
      const [gx, gz] = pointerGround(e);
      if (e.button === 2) eraseAt(doc.docId, gx, gz);
      else if (e.button === 0) placeAt(doc.docId, gx, gz);
    };
    const onLeave = (): void => {
      hoverRef.current = null;
    };
    const onContext = (e: Event): void => e.preventDefault();

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onContext);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onContext);
      renderer.dispose();
    };
    // spriteSet identity changes only when the document's layers change,
    // which re-uploads the sprite texture arrays.
  }, [doc.docId, spriteSet]);

  const connected = useWorkspace((s) => s.state.kind) === 'connected';
  const sprites = useProject((s) => s.sprites);
  const worlds = useProject((s) => s.worlds);
  const setStatus = useEditor((s) => s.setStatus);
  const activeTool = doc.tool;

  // Remembers the last pencil brush so the pencil button can switch back
  // from the eraser.
  const lastBrush = useRef(activeTool === 'eraser' ? '' : activeTool);

  const brushEntries = useMemo(() => {
    const primitives = PRIMITIVE_KINDS.map((p) => ({
      value: `p:${p}`,
      label: p,
      kind: 'primitive' as const,
      brush: { kind: 'primitive' as const, id: p },
    }));
    const spriteEntries = (connected ? sprites : []).map((fileName) => {
      const id = fileName.replace(/\.(sprite|zip)$/i, '');
      return {
        value: `s:${fileName}`,
        label: id,
        kind: 'sprite' as const,
        brush: { kind: 'sprite' as const, id, fileName },
      };
    });
    return [...primitives, ...spriteEntries];
  }, [connected, sprites]);
  const selectedEntry = brushEntries.find((e) => e.label === activeTool);

  const onSaveWorld = (): void => {
    const suggested = doc.ref
      ? doc.ref.title.replace(/\.json$/i, '')
      : suggestWorldName(worlds);
    const raw = window.prompt('Save world as', suggested);
    if (raw === null) return;
    const name = raw.trim();
    if (!name) {
      setStatus('World needs a name');
      return;
    }
    void saveWorld(doc.docId, name);
  };

  return (
    <div className="world-editor">
      <EditorToolbar>
        <button
          disabled={!connected}
          title={
            connected
              ? "Save to the workspace's worlds/ folder"
              : 'Connect a workspace to save the world'
          }
          onClick={onSaveWorld}
        >
          Save
        </button>
        <button
          className={activeTool === 'eraser' ? '' : 'active'}
          title="Placement tool — left-click/drag places the selected brush, right-click erases"
          onClick={() => setTool(doc.docId, lastBrush.current)}
        >
          Pencil
        </button>
        <select
          aria-label="Placement brush"
          title="Placement brush — built-in primitives and workspace sprites"
          value={selectedEntry?.value ?? ''}
          onChange={(e) => {
            const entry = brushEntries.find((b) => b.value === e.target.value);
            if (!entry) return;
            lastBrush.current = entry.label;
            void selectBrush(doc.docId, entry.brush);
          }}
        >
          <option value="">brush…</option>
          <optgroup label="Primitives">
            {brushEntries
              .filter((b) => b.kind === 'primitive')
              .map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
          </optgroup>
          {connected ? (
            <optgroup label="Sprites">
              {brushEntries
                .filter((b) => b.kind === 'sprite')
                .map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
            </optgroup>
          ) : null}
        </select>
        <button
          className={activeTool === 'eraser' ? 'active' : ''}
          title="Eraser — left-click/drag removes placements"
          onClick={() => setTool(doc.docId, 'eraser')}
        >
          Eraser
        </button>
        <span className="hint">
          {activeTool === 'eraser' ? 'eraser' : activeTool === '' ? 'no brush' : activeTool}
        </span>
      </EditorToolbar>
      <canvas ref={canvasRef} />
      <p className="hint">
        {activeTool === 'eraser'
          ? 'tool: eraser — left-click/drag erases'
          : activeTool === ''
            ? 'pick a brush above — left-click/drag places it, right-click erases'
            : `tool: ${activeTool} — left-click/drag places, right-click erases`}
      </p>
    </div>
  );
}
