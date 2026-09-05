import { useEffect, useRef, useState } from 'react';
import type { Primitive } from '../../bake/primitives.js';
import type { ViewTransform } from '../document.js';
import { RealtimeMeshView } from '../realtime.js';
import { useEditor } from '../store/editor.js';

/**
 * The sprite viewport's Realtime 3D view: hosts a RealtimeMeshView on a
 * canvas this component owns outright (created per activation, removed on
 * teardown) so repeated view/tab switches never reuse a context-lost
 * canvas. Renders on demand — transform or size changes redraw, and no
 * animation loop runs. When the human reference is enabled, a left press
 * on the figure drags it along the ground plane (suppressing the view
 * pan); a press anywhere else pans as usual.
 */
export function RealtimeCanvas(props: {
  prim: Primitive;
  /** The active view slot's camera azimuth. */
  azimuthDeg: number;
  transform: ViewTransform;
  overlay: boolean;
  humanReference: boolean;
  /** The figure's stored ground spot; null = the view's default spot. */
  humanPos: [number, number] | null;
  /** Called with the ground spot after each drag move. */
  onHumanMove: (pos: [number, number]) => void;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<RealtimeMeshView | null>(null);
  const draggingHuman = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'viewport-canvas';
    container.appendChild(canvas);

    let view: RealtimeMeshView;
    try {
      view = new RealtimeMeshView(canvas, props.prim, props.azimuthDeg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useEditor.getState().setStatus(`Realtime view failed: ${message}`);
      setFailed(message);
      canvas.remove();
      return;
    }
    viewRef.current = view;

    const measure = () => setSize({ w: canvas.clientWidth, h: canvas.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    measure();

    return () => {
      ro.disconnect();
      viewRef.current = null;
      view.dispose();
      canvas.remove();
    };
  }, [props.prim, props.azimuthDeg]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !size) return;
    view.resize(size.w, size.h);
    view.setBoxOverlay(props.overlay);
    view.setHumanReference(props.humanReference);
    if (props.humanPos) view.setHumanPosition(props.humanPos[0], props.humanPos[1]);
    view.render(props.transform);
    // prim: a recreated view (e.g. scale change) must draw immediately.
  }, [props.prim, props.transform, props.overlay, props.humanReference, props.humanPos, size]);

  /** Viewport point (CSS px) of a pointer event, relative to the host. */
  const cssPoint = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const view = viewRef.current;
    if (!view || !props.humanReference || e.button !== 0) return;
    const [x, y] = cssPoint(e);
    if (!view.hitHuman(x, y)) return;
    draggingHuman.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
    // A figure drag is not a view pan: keep the gesture from bubbling to
    // the viewport's pan handler.
    e.stopPropagation();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const view = viewRef.current;
    if (!view) return;
    const [x, y] = cssPoint(e);
    if (draggingHuman.current) {
      const pos = view.dragHumanTo(x, y);
      if (pos) props.onHumanMove([pos[0], pos[1]]);
      e.stopPropagation();
      return;
    }
    if (props.humanReference) {
      e.currentTarget.style.cursor = view.hitHuman(x, y) ? 'grab' : '';
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!draggingHuman.current) return;
    draggingHuman.current = false;
    e.currentTarget.style.cursor = '';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return failed ? (
    <div className="viewport-placeholder">
      <p>Realtime 3D failed: {failed}</p>
    </div>
  ) : (
    <div
      ref={containerRef}
      className="rt-host"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
