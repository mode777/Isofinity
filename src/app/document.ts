import type { BakeProvenance } from '../bake/bundle.js';
import type { BakeResult } from '../bake/bake.js';
import type { GltfSource } from '../bake/gltf.js';
import type { PtEnvironment, PtImage, PtSettings } from '../bake/pt.js';
import type { SpriteLayer } from '../runtime/assets.js';
import type { HistoryStack } from '../runtime/history.js';
import type { CharacterAsset } from '../runtime/meshAsset.js';
import type { World } from '../runtime/world.js';
import type { ViewSlot, Vec3 } from '../shared/iso.js';

export type PrimitiveKind =
  | 'sphere'
  | 'donut'
  | 'cube'
  | 'cylinder'
  | 'capsule'
  | 'plane'
  | 'slab';

export const PRIMITIVE_KINDS: PrimitiveKind[] = [
  'sphere',
  'donut',
  'cube',
  'cylinder',
  'capsule',
  'plane',
  'slab',
];

/** Where a sprite document's geometry comes from. */
export type BakeSource =
  | { kind: 'primitive'; primitive: PrimitiveKind }
  | { kind: 'model'; fileName: string };

/** Where a sprite document's render-pass environment comes from. */
export type EnvSource = { kind: 'procedural' } | { kind: 'hdri'; fileName: string };

/** The sprite viewport's views (one displayed at a time). */
export type BakeViewMode = 'realtime' | 'normals' | 'depth' | 'render';

/**
 * Sprite viewport zoom/pan. `zoom` is the image-native scale (1 = 100%);
 * `panX`/`panY` offset the image's top-left corner in viewport pixels.
 * Null means "fit" — resolved per view against the current panel size.
 */
export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface LightState {
  azimuthDeg: number;
  elevationDeg: number;
  intensity: number;
  colorHex: string;
  ambientHex: string;
  enabled: boolean;
}

export interface SunState {
  hour: number;
  day: number;
  lat: number;
}

export const DEFAULT_LIGHT: LightState = {
  azimuthDeg: 60,
  elevationDeg: 45,
  intensity: 1.2,
  colorHex: '#fff1dd',
  ambientHex: '#a8a8a8',
  enabled: true,
};

export const DEFAULT_SUN: SunState = { hour: 12, day: 80, lat: 45 };

/** Defaults for newly placed point lights (editable per light afterwards). */
export interface PointLightDefaults {
  radius: number;
  energy: number;
  colorHex: string;
}

export const DEFAULT_POINT_LIGHT: PointLightDefaults = {
  radius: 3,
  energy: 1,
  colorHex: '#ffd9a0',
};

/** Identity of the file/builtin a document was opened from or saved as. */
export interface ResourceRef {
  /** Dedupe key; opening a resource with an already-open key focuses it. */
  key: string;
  title: string;
}

/** A view slot's baked passes (g-buffer + optional render). */
export interface ViewPasses {
  result: BakeResult;
  render: PtImage | null;
}

