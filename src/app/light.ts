import type { LightParams } from '../runtime/renderer.js';
import type { LightState } from './document.js';

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function srgbHexToLinearRgb(hex: string): [number, number, number] {
  return [
    srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255),
    srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255),
    srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255),
  ];
}

/**
 * Dynamic light parameters for the compositor. The global switch pins
 * shading to identity when disabled — sprites show the pure prerendered
 * image, the ground its flat vertex color.
 */
export function lightParams(light: LightState): LightParams {
  if (!light.enabled) {
    return { dir: [0, 1, 0], key: [0, 0, 0], ambient: [1, 1, 1] };
  }
  const az = (light.azimuthDeg * Math.PI) / 180;
  const el = (light.elevationDeg * Math.PI) / 180;
  const dir: [number, number, number] = [
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az),
  ];
  const kr = srgbHexToLinearRgb(light.colorHex);
  return {
    dir,
    key: [kr[0] * light.intensity, kr[1] * light.intensity, kr[2] * light.intensity],
    ambient: srgbHexToLinearRgb(light.ambientHex),
  };
}
