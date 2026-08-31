import { BufferGeometry, SphereGeometry, TorusGeometry } from 'three';

export interface Primitive {
  id: string;
  label: string;
  albedoHex: number;
  geometry: BufferGeometry;
}

let sphere: Primitive | null = null;
let donut: Primitive | null = null;

export function getSphere(): Primitive {
  if (!sphere) {
    sphere = {
      id: 'sphere',
      label: 'Sphere',
      albedoHex: 0xc0563f,
      geometry: new SphereGeometry(0.42, 96, 64),
    };
  }
  return sphere;
}

export function getDonut(): Primitive {
  if (!donut) {
    const geometry = new TorusGeometry(0.34, 0.12, 64, 128);
    geometry.rotateX(-Math.PI / 2);
    donut = {
      id: 'donut',
      label: 'Donut',
      albedoHex: 0x3f7fc0,
      geometry,
    };
  }
  return donut;
}
