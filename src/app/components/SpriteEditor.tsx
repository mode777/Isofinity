import { useEffect, useMemo, useRef, useState } from 'react';
import type { BakeDocument, BakeViewMode, ViewTransform } from '../document.js';
import {
  rgbaBytesToCanvas,
  rgbaToCanvas,
} from '../../bake/export.js';
import { depthRange } from '../../bake/iso.js';
import type { Vec3 } from '../../shared/iso.js';
import {
  fitTransform,
  panned,
  resolvedView,
  viewAvailability,
  viewPlaceholder,
  viewUnavailableReason,
  VIEW_MODES,
  ZOOM_STEP,
  zoomAround,
} from '../bakeView.js';
import { placeInWorld } from '../store/world.js';
import {
  saveSprite,
  setBakeView,
  setViewTransform,
  sourcePrimitive,
} from '../store/bake.js';
import { useEditor } from '../store/editor.js';
import { EditorToolbar } from './EditorToolbar.js';
import { RealtimeCanvas } from './RealtimeCanvas.js';

const VIEW_LABELS: Record<BakeViewMode, string> = {
  realtime: 'Realtime 3D',
  normals: 'Normals',
  depth: 'Depth',
  render: 'Render',
};

const REALTIME_FIT: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

export function SpriteEditor(props: { doc: BakeDocument }): React.JSX.Element {
  const { doc } = props;
  const setStatus = useEditor((s) => s.setStatus);
  const view = resolvedView(doc);
  const avail = viewAvailability(doc);

  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLCanvasElement>(null);
  const [panel, setPanel] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    x: number;
    y: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  const onSave = (): void => {
    const raw = window.prompt('Save sprite as', doc.title);
    if (raw === null) return;
    const name = raw.trim();
    if (!name) {
      setStatus('Sprite needs a name');
      return;
    }
    void saveSprite(doc.docId, name);
  };

  // Source geometry for the Realtime 3D view; identity is stable across
  // unrelated document updates (only source/scale change it).
  const prim = useMemo(
    () => sourcePrimitive(doc.docId),
    [doc.docId, doc.source, doc.gltf, doc.scale],
  );

  // The active 2D view's image, rendered once per pass/view change.
  const image = useMemo<HTMLCanvasElement | null>(() => {
    const result = doc.result;
    if (view === 'normals' || view === 'depth') {
      if (!result) return null;
      const isDepth = view === 'depth';
      return rgbaToCanvas(result.gbuffer, result.width, result.height, (r, g, b, a) => {
        const cov = Math.min(1, Math.sqrt(r * r + g * g + b * b));
        if (isDepth) {
          const [lo, hi] = depthRange(result.size as Vec3);
          const t = (a - lo) / (hi - lo);
          return [t, t, t, cov];
        }
        return [r * 0.5 + 0.5, g * 0.5 + 0.5, b * 0.5 + 0.5, cov];
      });
    }
    if (view === 'render') {
      return doc.render
        ? rgbaBytesToCanvas(doc.render.rgba, doc.render.width, doc.render.height)
        : null;
    }
    return null;
  }, [doc.result, doc.render, view]);

  // Zoom/pan: stored state, or the per-view default (fit / identity).
  const transform: ViewTransform | null = useMemo(() => {
    if (view === 'realtime') return doc.viewTransform ?? REALTIME_FIT;
    if (!image || !panel) return null;
    return doc.viewTransform ?? fitTransform(image.width, image.height, panel.w, panel.h);
  }, [view, doc.viewTransform, image, panel]);

  // Latest view state for native listeners (avoids re-binding per frame).
  const liveRef = useRef({ view, transform, panel });
  liveRef.current = { view, transform, panel };

  // Track the panel size; a null transform refits automatically.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setPanel({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Draw the active 2D view honoring the transform. Rendering happens in a
  // panel-sized backing store, so zooming in sharpens instead of scaling up
  // a fixed bitmap.
  useEffect(() => {
    const canvas = imageRef.current;
    if (!canvas || view === 'realtime' || !image || !panel || !transform) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(panel.w * dpr));
    const h = Math.max(1, Math.round(panel.h * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = transform.zoom < 1;
    ctx.clearRect(0, 0, panel.w, panel.h);
    ctx.drawImage(
      image,
      transform.panX,
      transform.panY,
      image.width * transform.zoom,
      image.height * transform.zoom,
    );
  }, [view, image, panel, transform]);

  // Wheel zoom around the cursor (native listener so preventDefault works).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const { transform } = liveRef.current;
      if (!transform) return;
      const rect = el.getBoundingClientRect();
      const next = zoomAround(
        transform,
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.0012),
      );
      setViewTransform(doc.docId, next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [doc.docId]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || !transform) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      zoom: transform.zoom,
      panX: transform.panX,
      panY: transform.panY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current;
    if (!d) return;
    setViewTransform(
      doc.docId,
      panned({ zoom: d.zoom, panX: d.panX, panY: d.panY }, e.clientX - d.x, e.clientY - d.y),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const zoomBy = (factor: number): void => {
    const { transform } = liveRef.current;
    if (!transform) return;
    setViewTransform(
      doc.docId,
      zoomAround(transform, (panel?.w ?? 0) / 2, (panel?.h ?? 0) / 2, factor),
    );
  };

  return (
    <div className="sprite-editor">
      <EditorToolbar>
        <button
          disabled={!doc.result}
          title="Save to the workspace's sprites/ folder — downloads the bundle when no workspace is connected"
          onClick={onSave}
        >
          Save
        </button>
        <button
          disabled={!doc.result || !doc.render}
          title="Place this sprite into a world document (in memory)"
          onClick={() => placeInWorld(doc.docId)}
        >
          Place in world
        </button>
        <span className="toolbar-sep" />
        {VIEW_MODES.map((m) => (
          <button
            key={m}
            disabled={!avail[m]}
            className={view === m ? 'active' : ''}
            title={
              avail[m]
                ? `View: ${VIEW_LABELS[m]}`
                : `${VIEW_LABELS[m]} — ${viewUnavailableReason(m, doc)}`
            }
            onClick={() => setBakeView(doc.docId, m)}
          >
            {VIEW_LABELS[m]}
          </button>
        ))}
      </EditorToolbar>
      {doc.viewOnly ? (
        <p className="viewonly">View-only — {doc.viewOnlyReason}</p>
      ) : null}
      <div
        className={dragging ? 'bake-viewport dragging' : 'bake-viewport'}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {view === 'realtime' && prim ? (
          <RealtimeCanvas prim={prim} transform={transform ?? REALTIME_FIT} />
        ) : view !== 'realtime' ? (
          <canvas ref={imageRef} className="viewport-canvas" />
        ) : null}
        {!avail[view] ? (
          <div className="viewport-placeholder">
            <p>{viewPlaceholder(view, doc)}</p>
          </div>
        ) : null}
        <div className="zoom-controls">
          <button
            title="Zoom out"
            disabled={!transform}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
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
            disabled={doc.viewTransform === null}
            onClick={() => setViewTransform(doc.docId, null)}
          >
            Fit
          </button>
        </div>
      </div>
      {doc.notes.length > 0 ? <p className="hint">skipped: {doc.notes.join(', ')}</p> : null}
    </div>
  );
}
