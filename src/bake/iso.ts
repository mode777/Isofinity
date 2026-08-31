import { OrthographicCamera, Vector3 } from 'three';

export const ISO_AZIMUTH_DEG = 45;
export const ISO_ELEVATION_DEG = 30;

const DEG2RAD = Math.PI / 180;
const CAMERA_DISTANCE = 4;

export interface IsoFrame {
  camera: OrthographicCamera;
  width: number;
  height: number;
  originPx: [number, number];
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

export const ISO_VIEW_DIR = isoDirection(ISO_AZIMUTH_DEG, ISO_ELEVATION_DEG);

export const DEPTH_RANGE: [number, number] = [
  0,
  Math.abs(ISO_VIEW_DIR.x) + Math.abs(ISO_VIEW_DIR.y) + Math.abs(ISO_VIEW_DIR.z),
];

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
  const t = depth - out.dot(ISO_VIEW_DIR);
  return out.addScaledVector(ISO_VIEW_DIR, t);
}

export function frameIsoCube(pxPerUnit: number, padPx: number): IsoFrame {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2 + 1);
  const dir = isoDirection(ISO_AZIMUTH_DEG, ISO_ELEVATION_DEG);
  const center = new Vector3(0.5, 0.5, 0.5);
  camera.up.set(0, 1, 0);
  camera.position.copy(center).addScaledVector(dir, CAMERA_DISTANCE);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const corner = new Vector3(i & 1, (i >> 1) & 1, (i >> 2) & 1);
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

  return { camera, width, height, originPx };
}
