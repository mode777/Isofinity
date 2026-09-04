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
 * animation loop runs.
 */
export function RealtimeCanvas(props: {
  prim: Primitive;
  /** The active view slot's camera azimuth. */
  azimuthDeg: number;
  transform: ViewTransform;
  overlay: boolean;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<RealtimeMeshView | null>(null);
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
    view.render(props.transform);
    // prim: a recreated view (e.g. scale change) must draw immediately.
  }, [props.prim, props.transform, props.overlay, size]);

  return failed ? (
    <div className="viewport-placeholder">
      <p>Realtime 3D failed: {failed}</p>
    </div>
  ) : (
    <div ref={containerRef} className="rt-host" />
  );
}
