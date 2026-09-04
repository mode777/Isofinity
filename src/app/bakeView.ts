import type { BakeDocument, BakeViewMode, ViewPasses, ViewTransform } from './document.js';
import type { ViewSlot } from '../shared/iso.js';

/** Viewport zoom bounds (image-native scale; 1 = 100%). */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
/** Zoom-in/out button multiplier. */
export const ZOOM_STEP = 1.25;

export type BakeViewAvailability = Record<BakeViewMode, boolean>;

/** Toolbar display order: Realtime 3D, Normals, Depth, Render. */
export const VIEW_MODES: BakeViewMode[] = ['realtime', 'normals', 'depth', 'render'];

/** Default-view resolution order: first available wins. */
const FALLBACK_ORDER: BakeViewMode[] = ['realtime', 'render', 'normals', 'depth'];

/**
 * A document's baked passes for one view slot: `result`/`render` for the
 * north slot, the matching `extraViews` entry otherwise; null when the
 * slot holds no baked passes.
 */
export function viewPasses(
  doc: Pick<BakeDocument, 'result' | 'render' | 'extraViews'>,
  slot: ViewSlot,
): ViewPasses | null {
  if (slot === 'n') {
    return doc.result ? { result: doc.result, render: doc.render } : null;
  }
  return doc.extraViews[slot] ?? null;
}

export function viewAvailability(
  doc: Pick<
    BakeDocument,
    'source' | 'gltf' | 'result' | 'render' | 'extraViews' | 'activeSlot' | 'busy'
  >,
): BakeViewAvailability {
  const realtime =
    doc.source !== null &&
    (doc.source.kind === 'primitive' || doc.gltf !== null);
  const passes = viewPasses(doc, doc.activeSlot);
  return {
    realtime,
    normals: passes !== null,
    depth: passes !== null,
    // Available while a pass accumulates: the render view shows the live
    // preview (possibly an empty canvas until the first preview lands).
    render: passes?.render != null || doc.busy,
  };
}

/** Why a view is unavailable, for the disabled button's tooltip. */
export function viewUnavailableReason(
  mode: BakeViewMode,
  doc: Pick<BakeDocument, 'source' | 'gltf'>,
): string {
  switch (mode) {
    case 'realtime':
      return doc.source === null
        ? 'needs a bake source — open a bundle with provenance or re-bake this sprite'
        : 'source model is not loaded — re-open this sprite with the model in models/';
    case 'normals':
    case 'depth':
      return 'bake the raster passes first (Render pass in the sprite toolbar)';
    case 'render':
      return 'bake the render pass first (Render pass in the sprite toolbar)';
  }
}

/** Placeholder text shown when the active view's data is missing. */
export function viewPlaceholder(
  mode: BakeViewMode,
  doc: Pick<BakeDocument, 'source' | 'gltf'>,
): string {
  switch (mode) {
    case 'realtime':
      return doc.source === null
        ? 'No source geometry — this view needs a sprite with provenance. Re-bake it or save the bundle to restore the source.'
        : 'Source model is not loaded — re-open this sprite to preview it in 3D.';
    case 'normals':
      return 'No raster bake yet — run "Render pass" in the sprite toolbar.';
    case 'depth':
      return 'No raster bake yet — run "Render pass" in the sprite toolbar.';
    case 'render':
      return 'No rendered pass yet — run "Render pass" in the sprite toolbar.';
  }
}

/** The view the viewport displays: the stored choice, else the default. */
export function resolvedView(
  doc: Pick<
    BakeDocument,
    'view' | 'source' | 'gltf' | 'result' | 'render' | 'extraViews' | 'activeSlot' | 'busy'
  >,
): BakeViewMode {
  if (doc.view !== null) return doc.view;
  const avail = viewAvailability(doc);
  for (const mode of FALLBACK_ORDER) {
    if (avail[mode]) return mode;
  }
  return 'render';
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Zoom/pan showing the whole image inside the panel (letterboxed). */
export function fitTransform(imgW: number, imgH: number, panelW: number, panelH: number): ViewTransform {
  const safeW = Math.max(1, imgW);
  const safeH = Math.max(1, imgH);
  const zoom = clampZoom(Math.min(panelW / safeW, panelH / safeH));
  return {
    zoom,
    panX: (panelW - safeW * zoom) / 2,
    panY: (panelH - safeH * zoom) / 2,
  };
}

/**
 * Zoom by `factor` keeping the viewport point (cx, cy) fixed. Pan is
 * measured from the view's pan origin — the top-left for the 2D views
 * (their content draws from there), the panel center for Realtime 3D
 * (whose content sits centered at pan 0): pan' = k·pan + (1−k)·(c − o).
 */
export function zoomAround(
  t: ViewTransform,
  cx: number,
  cy: number,
  factor: number,
  originX = 0,
  originY = 0,
): ViewTransform {
  const zoom = clampZoom(t.zoom * factor);
  const k = zoom / t.zoom;
  return {
    zoom,
    panX: k * t.panX + (1 - k) * (cx - originX),
    panY: k * t.panY + (1 - k) * (cy - originY),
  };
}

/** Pan by a viewport-space delta at constant zoom. */
export function panned(t: ViewTransform, dx: number, dy: number): ViewTransform {
  return { zoom: t.zoom, panX: t.panX + dx, panY: t.panY + dy };
}