export interface BakeDocument {
  kind: 'bake';
  docId: string;
  ref: ResourceRef | null;
  dirty: boolean;
  title: string;
  /** Null when the document was opened without provenance (view-only). */
  source: BakeSource | null;
  /** Live parsed model for `source.kind === 'model'`. */
  gltf: GltfSource | null;
  scale: number;
  /**
   * Authored placement anchor, in the N view's asset space measured from
   * the box min corner (the default `(0,0,0)` anchors the min corner).
   * Persisted state: it travels in the bundle's provenance and shapes every
   * baked view's `originPx` (see ADR 0008).
   */
  origin: Vec3;
  env: EnvSource;
  /** Live environment (texture + params) used by the path tracer. */
  ptEnv: PtEnvironment;
  settings: PtSettings;
  /**
   * Grounding-shadow toggle: bakes a soft ground darkening into the render
   * pass's empty pixels (default on). Persisted state — provenance records
   * `groundShadow: false` when disabled (omitted at the on default).
   */
  groundShadow: boolean;
  /** North view's g-buffer — the default slot, and what worlds consume. */
  result: BakeResult | null;
  /** North view's path-traced lit render. */
  render: PtImage | null;
  /**
   * Baked passes of the non-default slots (e/s/w); the north slot never
   * appears here — its passes live in `result`/`render`.
   */
  extraViews: Partial<Record<ViewSlot, ViewPasses>>;
  /**
   * View slot the viewport displays and per-slot bake actions target.
   * In-memory editor state only — never written into bundles.
   */
  activeSlot: ViewSlot;
  /**
   * Live preview of an in-flight render pass (low-res, partial
   * accumulation). Editor-only state — never written into bundles; the
   * viewport shows it in place of the committed render while `busy`.
   */
  preview: PtImage | null;
  /** Notes about skipped glTF content for the current source. */
  notes: string[];
  /**
   * Original bundle bytes while the document displays an opened bundle
   * without a re-bake; save-as writes these verbatim.
   */
  bundleBytes: Uint8Array<ArrayBuffer> | null;
  /** Restored provenance from an opened `/5` bundle. */
  provenance: BakeProvenance | null;
  /** True when the document cannot re-bake (no provenance / missing refs). */
  viewOnly: boolean;
  /** Human-readable reason the document is view-only. */
  viewOnlyReason: string | null;
  /** True while a path-traced pass is accumulating. */
  busy: boolean;
  /**
   * Active viewport view; null = default (first available). In-memory
   * editor state only — never written into bundles.
   */
  view: BakeViewMode | null;
  /**
   * Viewport zoom/pan per view; a missing entry = fit for that view. The
   * views use different baselines (2D: zoom 1 = image-native pixels;
   * Realtime 3D: zoom 1 = the framed mesh), so each keeps its own
   * transform. In-memory editor state only — never written into bundles.
   */
  viewTransforms: Partial<Record<BakeViewMode, ViewTransform>>;
  /**
   * Viewport bounding-box overlay toggle. In-memory editor state only —
   * never written into bundles.
   */
  boxOverlay?: boolean;
  /**
   * Viewport human-scale reference toggle (Realtime 3D view). In-memory
   * editor state only — never written into bundles.
   */
  humanReference?: boolean;
  /**
   * Ground position (world x/z) of the human reference figure; null/absent
   * = the default spot beside the yaw-rotated box. In-memory editor state
   * only — never written into bundles.
   */
  humanRefPos?: [number, number] | null;
}

/** Display parameters of the environment the SH probe was built from. */
export interface EnvDisplayParams {
  rotationDeg: number;
  intensity: number;
  exposure: number;
  saturation: number;
}

/** Number of material slots the ground binds and paints at once. */
export const GROUND_MATERIAL_SLOTS = 4;

/**
 * Painted-coverage persistence descriptor. `file` is the coverage PNG's
 * name in the workspace's worlds/ folder (null until the world is saved);
 * `texelsPerUnit` fixes the splat resolution to world units. Persisted in
 * `isoinfinity-world/8`; the pixel data itself is the engine mirror below.
 */
export interface GroundPaintState {
  file: string | null;
  texelsPerUnit: number;
}

/**
 * The ground plane's material state. `materials` (up to four file names in
 * the workspace's materials/ folder, one per slot), `tileScale` (tiles per
 * world unit), `width`/`depth` (the ground plane's extent in world units,
 * from the fixed origin corner toward +x/+z), and `paint` persist in world
 * files; `maps` (decoded materials) and the splat mirror are engine objects
 * the renderer uploads — never serialized (ADR 0006).
 */
