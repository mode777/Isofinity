import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { Texture } from 'three';
import type { Vec3 } from '../shared/iso.js';

/**
 * One draw call of a bake: a geometry plus the albedo source for its
 * material. Primitive sources have no `groups` (single flat-color draw);
 * glTF sources provide one group per material.
 */
export interface MaterialGroup {
  geometry: BufferGeometry;
  /** Base-color texture in sRGB, or null to use `baseColorFactor` alone. */
  albedoTexture: Texture | null;
  /** Linear RGBA multiplier applied to the sampled texture texels. */
  baseColorFactor: [number, number, number, number];
  /** `mask` discards texels below `alphaCutoff`; `opaque` bakes everything. */
  alphaMode: 'opaque' | 'mask';
  alphaCutoff: number;
}

export interface Primitive {
  id: string;
  label: string;
  albedoHex: number;
  size: Vec3;
  geometry: BufferGeometry;
  /** When present, the bake draws these groups instead of `geometry`. */
  groups?: MaterialGroup[];
  /**
   * Uniform scale already included in `size` (glTF sources). Applied as the
   * mesh scale at bake time; primitives keep it at 1.
   */
  scale?: number;
}

let sphere: Primitive | null = null;
let donut: Primitive | null = null;
let cube: Primitive | null = null;
let cylinder: Primitive | null = null;
let capsule: Primitive | null = null;
let plane: Primitive | null = null;
let slab: Primitive | null = null;

export function getSphere(): Primitive {
  if (!sphere) {
    sphere = {
      id: 'sphere',
      label: 'Sphere',
      albedoHex: 0xc0563f,
      size: [1, 1, 1],
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
      size: [1, 1, 1],
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
      size: [1, 1, 1],
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
      size: [1, 1, 1],
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
      size: [1, 1, 1],
      geometry: new CapsuleGeometry(0.28, 0.34, 8, 64),
    };
  }
  return capsule;
}

export function getPlane(): Primitive {
  if (!plane) {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    plane = {
      id: 'plane',
      label: 'Plane',
      albedoHex: 0xc0973f,
      size: [1, 1, 1],
      geometry,
    };
  }
  return plane;
}

export function getSlab(): Primitive {
  if (!slab) {
    slab = {
      id: 'slab',
      label: 'Slab',
      albedoHex: 0x3f9e9e,
      size: [2, 0.5, 1],
      geometry: new BoxGeometry(2, 0.5, 1),
    };
  }
  return slab;
}
