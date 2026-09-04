import { OrthographicCamera, Vector3 } from 'three';
import {
  ISO_AZIMUTH_DEG,
  ISO_ELEVATION_DEG,
  VIEW_DIR,
  depthRange,
  type Vec3,
} from '../shared/iso.js';

export { ISO_AZIMUTH_DEG, ISO_ELEVATION_DEG, depthRange };
export type { Vec3 };

export const ISO_VIEW_DIR = new Vector3(VIEW_DIR[0], VIEW_DIR[1], VIEW_DIR[2]);

const DEG2RAD = Math.PI / 180;
const CAMERA_DISTANCE = 4;

export interface IsoFrame {
  camera: OrthographicCamera;
  width: number;
  height: number;
  originPx: [number, number];
  /** Unit view direction the frame's depth axis is measured against. */
  viewDir: Vector3;
}

export function isoDirection(azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = azimuthDeg * DEG2RAD;
  const el = elevationDeg * DEG2RAD;
  return new Vector3(
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az),
  );
}

export function reconstructWorldPos(
  frame: IsoFrame,
  pixelX: number,
  pixelY: number,
  depth: number,
  out = new Vector3(),
): Vector3 {
  const ndcX = (pixelX / frame.width) * 2 - 1;
  const ndcY = 1 - (pixelY / frame.height) * 2;
  const vx = (ndcX * (frame.camera.right - frame.camera.left) + (frame.camera.right + frame.camera.left)) / 2;
  const vy = (ndcY * (frame.camera.top - frame.camera.bottom) + (frame.camera.top + frame.camera.bottom)) / 2;
  out.set(vx, vy, 0).applyMatrix4(frame.camera.matrixWorld);
  const t = depth - out.dot(frame.viewDir);
  return out.addScaledVector(frame.viewDir, t);
}

export function frameIsoBox(
  size: Vec3,
  pxPerUnit: number,
  padPx: number,
  azimuthDeg: number = ISO_AZIMUTH_DEG,
): IsoFrame {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2 + 1);
  const dir = isoDirection(azimuthDeg, ISO_ELEVATION_DEG);
  const center = new Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
  camera.up.set(0, 1, 0);
  camera.position.copy(center).addScaledVector(dir, CAMERA_DISTANCE);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const corner = new Vector3(
      (i & 1) * size[0],
      ((i >> 1) & 1) * size[1],
      ((i >> 2) & 1) * size[2],
    );
    corner.applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
  }

  const pad = padPx / pxPerUnit;
  camera.left = minX - pad;
  camera.right = maxX + pad;
  camera.bottom = minY - pad;
  camera.top = maxY + pad;
  camera.updateProjectionMatrix();

  const width = Math.round((camera.right - camera.left) * pxPerUnit);
  const height = Math.round((camera.top - camera.bottom) * pxPerUnit);

  const origin = new Vector3(0, 0, 0).project(camera);
  const originPx: [number, number] = [
    (origin.x * 0.5 + 0.5) * width,
    (1 - (origin.y * 0.5 + 0.5)) * height,
  ];

  return { camera, width, height, originPx, viewDir: dir.clone() };
}

/** A point in sprite-pixel space ([x, y], top-down like `originPx`). */
export type PxPoint = [number, number];

/** A line segment between two sprite-pixel points. */
export type PxSegment = [PxPoint, PxPoint];

/** Sprite-pixel projection of a bake box in the fixed isometric frame. */
export interface BoxFrameProjection {
  /** Padded frame size in px — equals the bake sprite rect. */
  width: number;
  height: number;
  /** The 12 box edges. */
  edges: PxSegment[];
  /** World origin (box min corner); equals the frame's `originPx`. */
  origin: PxPoint;
  /** Origin-adjacent box edges along +X/+Y/+Z. */
  axes: { x: PxSegment; y: PxSegment; z: PxSegment };
}

/** Corner index pairs (bit 0 = x, bit 1 = y, bit 2 = z) forming the 12 edges. */
const BOX_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
];

/**
 * Project a bake box into sprite pixels using the same padded isometric
 * frame the bake (and the realtime view) frames it with. Pure math — no
 * render — so the editor can draw the box overlay and preview the sprite
 * pixel size without touching the GPU.
 */
export function projectBoxFrame(
  size: Vec3,
  pxPerUnit: number,
  padPx: number,
  azimuthDeg: number = ISO_AZIMUTH_DEG,
): BoxFrameProjection {
  const frame = frameIsoBox(size, pxPerUnit, padPx, azimuthDeg);
  const pixels: PxPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const corner = new Vector3(
      (i & 1) * size[0],
      ((i >> 1) & 1) * size[1],
      ((i >> 2) & 1) * size[2],
    );
    const v = corner.project(frame.camera);
    pixels.push([
      (v.x * 0.5 + 0.5) * frame.width,
      (1 - (v.y * 0.5 + 0.5)) * frame.height,
    ]);
  }
  const edges = BOX_EDGES.map(
    ([a, b]) => [pixels[a], pixels[b]] as PxSegment,
  );
  return {
    width: frame.width,
    height: frame.height,
    edges,
    origin: frame.originPx,
    axes: {
      x: [pixels[0], pixels[1]],
      y: [pixels[0], pixels[2]],
      z: [pixels[0], pixels[4]],
    },
  };
}
