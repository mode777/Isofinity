import type { BakeProvenance } from '../bake/bundle.js';
import type { BakeResult } from '../bake/bake.js';
import type { GltfSource } from '../bake/gltf.js';
import type { PtEnvironment, PtImage, PtSettings } from '../bake/pt.js';
import type { SpriteLayer } from '../runtime/assets.js';
import type { World } from '../runtime/world.js';

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

/** Identity of the file/builtin a document was opened from or saved as. */
export interface ResourceRef {
  /** Dedupe key; opening a resource with an already-open key focuses it. */
  key: string;
  title: string;
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
  env: EnvSource;
  /** Live environment (texture + params) used by the path tracer. */
  ptEnv: PtEnvironment;
  settings: PtSettings;
  result: BakeResult | null;
  render: PtImage | null;
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
}

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
   * Active placement tool: '' = pencil with no brush chosen, a brush id
   * (sprite layer id or primitive id), or 'eraser'.
   */
  tool: string;
}

export type EditorDocument = BakeDocument | WorldDocument;

export type EditorKind = EditorDocument['kind'];

export interface Tab {
  docId: string;
  kind: EditorKind;
}
