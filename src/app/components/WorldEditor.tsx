import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SCREEN_UP,
  VIEW_DIR,
  groundToScreen,
  screenToGround,
} from '../../shared/iso.js';
import { RUNTIME_PPU, layersToSet } from '../../runtime/assets.js';
import { Renderer } from '../../runtime/renderer.js';
import { depthOf } from '../../runtime/world.js';
import { PRIMITIVE_KINDS } from '../document.js';
import type { ViewTransform, WorldDocument } from '../document.js';
import { fitTransform, panned, ZOOM_STEP, zoomAround } from '../bakeView.js';
import { lightParams } from '../light.js';
import {
  eraseAt,
  placeAt,
  saveWorld,
  selectBrush,
  setTool,
  setWorldViewTransform,
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

// The fixed "world image": every placement, the ground and the overlays
// are projected into this pixel space once (the bake's isometric camera,
// unchanged). Zoom/pan is a 2D view transform over it.
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<[number, number] | null>(null);
  const [panel, setPanel] = useState<{ w: number; h: number } | null>(null);

  // Latest resolved transform for the native listeners and the rAF loop
  // (avoids re-binding per frame).
  const liveRef = useRef({
    transform: null as ViewTransform | null,
    panel: null as { w: number; h: number } | null,
  });

  // Stable unless the document's layers change (place-in-world, load).
  const spriteSet = useMemo(() => layersToSet(doc.layers), [doc.layers]);

  // Zoom/pan: the document's stored transform, else the default fit (the
  // whole grid letterboxed in the panel).
  const transform: ViewTransform | null = useMemo(() => {
    if (doc.viewTransform) return doc.viewTransform;
    if (!panel) return null;
    return fitTransform(CANVAS_W, CANVAS_H, panel.w, panel.h);
  }, [doc.viewTransform, panel]);
  liveRef.current = { transform, panel };

  // Track the panel size; the backing store follows it × devicePixelRatio.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setPanel({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
      const panel = liveRef.current.panel;
      if (!panel) return;
      const dpr = window.devicePixelRatio || 1;
      const bw = Math.max(1, Math.round(panel.w * dpr));
      const bh = Math.max(1, Math.round(panel.h * dpr));
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;

      const t = live.viewTransform ?? fitTransform(CANVAS_W, CANVAS_H, panel.w, panel.h);
      renderer.setLight(lightParams(live.light));

      const placed = live.world.list();
      const hover = hoverRef.current;
      // The ghost preview: when a brush with a loaded layer is active and
      // the cursor is over the canvas, preview the placement (cursor-
      // centered, exactly what placeAt will do) as a depth-tested sprite.
      const brushIndex =
        live.tool && live.tool !== 'eraser'
          ? live.layers.findIndex((l) => l.id === live.tool)
          : -1;
      const ghost =
        hover && brushIndex >= 0
          ? {
              layer: brushIndex,
              x: hover[0] - 0.5,
              z: hover[1] - 0.5,
              key: depthOf(hover[0] - 0.5, hover[1] - 0.5),
            }
          : null;

      const total = placed.length + (ghost ? 1 : 0);
      if (instances.length < total * 8) {
        instances = new Float32Array(total * 8);
      }
      let count = 0;
      const emit = (layerIndex: number, x: number, z: number): void => {
        const scale = PPU / spriteSet.ppus[layerIndex];
        const [ox, oy] = spriteSet.origins[layerIndex];
        const [w, h] = spriteSet.sizes[layerIndex];
        const [cx, cy] = toPx(x, z);
        instances[count * 8] = cx - ox * scale;
        instances[count * 8 + 1] = cy - oy * scale;
        instances[count * 8 + 2] = layerIndex;
        instances[count * 8 + 3] = VIEW_DIR[0] * x + VIEW_DIR[2] * z;
        instances[count * 8 + 4] = w * scale;
        instances[count * 8 + 5] = h * scale;
        instances[count * 8 + 6] = w;
        instances[count * 8 + 7] = h;
        count++;
      };
      // Placements arrive far → near; the ghost slots in at its depth key
      // so the per-pixel occlusion solves exactly as if it were placed.
      let ghostDone = false;
      for (const p of placed) {
        if (ghost && !ghostDone && p.key >= ghost.key) {
          emit(ghost.layer, ghost.x, ghost.z);
          ghostDone = true;
        }
        const layerIndex = live.layers.findIndex((l) => l.id === p.primId);
        if (layerIndex < 0) continue;
        emit(layerIndex, p.x, p.z);
      }
      if (ghost && !ghostDone) emit(ghost.layer, ghost.x, ghost.z);

      // Hover feedback: the unit-cell highlight only for the eraser —
      // a brush hover shows the ghost instead, no tool shows nothing.
      let highlight: Float32Array | null = null;
      if (hover && !ghost && live.tool === 'eraser') {
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

      renderer.render(
        instances,
        count,
        highlight,
        { zoom: t.zoom * dpr, panX: t.panX * dpr, panY: t.panY * dpr },
      );
    };

    let raf = 0;
    const loop = (): void => {
      renderFrame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Panel px → world-image px → ground. Inverts the same transform the
    // frame is drawn with, so picking is zoom/pan invariant.
    const pointerGround = (e: PointerEvent): [number, number] => {
      const t = liveRef.current.transform;
      if (!t) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      const wx = (e.clientX - rect.left - t.panX) / t.zoom;
      const wy = (e.clientY - rect.top - t.panY) / t.zoom;
      return screenToGround((wx - ORIGIN_X) / PPU, -(wy - ORIGIN_Y) / PPU);
    };

    // Middle-drag pans (left paints, right erases); capture keeps the
    // drag alive outside the canvas.
    let pan: { x: number; y: number; zoom: number; panX: number; panY: number } | null = null;

    // Touch state machine: 1 finger = left button (drag paints, release
    // without movement taps), 2 fingers = neutral pre-gesture, 3 fingers
    // = pan by centroid from the transform captured at gesture start.
    const touchPts = new Map<
      number,
      { x: number; y: number; sx: number; sy: number; moved: boolean }
    >();
    let touchPan: { cx: number; cy: number; t: ViewTransform } | null = null;
    const touchCentroid = (): [number, number] => {
      let x = 0;
      let y = 0;
      for (const p of touchPts.values()) {
        x += p.x;
        y += p.y;
      }
      return [x / touchPts.size, y / touchPts.size];
    };
    const touchEnd = (e: PointerEvent): void => {
      touchPts.delete(e.pointerId);
      if (touchPts.size < 3) touchPan = null;
    };

    const onMove = (e: PointerEvent): void => {
      if (pan) {
        setWorldViewTransform(
          doc.docId,
          panned(
            { zoom: pan.zoom, panX: pan.panX, panY: pan.panY },
            e.clientX - pan.x,
            e.clientY - pan.y,
          ),
        );
        return;
      }
      const tp = e.pointerType === 'touch' ? touchPts.get(e.pointerId) : undefined;
      if (tp) {
        tp.x = e.clientX;
        tp.y = e.clientY;
        if (!tp.moved && (Math.abs(tp.x - tp.sx) > 5 || Math.abs(tp.y - tp.sy) > 5)) {
          tp.moved = true;
        }
        if (touchPts.size >= 3) {
          if (touchPan) {
            const [cx, cy] = touchCentroid();
            setWorldViewTransform(doc.docId, panned(touchPan.t, cx - touchPan.cx, cy - touchPan.cy));
          }
          return;
        }
        if (touchPts.size === 1) {
          hoverRef.current = pointerGround(e);
          placeAt(doc.docId, hoverRef.current[0], hoverRef.current[1]);
        }
        return;
      }
      hoverRef.current = pointerGround(e);
      if (e.buttons & 1) placeAt(doc.docId, hoverRef.current[0], hoverRef.current[1]);
    };
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') {
        // No placement on down: a pan gesture must be able to land all
        // three fingers without dropping sprites.
        e.preventDefault();
        touchPts.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
          sx: e.clientX,
          sy: e.clientY,
          moved: false,
        });
        canvas.setPointerCapture(e.pointerId);
        if (touchPts.size === 3) {
          const [cx, cy] = touchCentroid();
          const t = liveRef.current.transform;
          touchPan = t ? { cx, cy, t } : null;
        }
        return;
      }
      if (e.button === 1) {
        e.preventDefault();
        const t = liveRef.current.transform;
        if (t) {
          pan = { x: e.clientX, y: e.clientY, zoom: t.zoom, panX: t.panX, panY: t.panY };
          canvas.setPointerCapture(e.pointerId);
        }
        return;
      }
      const [gx, gz] = pointerGround(e);
      if (e.button === 2) eraseAt(doc.docId, gx, gz);
      else if (e.button === 0) placeAt(doc.docId, gx, gz);
    };
    const onUp = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') {
        const tp = touchPts.get(e.pointerId);
        touchEnd(e);
        // Tap-to-place: a lone finger released where it landed.
        if (tp && !tp.moved && touchPts.size === 0) {
          hoverRef.current = pointerGround(e);
          placeAt(doc.docId, hoverRef.current[0], hoverRef.current[1]);
        }
        return;
      }
      if (e.button === 1 && pan) {
        pan = null;
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      }
    };
    const onCancel = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') touchEnd(e);
    };
    const onLeave = (): void => {
      hoverRef.current = null;
    };
    const onContext = (e: Event): void => e.preventDefault();

    // Wheel zooms around the cursor; zoomAround keeps that world point
    // under it. Native listener so preventDefault works.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const t = liveRef.current.transform;
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      const next = zoomAround(
        t,
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.0012),
      );
      setWorldViewTransform(doc.docId, next);
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
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

  const zoomBy = (factor: number): void => {
    const { transform, panel } = liveRef.current;
    if (!transform || !panel) return;
    // Anchor at the panel center.
    setWorldViewTransform(
      doc.docId,
      zoomAround(transform, panel.w / 2, panel.h / 2, factor),
    );
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
      <div className="world-viewport" ref={viewportRef}>
        <canvas ref={canvasRef} />
        <div className="zoom-controls">
          <button title="Zoom out" disabled={!transform} onClick={() => zoomBy(1 / ZOOM_STEP)}>
            −
          </button>
          <span className="zoom-value">
            {transform ? `${Math.round(transform.zoom * 100)}%` : '—'}
          </span>
          <button title="Zoom in" disabled={!transform} onClick={() => zoomBy(ZOOM_STEP)}>
            +
          </button>
          <button
            title="Fit the view to the panel"
            disabled={!doc.viewTransform}
            onClick={() => setWorldViewTransform(doc.docId, null)}
          >
            Fit
          </button>
        </div>
      </div>
      <p className="hint">
        {activeTool === 'eraser'
          ? 'tool: eraser — left-click/drag erases'
          : activeTool === ''
            ? 'pick a brush above — left-click/drag places it, right-click erases'
            : `tool: ${activeTool} — left-click/drag places, right-click erases`}
        {' — wheel zooms, middle-drag pans'}
      </p>
    </div>
  );
}
