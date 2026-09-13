import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SCREEN_UP,
  VIEW_DIR,
  groundToScreen,
  screenToGround,
} from '../../shared/iso.js';
import { RUNTIME_PPU, layersToSet, viewLayerId } from '../../runtime/assets.js';
import { meshYawMat, Renderer, type FlatBatch, type MeshDraw } from '../../runtime/renderer.js';
import { CharacterPlayer, bindPosePalette } from '../../runtime/meshAsset.js';
import { surfaceHeightAt } from '../../runtime/surfaceSnap.js';
import {
  buildLayerShadowPoints,
  buildShadowField,
  splatWorldPoints,
  type ShadowField,
  type ShadowPlacement,
} from '../../runtime/shadowField.js';
import { pickPlacementAt } from '../../runtime/selection.js';
import { depthOf } from '../../runtime/world.js';
import { DEFAULT_POINT_LIGHT, PRIMITIVE_KINDS } from '../document.js';
import type { PlacementRef, ViewTransform, WorldDocument } from '../document.js';
import { fitTransform, panned, ZOOM_STEP, zoomAround } from '../bakeView.js';
import { lightParams, srgbHexToLinearRgb } from '../light.js';
import {
  CHARACTER_BRUSH_ID,
  POINT_LIGHT_TOOL_ID,
  SELECT_TOOL_ID,
  TERRAIN_PAINT_TOOL_ID,
  beginPaintStroke,
  brushDirections,
  clearSelection,
  commitPaintStroke,
  commitSelectionMove,
  cycleBrushDir,
  cycleSelectedSpriteDir,
  eraseRef,
  moveSelectionLive,
  placementLayerIndex,
  paintDab,
  placeAt,
  redoWorld,
  saveWorld,
  selectBrush,
  selectLight,
  selectPlacement,
  setHeightLevel,
  setLayerVisibility,
  setSnappedHeight,
  setSurfaceSnap,
  setTool,
  setWorldViewTransform,
  suggestWorldName,
  undoWorld,
} from '../store/world.js';
import { useEditor } from '../store/editor.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import { EditorToolbar } from './EditorToolbar.js';
import {
  IconEraser,
  IconLayers,
  IconLight,
  IconPaint,
  IconPencil,
  IconRedo,
  IconSave,
  IconSaveAs,
  IconSelect,
  IconSnap,
  IconUndo,
} from './icons.js';
import { WorkspaceFileDialog } from './WorkspaceFileDialog.js';

const MARGIN = 8;

// Projected headroom above the ground (world units of stacking) so the
// fit view reveals raised sprites; taller stacks pan into view.
const HEADROOM_UNITS = 4;

const GRID_COLORS: [number, number, number] = [0.145, 0.153, 0.173];
const GRID_COLORS_ALT: [number, number, number] = [0.169, 0.178, 0.2];
const HIGHLIGHT_COLOR: [number, number, number] = [0.55, 0.62, 0.75];

const PPU = RUNTIME_PPU;

/**
 * The fixed "world image" frame for one ground size: every placement, the
 * ground and the overlays are projected into this pixel space (the bake's
 * isometric camera, unchanged); zoom/pan is a 2D view transform over it.
 * A pure function of the ground's width/depth, memoized per size.
 */
interface WorldFrame {
  width: number;
  depth: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  canvasW: number;
  canvasH: number;
  originX: number;
  originY: number;
}

const frameCache = new Map<string, WorldFrame>();

/** Build (memoized) the world-image frame for a ground size. */
function worldFrame(width: number, depth: number): WorldFrame {
  const key = `${width}x${depth}`;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const corners: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, depth],
    [width, depth],
  ];
  const us = corners.map(([x, z]) => groundToScreen(x, z)[0]);
  const vs = corners.map(([x, z]) => groundToScreen(x, z)[1]);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const minV = Math.min(...vs);
  const maxV = HEADROOM_UNITS * SCREEN_UP[1];
  const frame: WorldFrame = {
    width,
    depth,
    minU,
    maxU,
    minV,
    maxV,
    canvasW: Math.ceil((maxU - minU) * PPU) + MARGIN * 2,
    canvasH: Math.ceil((maxV - minV) * PPU) + MARGIN * 2,
    originX: -minU * PPU + MARGIN,
    originY: maxV * PPU + MARGIN,
  };
  frameCache.set(key, frame);
  return frame;
}

/** Project a world point into the world-image pixels of a frame. */
function framePx(frame: WorldFrame, x: number, z: number, y = 0): [number, number] {
  const [u, v] = groundToScreen(x, z);
  // World +Y projects exactly onto screen-up; height is a pure vertical
  // pixel shift of the same projected image.
  return [frame.originX + u * PPU, frame.originY - (v + y * SCREEN_UP[1]) * PPU];
}

const groundCache = new Map<string, Float32Array>();

/** The checkerboard ground batch for a ground size (memoized). */
function groundBatch(width: number, depth: number): Float32Array {
  const key = `${width}x${depth}`;
  const cached = groundCache.get(key);
  if (cached) return cached;
  const frame = worldFrame(width, depth);
  const ground = new Float32Array(width * depth * 6 * 6);
  let o = 0;
  const push = (x: number, z: number, c: [number, number, number]) => {
    const [px, py] = framePx(frame, x, z);
    ground[o++] = px;
    ground[o++] = py;
    ground[o++] = c[0];
    ground[o++] = c[1];
    ground[o++] = c[2];
    ground[o++] = 1;
  };
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < depth; j++) {
      const c = (i + j) % 2 === 0 ? GRID_COLORS : GRID_COLORS_ALT;
      push(i, j, c);
      push(i + 1, j, c);
      push(i + 1, j + 1, c);
      push(i, j, c);
      push(i + 1, j + 1, c);
      push(i, j + 1, c);
    }
  }
  groundCache.set(key, ground);
  return ground;
}

/** Heights at or below this count as ground level (no gizmo/shadow). */
const GROUND_EPSILON = 0.005;
/** Shadow ellipse segments (a ground-plane circle, projected). */
const SHADOW_SEGMENTS = 24;
/** Point-light icon (handle) size: dark outline + light-colored core, CSS px. */
const LIGHT_ICON_CORE_PX = 4;
const LIGHT_ICON_OUTLINE_PX = 5.5;
/**
 * Screen-space pick radius around a light's projected emitter, in
 * world-image pixels — shared by every light pick (Select tool, eraser,
 * point-light tool) and by the icon's hover ring, so the icon is exactly
 * the visible face of the pick that was always there.
 */
const LIGHT_PICK_PX = 14;

/**
 * A light icon's tint: the placement's sRGB hex as raw 0-1 channels. The
 * overlay program is unlit and untone-mapped editor chrome, so the picker
 * color is used directly (unlike the deferred pass, which linearizes).
 */
function lightIconRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/**
 * Growable triangle-vertex batch for the flat program (x, y, r, g, b, a
 * per vertex). Reused across frames to avoid per-frame allocations.
 */
class FlatBatchBuilder {  data = new Float32Array(2048 * 6);
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

