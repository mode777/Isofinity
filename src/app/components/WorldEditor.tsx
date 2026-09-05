import { useEffect, useMemo, useRef, useState } from 'react';
import { DataUtils } from 'three';
import {
  SCREEN_UP,
  VIEW_DIR,
  groundToScreen,
  screenToGround,
} from '../../shared/iso.js';
import { RUNTIME_PPU, layersToSet } from '../../runtime/assets.js';
import { Renderer, type FlatBatch } from '../../runtime/renderer.js';
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
  setHeightLevel,
  setSurfaceSnap,
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

// Projected headroom above the grid (world units of stacking) so the fit
// view reveals raised sprites; taller stacks pan into view.
const HEADROOM_UNITS = 4;

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
const maxV = HEADROOM_UNITS * SCREEN_UP[1];

// The fixed "world image": every placement, the ground and the overlays
// are projected into this pixel space once (the bake's isometric camera,
// unchanged). Zoom/pan is a 2D view transform over it.
const CANVAS_W = Math.ceil((maxU - minU) * PPU) + MARGIN * 2;
const CANVAS_H = Math.ceil((maxV - minV) * PPU) + MARGIN * 2;
const ORIGIN_X = -minU * PPU + MARGIN;
const ORIGIN_Y = maxV * PPU + MARGIN;

function toPx(x: number, z: number, y = 0): [number, number] {
  const [u, v] = groundToScreen(x, z);
  // World +Y projects exactly onto screen-up; height is a pure vertical
  // pixel shift of the same projected image.
  return [ORIGIN_X + u * PPU, ORIGIN_Y - (v + y * SCREEN_UP[1]) * PPU];
}

/** Heights at or below this count as ground level (no gizmo/shadow). */
const GROUND_EPSILON = 0.005;
/** Shadow ellipse segments (a ground-plane circle, projected). */
const SHADOW_SEGMENTS = 24;

/**
 * Growable triangle-vertex batch for the flat program (x, y, r, g, b, a
 * per vertex). Reused across frames to avoid per-frame allocations.
 */
class FlatBatchBuilder {
  data = new Float32Array(2048 * 6);
  verts = 0;

  reset(): void {
    this.verts = 0;
  }

