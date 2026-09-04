export const ISO_AZIMUTH_DEG = 45;
export const ISO_ELEVATION_DEG = 30;

/** The fixed bake view slots: successive 90° yaw steps from north. */
export type ViewSlot = 'n' | 'e' | 's' | 'w';
/** Non-default slots; removable, may be absent from a sprite. */
export type ExtraViewSlot = Exclude<ViewSlot, 'n'>;

export const VIEW_SLOTS: readonly ViewSlot[] = ['n', 'e', 's', 'w'];
export const EXTRA_VIEW_SLOTS: readonly ExtraViewSlot[] = ['e', 's', 'w'];

/** A slot's camera azimuth: north is the fixed iso camera, then +90° yaw. */
export function slotAzimuthDeg(slot: ViewSlot): number {
  return ISO_AZIMUTH_DEG + 90 * VIEW_SLOTS.indexOf(slot);
}

const AZ = (ISO_AZIMUTH_DEG * Math.PI) / 180;
const EL = (ISO_ELEVATION_DEG * Math.PI) / 180;
const SA = Math.sin(AZ);
const CA = Math.cos(AZ);
const SE = Math.sin(EL);
const CE = Math.cos(EL);

export type Vec3 = readonly [number, number, number];

export const VIEW_DIR: Vec3 = [CE * CA, SE, CE * SA];
export const SCREEN_RIGHT: Vec3 = [SA, 0, -CA];
export const SCREEN_UP: Vec3 = [-SE * CA, CE, -SE * SA];

export function depthRange(size: Vec3): [number, number] {
  return [
    0,
    Math.abs(VIEW_DIR[0]) * size[0] +
      Math.abs(VIEW_DIR[1]) * size[1] +
      Math.abs(VIEW_DIR[2]) * size[2],
  ];
}

export function groundToScreen(x: number, z: number): [number, number] {
  return [
    SCREEN_RIGHT[0] * x + SCREEN_RIGHT[2] * z,
    SCREEN_UP[0] * x + SCREEN_UP[2] * z,
  ];
}

export function screenToGround(sx: number, sy: number): [number, number] {
  const a11 = SCREEN_RIGHT[0];
  const a12 = SCREEN_RIGHT[2];
  const a21 = SCREEN_UP[0];
  const a22 = SCREEN_UP[2];
  const det = a11 * a22 - a12 * a21;
  const x = (a22 * sx - a12 * sy) / det;
  const z = (-a21 * sx + a11 * sy) / det;
  return [x, z];
}