  // The layer dropdown's open state (per-component chrome, not per-document
  // state: which layer is hidden lives in the document, whether the menu is
  // open does not).
  const [layersOpen, setLayersOpen] = useState(false);
  const layerPanelRef = useRef<HTMLDivElement>(null);
  // Close on an outside click or Escape. Escape stops propagation so the
  // world-editor window shortcut (which deselects on Escape) does not also
  // fire; the listener lives on `document`, which bubbles before `window`.
  useEffect(() => {
    if (!layersOpen) return;
    const onDocPointerDown = (e: PointerEvent): void => {
      if (!layerPanelRef.current?.contains(e.target as Node)) setLayersOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setLayersOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [layersOpen]);

  // Latest resolved transform for the native listeners and the rAF loop
  // (avoids re-binding per frame).
  const liveRef = useRef({
    transform: null as ViewTransform | null,
    panel: null as { w: number; h: number } | null,
  });

  // Stable unless the document's layers change (place-in-world, load).
  const spriteSet = useMemo(() => layersToSet(doc.layers), [doc.layers]);

  // The per-size world-image frame: a memoized pure function of the
  // document's ground size (memoization is per size, so this is cheap).
  // Render-time closures read frameRef; renderFrame refreshes it from the
  // live document every frame, so a resize applies mid-session.
  const frame = useMemo(
    () => worldFrame(doc.ground.width, doc.ground.depth),
    [doc.ground.width, doc.ground.depth],
  );
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // Zoom/pan: the document's stored transform, else the default fit (the
  // whole ground plane letterboxed in the panel).
  const transform: ViewTransform | null = useMemo(() => {
    if (doc.viewTransform) return doc.viewTransform;
    if (!panel) return null;
    return fitTransform(frame.canvasW, frame.canvasH, panel.w, panel.h);
  }, [doc.viewTransform, panel, frame]);
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
    // Per-size frame access for the closures below: world-image pixel
    // projection and the frame origin, always for the current ground
    // size (renderFrame refreshes frameRef from the live document).
    const toPx = (x: number, z: number, y = 0): [number, number] =>
      framePx(frameRef.current, x, z, y);

    let instances = new Float32Array(256 * 10);
    const shadowBatch = new FlatBatchBuilder();
    const overlayBatch = new FlatBatchBuilder();

    // Character engine state (in-memory only, like every engine object):
    // one animation player per placed character, keyed by placement id;
    // the parsed asset uploaded to the renderer exactly once.
    const players = new Map<number, { player: CharacterPlayer; yawMat: Float32Array }>();
    let uploadedCharacter: unknown = null;
    const ghostYawMat = meshYawMat(0);
    let ghostPalette: Float32Array | null = null;
    let appliedGroundKey = '';
    let lastFrameTime = performance.now();

    // Reconstructed directional-shadow occluder (engine state; ADR 0006):
    // per-layer placement-local point clouds cached once, a static field
    // rebuilt only when the placement set / ground size changes, and a
    // per-frame copy while characters are placed (their skinned vertices
    // splat on top of the static field before upload).
    const shadowPoints = new Map<number, Float32Array>();
    let staticShadowField: ShadowField | null = null;
    let appliedShadowKey = '';
    let uploadedShadowField: ShadowField | null = null;

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
     * document's in-memory g-buffers (`surfaceHeightAt`).
     * Empty ground or nothing covered = ground level.
     */
    const effectiveHeight = (live: WorldDocument, wx: number, wy: number): number => {
      if (!live.surfaceSnap) return live.heightLevel;
      // Hidden layers are not part of the world's visible surface: their
      // placements supply no snap heights.
      const placements = (
        live.layerVisibility.sprites ? live.world.list() : []
      ).map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          layer: placementLayerIndex(live, p.primId, p.dir),
        }));
      return surfaceHeightAt(spriteSet, placements, wx, wy, frameRef.current.originY, PPU, toPx);
    };

    /**
     * The placement under a world-image pixel, or null: sprites by their
     * baked g-buffer silhouette, meshes and point lights by screen-space
     * proximity (design D2). Reads the same in-memory data the frame uses.
     * Hidden layers are not pickable: their placements are excluded, so
     * clicks pass through them.
     */
    const pickAt = (live: WorldDocument, px: [number, number]): PlacementRef | null => {
      const viz = live.layerVisibility;
      const sprites = (viz.sprites ? live.world.list() : []).map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        z: p.z,
        layer: live.layers.findIndex((l) => l.id === viewLayerId(p.primId, p.dir)),
      }));
      const off = live.character?.worldOffset ?? [0, 0, 0];
      const height = live.character?.height ?? 1;
      const meshes = (viz.meshes ? live.world.listMeshes() : []).map((m) => ({
        id: m.id,
        x: m.x + off[0],
        y: m.y + off[1],
        z: m.z + off[2],
        height,
      }));
      const lights = live.world.listLights().map((l) => ({
        id: l.id,
        x: l.x,
        y: l.y,
        z: l.z,
      }));
      const hit = pickPlacementAt(spriteSet, sprites, meshes, lights, px[0], px[1], PPU, toPx);
      return hit ? { kind: hit.kind, id: hit.id } : null;
    };

    /** A selected placement's current ground position, or null if gone. */
    const placementPos = (
      live: WorldDocument,
      ref: PlacementRef,
    ): { x: number; z: number } | null => {
      if (ref.kind === 'sprite') {
        const p = live.world.placementAt(ref.id);
        return p ? { x: p.x, z: p.z } : null;
      }
      if (ref.kind === 'mesh') {
        const m = live.world.meshAt(ref.id);
        return m ? { x: m.x, z: m.z } : null;
      }
      const l = live.world.lightAt(ref.id);
      return l ? { x: l.x, z: l.z } : null;
    };

    /** Erase the placement picked at a world-image pixel (pixel-accurate). */
    const erasePicked = (live: WorldDocument, px: [number, number]): void => {
      const hit = pickAt(live, px);
      if (hit) eraseRef(doc.docId, hit);
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

      // The frame follows the live ground size, so a panel resize applies
      // on the next frame without a React pass.
      const frame = worldFrame(live.ground.width, live.ground.depth);
      frameRef.current = frame;

      const t = live.viewTransform ?? fitTransform(frame.canvasW, frame.canvasH, panel.w, panel.h);
      renderer.setLight(lightParams(live.light));
      renderer.setLightsEnabled(live.light.enabled);
      // Temporary self-shadow bias tuning (in-memory only; ADR 0006).
      renderer.setShadowBias(live.shadowBias);
      // Point lights: the deferred pass evaluates them; the editor converts
      // the sRGB picker color to linear per channel, as the key light does.
      const placedLights = live.world.listLights();
      renderer.setPointLights(
        placedLights.map((l) => ({
          pos: [l.x + 0.5, l.y, l.z + 0.5] as [number, number, number],
          radius: l.radius,
          color: srgbHexToLinearRgb(l.colorHex),
          energy: l.energy,
        })),
      );

      // Character asset: (re)upload when the document's parsed character
      // changes — one upload per asset, shared by every placement draw.
      if (live.character !== uploadedCharacter) {
        uploadedCharacter = live.character;
        renderer.setSkinningMode('gpu');
        renderer.setMesh(live.character?.geometry ?? null, live.character?.surface ?? null);
      }
      // The world-image frame is shared by meshes and the ground plane;
      // set it unconditionally (it must be right even with no character).
      renderer.setMeshFrame(frame.originX, frame.originY, PPU);
      // Environment-derived ambient + its display parameters: meshes shade
      // with the same probe the sprites' bake environment implies.
      renderer.setShProbe(live.shProbe);
      const envParams = live.envParams;
      renderer.setEnvDisplay(envParams?.exposure ?? 1, envParams?.saturation ?? 1);

      // Ground: apply when the material bindings/maps, tile scale, or
      // ground size changes; no bound slot = the flat batch draws. Size
      // participates in the key so the checkerboard batch, the material
      // quad's extent, and the frame all re-apply on resize. The splat is
      // uploaded separately (full on material apply, dirty-rect while
      // painting) so strokes never rebuild the material arrays.
      const mapsKey = live.ground.maps.map((m) => (m ? '1' : '0')).join('');
      const groundKey = `${live.ground.materials.join(',')}|${mapsKey}|${
        live.ground.tileScale
      }|${live.ground.width}x${live.ground.depth}`;
      if (groundKey !== appliedGroundKey) {
        appliedGroundKey = groundKey;
        renderer.setGround(groundBatch(live.ground.width, live.ground.depth));
        renderer.setGroundExtent(live.ground.width, live.ground.depth);
        renderer.setGroundMaterials(
          live.ground.maps,
          live.ground.splat
            ? {
                data: live.ground.splat,
                width: live.ground.splatWidth,
                height: live.ground.splatHeight,
              }
            : null,
          live.ground.tileScale,
        );
      }
      // Painted coverage: upload just the changed rectangle. `splatDirty`
      // is engine bookkeeping (not React state) and is safe to clear here.
      const splatDirty = live.ground.splatDirty;
      if (splatDirty && live.ground.splat) {
        renderer.updateSplatRect(
          {
            data: live.ground.splat,
            width: live.ground.splatWidth,
            height: live.ground.splatHeight,
          },
          splatDirty,
        );
        live.ground.splatDirty = null;
      }

      // Animation playback: advance every live character by the frame
      // delta (clamped so a background tab doesn't teleport the walk).
      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;

      const placed = live.world.list();

      // Static occluder: rebuild only when the visible placement set, ground
      // size, or layer set changes. Hidden sprite layers cast nothing.
      const shadowSprites = live.layerVisibility.sprites ? placed : [];
      let shadowKey = `${live.ground.width}x${live.ground.depth}|${live.layers.length}|`;
      for (const p of shadowSprites) {
        const layer = placementLayerIndex(live, p.primId, p.dir);
        shadowKey += `${layer}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)};`;
      }
      if (shadowKey !== appliedShadowKey) {
        appliedShadowKey = shadowKey;
        const shadowPlacements: ShadowPlacement[] = shadowSprites.map((p) => {
          const layer = placementLayerIndex(live, p.primId, p.dir);
          if (layer >= 0 && !shadowPoints.has(layer)) {
            shadowPoints.set(layer, buildLayerShadowPoints(spriteSet, layer));
          }
          return { x: p.x, y: p.y, z: p.z, layer };
        });
        staticShadowField = buildShadowField(
          spriteSet,
          shadowPlacements,
          live.ground.width,
          live.ground.depth,
          shadowPoints,
        );
        uploadedShadowField = null;
      }
      const hover = hoverRef.current;
      // The ghost preview: when a brush with a loaded layer is active and
      // the cursor is over the canvas, preview the placement (cursor-
      // centered at the effective height, exactly what placeAt will do)
      // as a depth-tested sprite, in the brush's chosen direction (the
      // plain north id is the fallback when that view is not loaded —
      // same rule placeAt follows).
      const brushId =
        live.tool && live.tool !== 'eraser' ? live.tool : '';
      let brushIndex = brushId
        ? live.layers.findIndex(
            (l) => l.id === viewLayerId(brushId, live.brushDir),
          )
        : -1;
      if (brushIndex < 0 && brushId) {
        brushIndex = live.layers.findIndex((l) => l.id === brushId);
      }
      const ghost =
        hover && brushIndex >= 0
          ? (() => {
              const { x, y, z } = anchorAt(hover.px);
              return { layer: brushIndex, x, y, z, key: depthOf(x, y, z) };
            })()
          : null;

      const total = placed.length + (ghost ? 1 : 0);
      if (instances.length < total * 10) {
        instances = new Float32Array(total * 10);
      }
      let count = 0;
      const emit = (
        layerIndex: number,
        x: number,
        y: number,
        z: number,
        shadow: number,
      ): void => {
        const scale = PPU / spriteSet.ppus[layerIndex];
        const [ox, oy] = spriteSet.origins[layerIndex];
        const [ax, ay, az] = spriteSet.anchors[layerIndex];
        const [w, h] = spriteSet.sizes[layerIndex];
        const [cx, cy] = toPx(x, z, y);
        instances[count * 10] = cx - ox * scale;
        instances[count * 10 + 1] = cy - oy * scale;
        instances[count * 10 + 2] = layerIndex;
        // Instance depth offset: the placement's world depth minus the
        // anchor's. The baked g-buffer depth is measured with the box
        // corner at the placement point, but the image is drawn with the
        // authored anchor there — without subtracting `dot(VIEW_DIR,
        // anchor)` the depth field disagrees with the drawn pixels by the
        // anchor's displacement and anchored sprites composite at the
        // wrong depth (a ground-center stool renders perched on things
        // it merely stands behind).
        instances[count * 10 + 3] =
          VIEW_DIR[0] * (x - ax) +
          VIEW_DIR[1] * (y - ay) +
          VIEW_DIR[2] * (z - az);
        instances[count * 10 + 4] = w * scale;
        instances[count * 10 + 5] = h * scale;
        instances[count * 10 + 6] = w;
        instances[count * 10 + 7] = h;
        // Placement height: the shader suppresses the baked grounding
        // shadow for anything off the ground plane.
        instances[count * 10 + 8] = y;
        // Per-placement grounding-shadow strength (0 = off; persisted in
        // isoinfinity-world/5, omitted at the default 1).
        instances[count * 10 + 9] = shadow;
        count++;
      };
      // Placements arrive far → near; the ghost slots in at its depth key
      // so the per-pixel occlusion solves exactly as if it were placed.
      let ghostDone = false;
      // The sprite layer's visibility gates placed sprites only; the ghost
      // preview stays (it previews the next action, not world content).
      if (live.layerVisibility.sprites) {
        for (const p of placed) {
          if (ghost && !ghostDone && p.key >= ghost.key) {
            emit(ghost.layer, ghost.x, ghost.y, ghost.z, live.shadowLevel);
            ghostDone = true;
          }
          const layerIndex = live.layers.findIndex(
            (l) => l.id === viewLayerId(p.primId, p.dir),
          );
          if (layerIndex < 0) continue;
          emit(layerIndex, p.x, p.y, p.z, p.shadow);
        }
      }
      if (ghost && !ghostDone) emit(ghost.layer, ghost.x, ghost.y, ghost.z, live.shadowLevel);

      // Character placements: sync players with the live placement set,
      // advance animation, and emit one opaque draw per character.
      const meshPlaced = live.world.listMeshes();
      if (live.character) {
        const alive = new Set(meshPlaced.map((mp) => mp.id));
        for (const [id, entry] of players) {
          if (!alive.has(id)) {
            entry.player.release();
            players.delete(id);
          }
        }
        for (const mp of meshPlaced) {
          if (!players.has(mp.id)) {
            players.set(mp.id, { player: new CharacterPlayer(live.character), yawMat: new Float32Array(9) });
          }
          players.get(mp.id)!.player.update(dt);
        }
      }

      // Directional-shadow occluder upload: the static field, plus a
      // per-frame splat of visible characters' skinned world vertices so
      // mesh and sprite shadows compound in the one field (max height per
      // cell = union of occluders). Engine state only (ADR 0006).
      if (staticShadowField) {
        const shadowMeshes = live.layerVisibility.meshes ? meshPlaced : [];
        if (shadowMeshes.length > 0 && live.character) {
          const combined: ShadowField = {
            ...staticShadowField,
            data: staticShadowField.data.slice(),
          };
          const characterOffset = live.character.worldOffset;
          const yaw = new Float32Array(9);
          for (const mp of shadowMeshes) {
            const entry = players.get(mp.id);
            if (!entry) continue;
            const geometry = live.character.geometry;
            const pos = entry.player.skinnedPositions();
            entry.player.skinInto(pos, entry.player.skinnedNormals());
            meshYawMat(mp.yaw, yaw);
            const world = new Float32Array(geometry.vertexCount * 3);
            const ox = mp.x + characterOffset[0];
            const oy = mp.y + characterOffset[1];
            const oz = mp.z + characterOffset[2];
            for (let i = 0; i < geometry.vertexCount; i++) {
              const px = pos[i * 3];
              const py = pos[i * 3 + 1];
              const pz = pos[i * 3 + 2];
              world[i * 3] = yaw[0] * px + yaw[3] * py + yaw[6] * pz + ox;
              world[i * 3 + 1] = yaw[1] * px + yaw[4] * py + yaw[7] * pz + oy;
              world[i * 3 + 2] = yaw[2] * px + yaw[5] * py + yaw[8] * pz + oz;
            }
            combined.maxHeight = splatWorldPoints(combined, world);
          }
          renderer.setOccluder(combined);
          uploadedShadowField = combined;
        } else if (staticShadowField !== uploadedShadowField) {
          renderer.setOccluder(staticShadowField);
          uploadedShadowField = staticShadowField;
        }
      }

      const meshDraws: MeshDraw[] = [];
      const off = live.character?.worldOffset ?? [0, 0, 0];
      // The mesh layer's visibility gates placed characters only; the
      // character ghost stays (preview of the next action). Animation
      // players above keep advancing either way.
      const meshesVisible = live.layerVisibility.meshes;
      for (const mp of meshesVisible ? meshPlaced : []) {
        const entry = players.get(mp.id);
        if (!entry) continue;
        meshDraws.push({
          palette: entry.player.palette,
          origin: [mp.x + off[0], mp.y + off[1], mp.z + off[2]],
          yawMat: meshYawMat(mp.yaw, entry.yawMat),
        });
      }
      // The character ghost: the bind-pose character at the exact spot the
      // next click would place (depth-tested like a real placement,
      // preview-only).
      let charGhost: { x: number; y: number; z: number } | null = null;
      if (hover && live.tool === CHARACTER_BRUSH_ID && live.character) {
        const x = hover.ground[0] - 0.5;
        const z = hover.ground[1] - 0.5;
        const y = effectiveHeight(live, hover.px[0], hover.px[1]);
        charGhost = { x, y, z };
        if (!ghostPalette || ghostPalette.length / 16 !== live.character.geometry.jointCount) {
          ghostPalette = bindPosePalette(live.character.geometry.jointCount);
        }
        meshDraws.push({
          palette: ghostPalette,
          origin: [x + off[0], y + off[1], z + off[2]],
          yawMat: meshYawMat(0, ghostYawMat),
        });
      }

      // Contact shadows: under every raised placement (sprites and
      // characters) and a raised ghost, drawn between the ground and the
      // meshes/sprites. Hidden layers take their shadows with them; with
      // the ground hidden no floor remains, so the whole stage empties.
      // Ghost shadows follow the ghost, not the layer.
      shadowBatch.reset();
      if (live.layerVisibility.ground) {
        if (live.layerVisibility.sprites) {
          for (const p of placed) emitShadow(p.x, p.y, p.z);
        }
        if (live.layerVisibility.meshes) {
          for (const mp of meshPlaced) emitShadow(mp.x, mp.y, mp.z);
        }
        if (ghost) emitShadow(ghost.x, ghost.y, ghost.z);
        if (charGhost && charGhost.y > GROUND_EPSILON) emitShadow(charGhost.x, charGhost.y, charGhost.z);
      }

    // Ring editor chrome for point lights: a ground/horizontal circle at
    // the light's position and radius (projected like the contact-shadow
    // ellipse), plus a center dot.
    const lightRing = (
      x: number,
      y: number,
      z: number,
      radius: number,
      alpha: number,
    ): void => {
      const [cx, cy] = toPx(x, z, y);
      let prev: [number, number] | null = null;
      for (let i = 0; i <= SHADOW_SEGMENTS; i++) {
        const t = (i / SHADOW_SEGMENTS) * Math.PI * 2;
        const [px, py] = toPx(x + radius * Math.cos(t), z + radius * Math.sin(t), y);
        if (prev !== null) {
          overlayBatch.vert(cx, cy, HIGHLIGHT_COLOR, alpha);
          overlayBatch.vert(prev[0], prev[1], HIGHLIGHT_COLOR, alpha);
          overlayBatch.vert(px, py, HIGHLIGHT_COLOR, alpha);
        }
        prev = [px, py];
      }
      const d = 4;
      overlayBatch.quad(cx - d, cy - d, cx + d, cy - d, cx + d, cy + d, cx - d, cy + d, HIGHLIGHT_COLOR, Math.min(1, alpha + 0.1));
    };

    /**
     * Point-light icon (handle): a filled diamond centered on the light's
     * projected emitter, tinted with the light's color over a dark
     * outline, so every placed light is visible and grabbable in every
     * tool mode. The overlay batch is in world-image pixels scaled by the
     * view transform, so the radii divide by zoom to hold a constant CSS
     * size on screen.
     */
    const emitLightIcon = (
      x: number,
      y: number,
      z: number,
      colorHex: string,
      zoom: number,
    ): void => {
      const [cx, cy] = toPx(x, z, y);
      const rgb = lightIconRgb(colorHex);
      const diamond = (r: number, c: [number, number, number], a: number): void => {
        overlayBatch.vert(cx, cy, c, a);
        overlayBatch.vert(cx, cy - r, c, a);
        overlayBatch.vert(cx + r, cy, c, a);
        overlayBatch.vert(cx, cy, c, a);
        overlayBatch.vert(cx + r, cy, c, a);
        overlayBatch.vert(cx, cy + r, c, a);
        overlayBatch.vert(cx, cy, c, a);
        overlayBatch.vert(cx - r, cy, c, a);
        overlayBatch.vert(cx, cy + r, c, a);
        overlayBatch.vert(cx, cy, c, a);
        overlayBatch.vert(cx, cy - r, c, a);
        overlayBatch.vert(cx - r, cy, c, a);
      };
      diamond(LIGHT_ICON_OUTLINE_PX / zoom, [0, 0, 0], 0.55);
      diamond(LIGHT_ICON_CORE_PX / zoom, rgb, 0.95);
    };

    // Axis-aligned rectangle outline (four thin quads) in world-image
    // pixels: the selected sprite's drawn bounds.
    const rectOutline = (x0: number, y0: number, x1: number, y1: number): void => {
      const a = 0.9;
      const t = 2;
      overlayBatch.quad(x0, y0, x1, y0, x1, y0 + t, x0, y0 + t, HIGHLIGHT_COLOR, a);
      overlayBatch.quad(x0, y1 - t, x1, y1 - t, x1, y1, x0, y1, HIGHLIGHT_COLOR, a);
      overlayBatch.quad(x0, y0, x0 + t, y0, x0 + t, y1, x0, y1, HIGHLIGHT_COLOR, a);
      overlayBatch.quad(x1 - t, y0, x1, y0, x1, y1, x1 - t, y1, HIGHLIGHT_COLOR, a);
    };

    /**
     * Editor-chrome highlight for one placement: a bounding box around a
     * sprite's drawn extent, the height gizmo for a character, or the
     * radius ring for a light. Shared by the Select tool's selection and
     * the eraser's hover target.
     */
    const highlightRef = (live: WorldDocument, ref: PlacementRef, lightAlpha = 0.4): void => {
      if (ref.kind === 'sprite') {
        const p = live.world.placementAt(ref.id);
        if (!p) return;
        const layerIndex = placementLayerIndex(live, p.primId, p.dir);
        if (layerIndex < 0) return;
        const scale = PPU / spriteSet.ppus[layerIndex];
        const [ox, oy] = spriteSet.origins[layerIndex];
        const [w, h] = spriteSet.sizes[layerIndex];
        const [cx, cy] = toPx(p.x, p.z, p.y);
        const x0 = cx - ox * scale;
        const y0 = cy - oy * scale;
        rectOutline(x0, y0, x0 + w * scale, y0 + h * scale);
      } else if (ref.kind === 'mesh') {
        const m = live.world.meshAt(ref.id);
        if (!m) return;
        const off = live.character?.worldOffset ?? [0, 0, 0];
        emitGizmo(m.x + off[0], m.y + off[1], m.z + off[2]);
      } else {
        const l = live.world.lightAt(ref.id);
        if (l) lightRing(l.x + 0.5, l.y, l.z + 0.5, l.radius, lightAlpha);
      }
    };

    // Overlays: the height gizmo for an off-ground ghost (raised or
    // sunk), the eraser's hover target, the point-light tool's ghost ring,
    // and the selected placement's highlight.
    overlayBatch.reset();
    if (ghost && Math.abs(ghost.y) > GROUND_EPSILON) {
      emitGizmo(ghost.x, ghost.y, ghost.z);
    }
    if (hover && live.tool === POINT_LIGHT_TOOL_ID) {
      const [gx, gz] = hover.ground;
      const y = effectiveHeight(live, hover.px[0], hover.px[1]);
      lightRing(gx, y, gz, DEFAULT_POINT_LIGHT.radius, 0.25);
    }
    // Terrain paint gizmo: outer radius ring + inner hardness ring on the
    // ground under the cursor (only when at least one slot is bound).
    if (hover && live.tool === TERRAIN_PAINT_TOOL_ID && live.ground.materials.some((m) => !!m)) {
      const [gx, gz] = hover.ground;
      lightRing(gx, 0, gz, live.paintRadius, 0.6);
      if (live.paintHardness > 0.001) {
        lightRing(gx, 0, gz, live.paintRadius * live.paintHardness, 0.3);
      }
    }
    // The eraser previews the placement a click would remove, using the
    // same pixel-accurate pick the Select tool uses.
    if (hover && !ghost && live.tool === 'eraser') {
      const target = pickAt(live, hover.px);
      if (target) highlightRef(live, target);
    }
    if (live.selection) {
      // The selection survives hiding its layer, but its highlight only
      // draws while the layer is visible; showing the layer restores it.
      const selVisible =
        live.selection.kind === 'sprite'
          ? live.layerVisibility.sprites
          : live.selection.kind === 'mesh'
            ? live.layerVisibility.meshes
            : true;
      if (selVisible) highlightRef(live, live.selection);
    }
    // Light-icon hover: with a light-aware tool (Select or point-light), a
    // cursor resting within the light pick radius of a placed light
    // previews its radius ring — skipped when the selection ring already
    // draws for that light. The icons themselves emit last so they stay
    // crisp over every ring and gizmo.
    if (hover && (live.tool === SELECT_TOOL_ID || live.tool === POINT_LIGHT_TOOL_ID)) {
      const selectedLightId = live.selection?.kind === 'light' ? live.selection.id : null;
      for (const l of placedLights) {
        const [lx, ly] = toPx(l.x + 0.5, l.z + 0.5, l.y);
        const dx = lx - hover.px[0];
        const dy = ly - hover.px[1];
        if (dx * dx + dy * dy <= LIGHT_PICK_PX * LIGHT_PICK_PX) {
          if (l.id !== selectedLightId) {
            lightRing(l.x + 0.5, l.y, l.z + 0.5, l.radius, 0.3);
          }
          break;
        }
      }
    }
    for (const l of placedLights) {
      emitLightIcon(l.x + 0.5, l.y, l.z + 0.5, l.colorHex, t.zoom);
    }

      renderer.render(
        instances,
        count,
        shadowBatch.batch(),
        overlayBatch.batch(),
        { zoom: t.zoom * dpr, panX: t.panX * dpr, panY: t.panY * dpr },
        meshDraws,
        // The ground layer's visibility: a per-frame draw gate — the
        // ground-apply cache above stays untouched, so showing the layer
        // again restores instantly with no re-upload.
        { groundVisible: live.layerVisibility.ground },
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
      const [gx, gz] = screenToGround(
        (wx - frameRef.current.originX) / PPU,
        -(wy - frameRef.current.originY) / PPU,
      );
      return { px: [wx, wy], ground: [gx, gz] };
    };

    // Reads the live document and computes the height the next placement
    // at the cursor would land at (brush level, or the snapped surface).
    const hoverPlacementHeight = (px: [number, number]): number => {
      const live = useEditor.getState().docs[doc.docId];
      if (!live || live.kind !== 'world') return 0;
      return effectiveHeight(live, px[0], px[1]);
    };

    /**
     * Ground position of the brush anchor at the given height: the
     * cursor's view ray intersected with the horizontal plane at that
     * height, so the anchor always projects exactly onto the cursor
     * (at ground level this is the pixel's plain ground position).
     * A world point at height y projects to screen v = UP0·x + UP2·z
     * + y·UP1, so the ground basis coordinates solve with s − y·UP1.
     */
    const groundAtHeight = (px: [number, number], y: number): [number, number] => {
      const u = (px[0] - frameRef.current.originX) / PPU;
      const s = -(px[1] - frameRef.current.originY) / PPU;
      return screenToGround(u, s - y * SCREEN_UP[1]);
    };

    // The anchor position + height the next placement at the cursor
    // would land at (shared by the ghost preview and every placement).
    const anchorAt = (
      px: [number, number],
    ): { x: number; z: number; y: number } => {
      const y = hoverPlacementHeight(px);
      const [x, z] = groundAtHeight(px, y);
      return { x, z, y };
    };

    // Publish the snap read for the height field's eyedropper display.
    // Store updates only on change so per-move churn stays zero.
    const publishSnapHeight = (px: [number, number] | null): void => {
      const live = useEditor.getState().docs[doc.docId];
      if (!live || live.kind !== 'world') return;
      if (px === null || !live.surfaceSnap) {
        setSnappedHeight(doc.docId, null);
        return;
      }
      setSnappedHeight(doc.docId, effectiveHeight(live, px[0], px[1]));
    };

    // Middle-drag pans (left paints, right erases); capture keeps the
    // drag alive outside the canvas.
    let pan: { x: number; y: number; zoom: number; panX: number; panY: number } | null = null;

    // Select-tool drag in progress: the picked placement, the pointer's
    // starting ground position, and the placement's starting ground
    // position. Live moves update the world; release records one command.
    let selectDrag: {
      ref: PlacementRef;
      pointer: [number, number];
      from: { x: number; z: number };
    } | null = null;

    // Terrain paint stroke in progress (one undoable command on release).
    let painting = false;

    /** Stamp a paint dab at a pointer's ground position (in-bounds only). */
    const paintAt = (pt: { ground: [number, number] }): void => {
      const live = useEditor.getState().docs[doc.docId];
      if (!live || live.kind !== 'world') return;
      const [gx, gz] = pt.ground;
      if (gx < 0 || gz < 0 || gx > live.ground.width || gz > live.ground.depth) return;
      paintDab(doc.docId, gx, gz);
    };

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
      // Select-tool drag: move the picked placement by the pointer's
      // ground delta, keeping the grab offset (one command on release).
      if (selectDrag) {
        const pt = pointerPoint(e);
        if (pt) {
          const [gx, gz] = pt.ground;
          moveSelectionLive(
            doc.docId,
            selectDrag.ref,
            selectDrag.from.x + (gx - selectDrag.pointer[0]),
            selectDrag.from.z + (gz - selectDrag.pointer[1]),
          );
        }
        return;
      }
      // An in-progress terrain paint stroke: stamp along the drag. A second
      // touch finger ends the stroke (the gesture becomes a pan).
      if (painting) {
        if (e.pointerType === 'touch' && touchPts.size > 1) {
          painting = false;
          commitPaintStroke(doc.docId);
        } else {
          const pt = pointerPoint(e);
          if (pt) {
            hoverRef.current = pt;
            paintAt(pt);
          }
          return;
        }
      }
      // Shift + vertical mouse move adjusts the placement height (up
      // raises, down lowers, below the ground plane included): free-form,
      // never panning. Hover tracking and drag-painting continue
      // alongside.
      if (e.pointerType === 'mouse' && e.shiftKey) {
        const live = useEditor.getState().docs[doc.docId];
        if (live && live.kind === 'world') {
          setHeightLevel(doc.docId, live.heightLevel - e.movementY * 0.01);
        }
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
          publishSnapHeight(pt.px);
          // Point lights place on tap, not drag (a drag would spam lights).
          const live = useEditor.getState().docs[doc.docId];
          if (live?.kind === 'world' && live.tool === POINT_LIGHT_TOOL_ID) return;
          // The eraser removes the picked placement as the finger drags.
          if (live?.kind === 'world' && live.tool === 'eraser') {
            erasePicked(live, pt.px);
            return;
          }
          // The Select tool never places; a touch drag with no pick panned
          // nothing until now, so just track hover.
          if (live?.kind === 'world' && live.tool === SELECT_TOOL_ID) return;
          const a = anchorAt(pt.px);
          placeAt(doc.docId, a.x, a.z, a.y);
        }
        return;
      }
      const pt = pointerPoint(e);
      if (!pt) return;
      hoverRef.current = pt;
      publishSnapHeight(pt.px);
      if (e.buttons & 1) {
        // Point lights place on click, not drag (a drag would spam lights).
        const live = useEditor.getState().docs[doc.docId];
        if (live?.kind === 'world' && live.tool === POINT_LIGHT_TOOL_ID) return;
        // The Select tool never places.
        if (live?.kind === 'world' && live.tool === SELECT_TOOL_ID) return;
        // The eraser removes the picked placement along the drag.
        if (live?.kind === 'world' && live.tool === 'eraser') {
          erasePicked(live, pt.px);
          return;
        }
        const a = anchorAt(pt.px);
        placeAt(doc.docId, a.x, a.z, a.y);
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
        } else if (touchPts.size === 1) {
          const live = useEditor.getState().docs[doc.docId];
          if (live?.kind === 'world' && live.tool === TERRAIN_PAINT_TOOL_ID) {
            const pt = pointerPoint(e);
            if (pt) {
              hoverRef.current = pt;
              beginPaintStroke(doc.docId);
              painting = true;
              paintAt(pt);
            }
          }
          if (live?.kind === 'world' && live.tool === SELECT_TOOL_ID) {
            const pt = pointerPoint(e);
            if (pt) {
              const hit = pickAt(live, pt.px);
              if (hit) {
                selectPlacement(doc.docId, hit);
                const pos = placementPos(live, hit);
                if (pos) {
                  selectDrag = { ref: hit, pointer: [pt.ground[0], pt.ground[1]], from: pos };
                }
              } else {
                clearSelection(doc.docId);
              }
            }
          }
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
        const live = useEditor.getState().docs[doc.docId];
        if (live?.kind === 'world' && live.tool === TERRAIN_PAINT_TOOL_ID) {
          // The paint tool leaves right-click free (no accidental erasing).
        } else if (live?.kind === 'world' && live.tool === SELECT_TOOL_ID) {
          clearSelection(doc.docId);
        } else if (live?.kind === 'world') {
          // Right-click is the eraser everywhere: pixel-picked like Select.
          erasePicked(live, pt.px);
        }
      } else if (e.button === 0) {
        publishSnapHeight(pt.px);
        const live = useEditor.getState().docs[doc.docId];
        if (live?.kind === 'world' && live.tool === TERRAIN_PAINT_TOOL_ID) {
          beginPaintStroke(doc.docId);
          painting = true;
          paintAt(pt);
          canvas.setPointerCapture(e.pointerId);
          return;
        }
        if (live?.kind === 'world' && live.tool === SELECT_TOOL_ID) {
          // Select the placement under the cursor (pixel-accurate for
          // sprites); an empty click clears the selection. A hit starts a
          // potential drag, recorded once on release.
          const hit = pickAt(live, pt.px);
          if (hit) {
            selectPlacement(doc.docId, hit);
            const pos = placementPos(live, hit);
            if (pos) {
              selectDrag = { ref: hit, pointer: [pt.ground[0], pt.ground[1]], from: pos };
              canvas.setPointerCapture(e.pointerId);
            }
          } else {
            clearSelection(doc.docId);
          }
          return;
        }
        if (live?.kind === 'world' && live.tool === 'eraser') {
          erasePicked(live, pt.px);
          return;
        }
        if (live?.kind === 'world' && live.tool === POINT_LIGHT_TOOL_ID) {
          // Clicking on (near) a placed light selects it for the
          // properties panel; clicking elsewhere places a new light.
          let picked: number | null = null;
          for (const l of live.world.listLights()) {
            const [lx, ly] = toPx(l.x + 0.5, l.z + 0.5, l.y);
            const dx = lx - pt.px[0];
            const dy = ly - pt.px[1];
            if (dx * dx + dy * dy <= LIGHT_PICK_PX * LIGHT_PICK_PX) {
              picked = l.id;
              break;
            }
          }
          if (picked !== null) {
            selectLight(doc.docId, picked);
            return;
          }
        }
        const a = anchorAt(pt.px);
        placeAt(doc.docId, a.x, a.z, a.y);
      }
    };
    const onUp = (e: PointerEvent): void => {
      // A terrain paint stroke ends: record one undoable command.
      if (painting && e.pointerType !== 'touch') {
        painting = false;
        commitPaintStroke(doc.docId);
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
        return;
      }
      // A select drag ends: record exactly one move command (no-op when
      // the pointer never moved the placement).
      if (selectDrag) {
        const live = useEditor.getState().docs[doc.docId];
        const to = live?.kind === 'world' ? placementPos(live, selectDrag.ref) : null;
        if (to) commitSelectionMove(doc.docId, selectDrag.ref, selectDrag.from, to);
        selectDrag = null;
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      }
      if (e.pointerType === 'touch') {
        const tp = touchPts.get(e.pointerId);
        touchEnd(e);
        if (painting) {
          painting = false;
          commitPaintStroke(doc.docId);
          return;
        }
        // Tap: place the brush, or select/deselect with the Select tool.
        if (tp && !tp.moved && touchPts.size === 0) {
          const live = useEditor.getState().docs[doc.docId];
          const pt = pointerPoint(e);
          if (!pt) return;
          if (live?.kind === 'world' && live.tool === SELECT_TOOL_ID) {
            const hit = pickAt(live, pt.px);
            if (hit) selectPlacement(doc.docId, hit);
            else clearSelection(doc.docId);
            return;
          }
          if (live?.kind === 'world' && live.tool === 'eraser') {
            erasePicked(live, pt.px);
            return;
          }
          hoverRef.current = pt;
          publishSnapHeight(pt.px);
          const a = anchorAt(pt.px);
          placeAt(doc.docId, a.x, a.z, a.y);
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
      if (painting) {
        painting = false;
        commitPaintStroke(doc.docId);
      }
      if (e.pointerType === 'touch') touchEnd(e);
    };
    const onLeave = (): void => {
      hoverRef.current = null;
      publishSnapHeight(null);
    };
    const onContext = (e: Event): void => e.preventDefault();

    // Trackpad-native convention: a plain wheel event (two-finger scroll)
    // pans by the scroll delta — the content follows the fingers — while
    // a ctrl-modified wheel (trackpad pinch, ctrl+scroll) zooms around
    // the cursor. Native listener so preventDefault works.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
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
      for (const [, entry] of players) entry.player.release();
      renderer.dispose();
    };
    // spriteSet identity changes only when the document's layers change,
    // which re-uploads the sprite texture arrays.
  }, [doc.docId, spriteSet]);

  // World-editor shortcuts, active only while this world tab is focused:
  // `E` cycles the brush through its available directions (wrapping; the
  // store action no-ops for single-view brushes); Ctrl/Cmd+Z undoes and
  // Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y redo the document's world edits. Form
  // controls keep the keys for typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const typing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
        if (typing) return;
        e.preventDefault();
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) redoWorld(doc.docId);
          else undoWorld(doc.docId);
        } else {
          redoWorld(doc.docId);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (typing) return;
        clearSelection(doc.docId);
        return;
      }
      if (e.key !== 'e' && e.key !== 'E') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing) return;
      // With the Select tool holding a sprite, E rotates that sprite;
      // otherwise it cycles the active brush's direction.
      const live = useEditor.getState().docs[doc.docId];
      if (live?.kind === 'world' && live.tool === SELECT_TOOL_ID) {
        void cycleSelectedSpriteDir(doc.docId).then((rotated) => {
          if (!rotated) void cycleBrushDir(doc.docId);
        });
        return;
      }
      void cycleBrushDir(doc.docId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc.docId]);

  const connected = useWorkspace((s) => s.state.kind) === 'connected';
  const sprites = useProject((s) => s.sprites);
  const worlds = useProject((s) => s.worlds);
  const setStatus = useEditor((s) => s.setStatus);
  const activeTool = doc.tool;
  // Placement mode: any tool that places a brush (a primitive/sprite/
  // character id, or '' while no brush is chosen yet) — every tool except
  // the special ones. Only here do the brush dropdown and the snap
  // toggle apply; hiding them never resets their stored state.
  const placementMode =
    activeTool !== 'eraser' &&
    activeTool !== SELECT_TOOL_ID &&
    activeTool !== POINT_LIGHT_TOOL_ID &&
    activeTool !== TERRAIN_PAINT_TOOL_ID;

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
    const character = {
      value: `c:${CHARACTER_BRUSH_ID}`,
      label: CHARACTER_BRUSH_ID,
      kind: 'character' as const,
      brush: { kind: 'character' as const },
    };
    const spriteEntries = (connected ? sprites : []).map((fileName) => {
      const id = fileName.replace(/\.(sprite|zip)$/i, '');
      return {
        value: `s:${fileName}`,
        label: id,
        kind: 'sprite' as const,
        brush: { kind: 'sprite' as const, id, fileName },
      };
    });
    return [...primitives, character, ...spriteEntries];
  }, [connected, sprites]);
  const selectedEntry = brushEntries.find((e) => e.label === activeTool);

  // The active brush's placeable directions; more than one means a
  // multi-view sprite brush — the only case the direction control and
  // the E key act on.
  const brushDirs = useMemo(
    () =>
      activeTool && activeTool !== 'eraser' ? brushDirections(doc, activeTool) : [],
    [doc, activeTool],
  );
  const dirValue = brushDirs.includes(doc.brushDir) ? doc.brushDir : brushDirs[0] ?? 'n';
  const multiView = brushDirs.length > 1;
  const dirLabel = multiView ? ` (${dirValue.toUpperCase()})` : '';

  const [saveDialog, setSaveDialog] = useState(false);

  /** Disconnected fallback shared by save and save-as: name + prompt save. */
  const saveViaPrompt = (): void => {
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

  const onSaveWorld = (): void => {
    // Already backed by a workspace file: write it in place — no dialog.
    if (connected && doc.ref) {
      void saveWorld(doc.docId);
      return;
    }
    // Connected but never saved: pick a name/folder in the workspace file
    // dialog. Otherwise keep the plain-name prompt (and no-workspace
    // behavior unchanged).
    if (connected) {
      setSaveDialog(true);
      return;
    }
    saveViaPrompt();
  };

  const onSaveWorldAs = (): void => {
    if (connected) {
      setSaveDialog(true);
      return;
    }
    saveViaPrompt();
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
      {saveDialog ? (
        <WorkspaceFileDialog
          mode="save"
          folder="worlds"
          title="Save world"
          defaultName={
            doc.ref
              ? doc.ref.title.replace(/\.json$/i, '')
              : suggestWorldName(worlds)
          }
          onAccept={(path) => {
            setSaveDialog(false);
            void saveWorld(doc.docId, path);
          }}
          onClose={() => setSaveDialog(false)}
        />
      ) : null}
      <EditorToolbar>
        <button
          className="icon-btn"
          disabled={!connected}
          title={
            connected
              ? "Save — write an already-saved world back to its workspace file, otherwise pick a location in the workspace's worlds/ folder"
              : 'Connect a workspace to save the world'
          }
          onClick={onSaveWorld}
        >
          <IconSave />
        </button>
        <button
          className="icon-btn"
          disabled={!connected}
          title="Save as — pick a name and folder in the workspace's worlds/ folder"
          onClick={onSaveWorldAs}
        >
          <IconSaveAs />
        </button>
        <button
          className="icon-btn"
          disabled={!doc.history.canUndo}
          title="Undo the last world edit (Ctrl+Z)"
          onClick={() => undoWorld(doc.docId)}
        >
          <IconUndo />
        </button>
        <button
          className="icon-btn"
          disabled={!doc.history.canRedo}
          title="Redo the last undone world edit (Ctrl+Shift+Z)"
          onClick={() => redoWorld(doc.docId)}
        >
          <IconRedo />
        </button>
        <span className="toolbar-separator" aria-hidden="true" />
        {placementMode ? (
          <>
            <select
              aria-label="Placement brush"
              title="Placement brush — built-in primitives and workspace sprites"
              value={selectedEntry?.value ?? ''}
              onChange={(e) => {
                // Release focus: a focused select would both keep the E-key
                // shortcut ignored and let the browser's select types-ahead
                // treat E as "jump to the option starting with E".
                e.currentTarget.blur();
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
              <optgroup label="Character">
                {brushEntries
                  .filter((b) => b.kind === 'character')
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
              className={`icon-btn${doc.surfaceSnap ? ' active' : ''}`}
              title="Surface snap — placements take their height from the visible surface under the cursor (off: use the height field / shift+mouse-move height)"
              onClick={() => setSurfaceSnap(doc.docId, !doc.surfaceSnap)}
            >
              <IconSnap />
            </button>
          </>
        ) : null}
        <span className="hint">
          {activeTool === 'eraser'
            ? 'eraser'
            : activeTool === SELECT_TOOL_ID
              ? 'select'
              : activeTool === TERRAIN_PAINT_TOOL_ID
                ? `paint (slot ${doc.paintSlot + 1})`
                : activeTool === ''
                  ? 'no brush'
                  : `${activeTool}${dirLabel}`}
        </span>
      </EditorToolbar>
      <div className="world-viewport" ref={viewportRef}>
        <div className="tool-bar" role="toolbar" aria-label="World editor tools">
          <button
            className={`icon-btn${activeTool === SELECT_TOOL_ID ? ' active' : ''}`}
            title="Select — click a sprite, character, or light to select it (sprite picks are pixel-accurate); drag to move it, Escape/empty-click to deselect"
            onClick={() => setTool(doc.docId, SELECT_TOOL_ID)}
          >
            <IconSelect />
          </button>
          <button
            className={`icon-btn${placementMode ? ' active' : ''}`}
            title="Placement tool — left-click/drag places the selected brush, right-click erases"
            onClick={() => setTool(doc.docId, lastBrush.current)}
          >
            <IconPencil />
          </button>
          <button
            className={`icon-btn${activeTool === POINT_LIGHT_TOOL_ID ? ' active' : ''}`}
            title="Point light — click places a light (position, radius, energy, color in the properties panel), click a light to select it, right-click erases"
            onClick={() => setTool(doc.docId, POINT_LIGHT_TOOL_ID)}
          >
            <IconLight />
          </button>
          <button
            className={`icon-btn${activeTool === TERRAIN_PAINT_TOOL_ID ? ' active' : ''}`}
            title="Terrain paint — drag over the ground to paint the active material slot (radius, hardness, and slots in the properties panel)"
            onClick={() => setTool(doc.docId, TERRAIN_PAINT_TOOL_ID)}
          >
            <IconPaint />
          </button>
          <button
            className={`icon-btn${activeTool === 'eraser' ? ' active' : ''}`}
            title="Eraser — left-click/drag removes placements"
            onClick={() => setTool(doc.docId, 'eraser')}
          >
            <IconEraser />
          </button>
        </div>
        <div className="layer-controls" ref={layerPanelRef}>
          <button
            className={`icon-btn${layersOpen ? ' active' : ''}`}
            title="Layers — show or hide the ground, sprites, and meshes"
            aria-haspopup="menu"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((o) => !o)}
          >
            <IconLayers />
          </button>
          {layersOpen ? (
            <div className="layer-menu" role="menu" aria-label="Viewport layers">
              {(
                [
                  ['ground', 'Ground'],
                  ['sprites', 'Sprites'],
                  ['meshes', 'Meshes'],
                ] as const
              ).map(([layer, label]) => {
                const visible = doc.layerVisibility[layer];
                return (
                  <button
                    key={layer}
                    role="menuitemcheckbox"
                    aria-checked={visible}
                    className={`layer-row${visible ? ' on' : ''}`}
                    title={`${label} layer — ${visible ? 'visible; click to hide' : 'hidden; click to show'}`}
                    onClick={() => setLayerVisibility(doc.docId, layer, !visible)}
                  >
                    <span className="layer-check" aria-hidden="true">
                      {visible ? '✓' : ''}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
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
          : activeTool === SELECT_TOOL_ID
            ? 'tool: select — click a placement to select, drag to move, Escape/empty-click deselects'
            : activeTool === TERRAIN_PAINT_TOOL_ID
              ? 'tool: terrain paint — left-click/drag paints the active material slot; radius/hardness/slots live in the properties panel'
              : activeTool === ''
                ? 'pick a brush above — left-click/drag places it, right-click erases'
                : `tool: ${activeTool}${dirLabel} — left-click/drag places, right-click erases`}
        {' — E cycles the brush direction, shift+move sets the placement height, brush height/shadow/direction live in the properties panel, scroll pans, pinch zooms, middle-drag pans'}
      </p>
    </div>
  );
}
