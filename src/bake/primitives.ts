import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';

export interface Primitive {
  id: string;
  label: string;
  albedoHex: number;
  geometry: BufferGeometry;
}

let sphere: Primitive | null = null;
let donut: Primitive | null = null;
let cube: Primitive | null = null;
let cylinder: Primitive | null = null;
let capsule: Primitive | null = null;

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

export function getCube(): Primitive {
  if (!cube) {
    cube = {
      id: 'cube',
      label: 'Cube',
      albedoHex: 0x4f9e5c,
      geometry: new BoxGeometry(1, 1, 1),
    };
  }
  return cube;
}

export function getCylinder(): Primitive {
  if (!cylinder) {
    cylinder = {
      id: 'cylinder',
      label: 'Cylinder',
      albedoHex: 0x9e9e3f,
      geometry: new CylinderGeometry(0.35, 0.35, 0.8, 64),
    };
  }
  return cylinder;
}

export function getCapsule(): Primitive {
  if (!capsule) {
    capsule = {
      id: 'capsule',
      label: 'Capsule',
      albedoHex: 0x8a5fc0,
      geometry: new CapsuleGeometry(0.28, 0.34, 8, 64),
    };
  }
  return capsule;
}