  vert(x: number, y: number, c: [number, number, number], a: number): void {
    if ((this.verts + 1) * 6 > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const o = this.verts * 6;
    this.data[o] = x;
    this.data[o + 1] = y;
    this.data[o + 2] = c[0];
    this.data[o + 3] = c[1];
    this.data[o + 4] = c[2];
    this.data[o + 5] = a;
    this.verts++;
  }

  quad(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    dx: number, dy: number,
    c: [number, number, number],
    a: number,
  ): void {
    this.vert(ax, ay, c, a);
    this.vert(bx, by, c, a);
    this.vert(cx, cy, c, a);
    this.vert(ax, ay, c, a);
    this.vert(cx, cy, c, a);
    this.vert(dx, dy, c, a);
  }

  batch(): FlatBatch | null {
    return this.verts > 0 ? { data: this.data, verts: this.verts } : null;
  }
}

function buildGround(): Float32Array {
  const ground = new Float32Array(GRID_N * GRID_N * 6 * 6);
  let o = 0;
  const push = (x: number, z: number, c: [number, number, number]) => {
    const [px, py] = toPx(x, z);
    ground[o++] = px;
    ground[o++] = py;
    ground[o++] = c[0];
    ground[o++] = c[1];
    ground[o++] = c[2];
    ground[o++] = 1;
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
  // Cursor in world-image pixels plus its ground projection; the pixel
  // coordinates drive the surface-snap unprojection.
  const hoverRef = useRef<{ px: [number, number]; ground: [number, number] } | null>(
    null,
  );
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
    const shadowBatch = new FlatBatchBuilder();
    const overlayBatch = new FlatBatchBuilder();

    // Draws a soft contact-shadow ellipse on the ground under a raised
    // object: larger and fainter as the height grows, none at ground
    // level. A ground-plane circle projects to the correct isometric
    // ellipse through toPx.
    const emitShadow = (x: number, y: number, z: number): void => {
      if (y <= GROUND_EPSILON) return;
      const alpha = 0.34 / (1 + 0.45 * y);
      const r = Math.min(0.55, 0.34 + 0.05 * y);
      const cx = x + 0.5;
      const cz = z + 0.5;
      const [ccx, ccy] = toPx(cx, cz);
      const BLACK: [number, number, number] = [0, 0, 0];
      let prev: [number, number] | null = null;
      for (let i = 0; i <= SHADOW_SEGMENTS; i++) {
        const t = (i / SHADOW_SEGMENTS) * Math.PI * 2;
        const [px, py] = toPx(cx + r * Math.cos(t), cz + r * Math.sin(t));
        if (prev !== null) {
          shadowBatch.vert(ccx, ccy, BLACK, alpha);
          shadowBatch.vert(prev[0], prev[1], BLACK, alpha);
          shadowBatch.vert(px, py, BLACK, alpha);
        }
        prev = [px, py];
      }
    };

    // The height gizmo for a raised ghost: landing diamond at the raised
    // footprint, plumb line down to the ground cell, and a small marker
    // on the ground cell itself.
    const emitGizmo = (x: number, y: number, z: number): void => {
      const [ax, ay] = toPx(x, z, y);
      const [bx, by] = toPx(x + 1, z, y);
      const [cx, cy] = toPx(x + 1, z + 1, y);
      const [dx, dy] = toPx(x, z + 1, y);
      overlayBatch.quad(ax, ay, bx, by, cx, cy, dx, dy, HIGHLIGHT_COLOR, 0.3);
      const [gcx, gcy] = toPx(x + 0.5, z + 0.5);
      const [tcx, tcy] = toPx(x + 0.5, z + 0.5, y);
      const w = 1;
      overlayBatch.quad(gcx - w, gcy, gcx + w, gcy, tcx + w, tcy, tcx - w, tcy, HIGHLIGHT_COLOR, 0.85);
      const m = 6;
      overlayBatch.quad(gcx, gcy - m, gcx + m, gcy, gcx, gcy + m, gcx - m, gcy, HIGHLIGHT_COLOR, 0.5);
    };

    /**
     * The effective placement height at the cursor: the brush height
     * level, or — when surface snap is on — the height of the visible
     * surface under the cursor, unprojected CPU-side from the world
     * document's in-memory g-buffers (max composite depth among the
     * covering placements, then `y = v·SCREEN_UP[1] + d·VIEW_DIR[1]`).
     * Empty ground or nothing covered = ground level.
     */
    const effectiveHeight = (live: WorldDocument, wx: number, wy: number): number => {
      if (!live.surfaceSnap) return live.heightLevel;
      // Surface point = u·SCREEN_RIGHT + v·SCREEN_UP + d·VIEW_DIR; its y
      // component only involves v and d (SCREEN_RIGHT[1] is 0).
      const v = -(wy - ORIGIN_Y) / PPU;
      let best = -Infinity;
      for (const p of live.world.list()) {
        const li = live.layers.findIndex((l) => l.id === p.primId);
        if (li < 0) continue;
        const layer = live.layers[li];
        const scale = PPU / spriteSet.ppus[li];
        const [ox, oy] = spriteSet.origins[li];
        const [w, h] = spriteSet.sizes[li];
        const [bx, by] = (() => {
          const [cx, cy] = toPx(p.x, p.z, p.y);
          return [cx - ox * scale, cy - oy * scale];
        })();
        const tx = Math.floor((wx - bx) / scale);
        const ty = Math.floor((wy - by) / scale);
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const o = (ty * w + tx) * 4;
        const nx = DataUtils.fromHalfFloat(layer.gbuffer[o]);
        const ny = DataUtils.fromHalfFloat(layer.gbuffer[o + 1]);
        const nz = DataUtils.fromHalfFloat(layer.gbuffer[o + 2]);
        if (nx * nx + ny * ny + nz * nz === 0) continue;
        const d =
          DataUtils.fromHalfFloat(layer.gbuffer[o + 3]) +
          VIEW_DIR[0] * p.x +
          VIEW_DIR[1] * p.y +
          VIEW_DIR[2] * p.z;
        if (d > best) best = d;
      }
      if (!Number.isFinite(best)) return 0;
      return Math.max(0, v * SCREEN_UP[1] + best * VIEW_DIR[1]);
    };

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
      // centered at the effective height, exactly what placeAt will do)
      // as a depth-tested sprite.
      const brushIndex =
        live.tool && live.tool !== 'eraser'
          ? live.layers.findIndex((l) => l.id === live.tool)
          : -1;
      const ghost =
        hover && brushIndex >= 0
          ? (() => {
              const x = hover.ground[0] - 0.5;
              const z = hover.ground[1] - 0.5;
              const y = effectiveHeight(live, hover.px[0], hover.px[1]);
              return { layer: brushIndex, x, y, z, key: depthOf(x, y, z) };
            })()
          : null;

      const total = placed.length + (ghost ? 1 : 0);
      if (instances.length < total * 8) {
        instances = new Float32Array(total * 8);
      }
      let count = 0;
      const emit = (layerIndex: number, x: number, y: number, z: number): void => {
        const scale = PPU / spriteSet.ppus[layerIndex];
        const [ox, oy] = spriteSet.origins[layerIndex];
        const [w, h] = spriteSet.sizes[layerIndex];
        const [cx, cy] = toPx(x, z, y);
        instances[count * 8] = cx - ox * scale;
        instances[count * 8 + 1] = cy - oy * scale;
        instances[count * 8 + 2] = layerIndex;
        instances[count * 8 + 3] =
          VIEW_DIR[0] * x + VIEW_DIR[1] * y + VIEW_DIR[2] * z;
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
          emit(ghost.layer, ghost.x, ghost.y, ghost.z);
          ghostDone = true;
        }
        const layerIndex = live.layers.findIndex((l) => l.id === p.primId);
        if (layerIndex < 0) continue;
        emit(layerIndex, p.x, p.y, p.z);
      }
      if (ghost && !ghostDone) emit(ghost.layer, ghost.x, ghost.y, ghost.z);

      // Contact shadows: under every raised placement and a raised ghost,
      // drawn between the ground and the sprites.
      shadowBatch.reset();
      for (const p of placed) emitShadow(p.x, p.y, p.z);
      if (ghost) emitShadow(ghost.x, ghost.y, ghost.z);

      // Overlays: the height gizmo for a raised ghost, else the eraser's
      // unit-cell hover highlight.
      overlayBatch.reset();
      if (ghost && ghost.y > GROUND_EPSILON) {
        emitGizmo(ghost.x, ghost.y, ghost.z);
      } else if (hover && !ghost && live.tool === 'eraser') {
        const [gx, gz] = hover.ground;
        const [ax, ay] = toPx(gx - 0.5, gz - 0.5);
        const [bx, by] = toPx(gx + 0.5, gz - 0.5);
        const [cx, cy] = toPx(gx + 0.5, gz + 0.5);
        const [dx, dy] = toPx(gx - 0.5, gz + 0.5);
        overlayBatch.quad(ax, ay, bx, by, cx, cy, dx, dy, HIGHLIGHT_COLOR, 0.35);
      }

      renderer.render(
        instances,
        count,
        shadowBatch.batch(),
        overlayBatch.batch(),
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
    // frame is drawn with, so picking is zoom/pan invariant. The
    // world-image pixel is kept for the surface-snap unprojection.
    const pointerPoint = (
      e: PointerEvent,
    ): { px: [number, number]; ground: [number, number] } | null => {
      const t = liveRef.current.transform;
      if (!t) return null;
      const rect = canvas.getBoundingClientRect();
      const wx = (e.clientX - rect.left - t.panX) / t.zoom;
      const wy = (e.clientY - rect.top - t.panY) / t.zoom;
      const [gx, gz] = screenToGround((wx - ORIGIN_X) / PPU, -(wy - ORIGIN_Y) / PPU);
      return { px: [wx, wy], ground: [gx, gz] };
    };

    // Reads the live document and computes the height the next placement
    // at the cursor would land at (brush level, or the snapped surface).
    const hoverPlacementHeight = (px: [number, number]): number => {
      const live = useEditor.getState().docs[doc.docId];
      if (!live || live.kind !== 'world') return 0;
      return effectiveHeight(live, px[0], px[1]);
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
          const pt = pointerPoint(e);
          if (!pt) return;
          hoverRef.current = pt;
          placeAt(doc.docId, pt.ground[0], pt.ground[1], hoverPlacementHeight(pt.px));
        }
        return;
      }
      const pt = pointerPoint(e);
      if (!pt) return;
      hoverRef.current = pt;
      if (e.buttons & 1) {
        placeAt(doc.docId, pt.ground[0], pt.ground[1], hoverPlacementHeight(pt.px));
      }
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
      const pt = pointerPoint(e);
      if (!pt) return;
      if (e.button === 2) {
        eraseAt(doc.docId, pt.ground[0], pt.ground[1]);
      } else if (e.button === 0) {
        placeAt(doc.docId, pt.ground[0], pt.ground[1], hoverPlacementHeight(pt.px));
      }
    };
    const onUp = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') {
        const tp = touchPts.get(e.pointerId);
        touchEnd(e);
        // Tap-to-place: a lone finger released where it landed.
        if (tp && !tp.moved && touchPts.size === 0) {
          const pt = pointerPoint(e);
          if (!pt) return;
          hoverRef.current = pt;
          placeAt(doc.docId, pt.ground[0], pt.ground[1], hoverPlacementHeight(pt.px));
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

    // Trackpad-native convention: a plain wheel event (two-finger scroll)
    // pans by the scroll delta — the content follows the fingers — while
    // a ctrl-modified wheel (trackpad pinch, ctrl+scroll) zooms around
    // the cursor and a shift-modified wheel adjusts the placement height
    // (some browsers map shift+wheel to the horizontal axis, so both
    // deltas are read). Native listener so preventDefault works.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (e.shiftKey && !e.ctrlKey) {
        const panel = liveRef.current.panel;
        let dy = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2 && panel) dy *= panel.h;
        // Scroll up (negative delta) raises; ~0.25 world units per notch.
        const live = useEditor.getState().docs[doc.docId];
        if (!live || live.kind !== 'world') return;
        setHeightLevel(doc.docId, live.heightLevel - dy * 0.0025);
        return;
      }
      const t = liveRef.current.transform;
      const panel = liveRef.current.panel;
      if (!t || !panel) return;
      if (e.ctrlKey) {
        const rect = canvas.getBoundingClientRect();
        setWorldViewTransform(
          doc.docId,
          zoomAround(
            t,
            e.clientX - rect.left,
            e.clientY - rect.top,
            Math.exp(-e.deltaY * 0.0012),
          ),
        );
        return;
      }
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (e.deltaMode === 2) {
        dx *= panel.w;
        dy *= panel.h;
      }
      setWorldViewTransform(doc.docId, panned(t, -dx, -dy));
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
        <button
          className={doc.surfaceSnap ? 'active' : ''}
          title="Surface snap — placements take their height from the visible surface under the cursor (off: use the shift+wheel height)"
          onClick={() => setSurfaceSnap(doc.docId, !doc.surfaceSnap)}
        >
          Snap
        </button>
        <span className="hint" title="Placement height (shift+wheel adjusts, clamped at the ground)">
          h {doc.heightLevel.toFixed(2)}
          {doc.surfaceSnap ? ' · snap' : ''}
        </span>
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
        {' — shift+scroll sets the placement height, scroll pans, pinch zooms, middle-drag pans'}
      </p>
    </div>
  );
}