export interface GroundState {
  /** Bound material file names, one per slot (`null` = unbound). */
  materials: (string | null)[];
  tileScale: number;
  /** Ground extent in world units along +x, from the origin corner. */
  width: number;
  /** Ground extent in world units along +z, from the origin corner. */
  depth: number;
  /** Decoded materials, in slot order (engine objects, never serialized). */
  maps: (import('./groundMaterial.js').GroundMaterialMaps | null)[];
  /** Coverage persistence descriptor, or null before anything is painted. */
  paint: GroundPaintState | null;
  /**
   * CPU coverage mirror (RGBA8, `splatWidth * splatHeight * 4`): rgb =
   * material slots 0-2, alpha = slot 3. Engine object — the source of truth
   * for painting, undo, save, and resize; never serialized (ADR 0006).
   */
  splat: Uint8Array | null;
  splatWidth: number;
  splatHeight: number;
  /** Bumped on every splat change so the renderer re-uploads. */
  splatRevision: number;
  /**
   * Dirty texel rectangle of the last splat change ({x, y, w, h}), or null
   * when the renderer is in sync. Engine bookkeeping — never serialized.
   */
  splatDirty: { x: number; y: number; w: number; h: number } | null;
}

/** Default tiling: one material tile per 10 world units. */
export const DEFAULT_GROUND_TILE_SCALE = 0.1;

/** Default ground extent (the historical 12 × 12 grid). */
export const DEFAULT_GROUND_WIDTH = 12;
export const DEFAULT_GROUND_DEPTH = 12;

// Coverage-splat math lives in `src/shared/splat.ts` (pure, Node-verifiable)
// and is re-exported here for the editor's convenience.
export {
  DEFAULT_PAINT_TEXELS_PER_UNIT,
  MAX_SPLAT_DIM,
  defaultSplatBytes,
  splatDimensions,
} from '../shared/splat.js';

/** Default terrain-paint brush radius in world units. */
export const DEFAULT_PAINT_RADIUS = 1;

/**
 * Terrain-paint hardness and its control range. The falloff's flat core is
 * `radius × hardness`, so useful values are small: 0.01 is mid-range and
 * anything past ~0.02 reads as a hard edge.
 */
export const DEFAULT_PAINT_HARDNESS = 0.01;
export const PAINT_HARDNESS_MIN = 0;
export const PAINT_HARDNESS_MAX = 0.02;
export const PAINT_HARDNESS_STEP = 0.001;

/**
 * Clamp a ground-size axis to the accepted range: whole world units in
 * 1–128. Non-finite input falls back to the given default.
 */
export function clampGroundSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(128, Math.max(1, Math.round(value)));
}

export function defaultGroundState(): GroundState {
  return {
    materials: new Array<string | null>(GROUND_MATERIAL_SLOTS).fill(null),
    tileScale: DEFAULT_GROUND_TILE_SCALE,
    width: DEFAULT_GROUND_WIDTH,
    depth: DEFAULT_GROUND_DEPTH,
    maps: new Array(GROUND_MATERIAL_SLOTS).fill(null),
    paint: null,
    splat: null,
    splatWidth: 0,
    splatHeight: 0,
    splatRevision: 0,
    splatDirty: null,
  };
}

/** A selected placement's identity (kind + stable placement id). */
export interface PlacementRef {
  kind: 'sprite' | 'mesh' | 'light';
  id: number;
}

/** The world layers the viewport can hide/show individually. */
export type WorldLayer = 'ground' | 'sprites' | 'meshes';

/**
 * Per-layer viewport visibility. In-memory editor state only — never
 * written into world files and never undoable (ADR 0006).
 */
export interface LayerVisibility {
  ground: boolean;
  sprites: boolean;
  meshes: boolean;
}

/** All layers visible — the default for new and opened worlds. */
export const ALL_LAYERS_VISIBLE: LayerVisibility = {
  ground: true,
  sprites: true,
  meshes: true,
};

export interface WorldDocument {
  kind: 'world';
  docId: string;
  ref: ResourceRef | null;
  dirty: boolean;
  title: string;
  world: World;
  layers: SpriteLayer[];
  light: LightState;
  sun: SunState;
  /**
   * The parsed skinned character behind the built-in character brush.
   * Engine objects on the document (like a bake document's `gltf`); never
   * serialized. Null until the brush is picked.
   */
  character: CharacterAsset | null;
  /**
   * The environment the sprites' render passes were baked with, taken
   * from the first loaded bundle's provenance; null = none captured (the
   * probe falls back to the built-in default). In-memory only.
   */
  env: EnvSource | null;
  /** Display parameters accompanying `env` (provenance values). */
  envParams: EnvDisplayParams | null;
  /**
   * Diffuse SH irradiance probe (27 floats) derived from `env`; null
   * until computed. In-memory only.
   */
  shProbe: Float32Array | null;
  /**
   * User-selected world environment (HDRI in hdri/); null = inherit the
   * environment from sprite bake provenance (`env`). Overrides `env` for
   * the ambient probe and the ground. Persisted when user-selected.
   */
  userEnv: EnvSource | null;
  /** Ground plane material state (see `GroundState`). */
  ground: GroundState;
  /**
   * Terrain paint brush radius in world units. In-memory editor state only
   * — never written into world files (ADR 0006).
   */
  paintRadius: number;
  /** Terrain paint brush hardness in [0, 1] (0 soft, 1 hard). In-memory. */
  paintHardness: number;
  /** Material slot the paint brush paints (0-3). In-memory editor state. */
  paintSlot: number;
  /**
   * Active placement tool: '' = pencil with no brush chosen, a brush id
   * (sprite layer id or primitive id), a special tool id, or 'eraser'.
   */
  tool: string;
  /**
   * Placement height of the current brush (world units; may be negative,
   * sinking below the ground plane), adjusted with shift+wheel. Overridden
   * by surface snap while that is on. In-memory editor state only — never
   * written into world files.
   */
  heightLevel: number;
  /**
   * Surface snap: placements take their height from the visible surface
   * under the cursor instead of `heightLevel`. In-memory editor state
   * only — never written into world files.
   */
  surfaceSnap: boolean;
  /**
   * The height surface snap last read under the cursor (the eyedropper
   * value shown in the height field while snap is on); null = no read
   * yet (snap off, or the cursor left the viewport). Transient editor
   * chrome — never written into world files and never marks the
   * document dirty.
   */
  snappedHeight: number | null;
  /**
   * Which way the current brush faces (its baked view slot). Only
   * meaningful for multi-view sprite brushes; affects the ghost preview
   * and the direction of new placements. In-memory editor state only —
   * never written into world files.
   */
  brushDir: ViewSlot;
  /**
   * Grounding-shadow strength for new placements (0 = off, 1 = full),
   * like the brush height level: set before placing, carried by each
   * placement, persisted per placement in `isoinfinity-world/5` (omitted
   * at the default 1). The value itself is in-memory editor state.
   */
  shadowLevel: number;
  /**
   * Viewport zoom/pan over the fixed projected world image; null = fit
   * (the whole ground plane letterboxed in the panel). In-memory editor
   * state only — never written into world files.
   */
  viewTransform: ViewTransform | null;
  /**
   * Which world layers the viewport hides (ground, sprites, meshes).
   * Hidden layers are not drawn, not pickable, and supply no surface-snap
   * heights; hiding changes no world content. In-memory editor state
   * only — never written into world files and never undoable (ADR 0006).
   */
  layerVisibility: LayerVisibility;
  /**
   * The placement the Select tool (or the point-light tool's click) has
   * selected: a sprite, mesh, or point light by stable placement id; null
   * = none. In-memory editor state only — never written into world files
   * (ADR 0006).
   */
  selection: PlacementRef | null;
  /**
   * Undo/redo history of this document's mutating world operations
   * (place/erase sprites, meshes, point lights and light edits). Lives
   * as long as the document (survives tab switches); in-memory editor
   * state only — never written into world files.
   */
  history: HistoryStack;
}

export type EditorDocument = BakeDocument | WorldDocument;

export type EditorKind = EditorDocument['kind'];

export interface Tab {
  docId: string;
  kind: EditorKind;
}
