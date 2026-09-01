// `AmbientOcclusionMaterial` ships in three-gpu-pathtracer's source tree but
// is not re-exported from the package root in the pinned release (0.0.24), so
// it is imported via the package's "./src/*" export path, which has no types.
// This ambient declaration supplies the surface we consume; members mirror
// src/materials/surface/AmbientOcclusionMaterial.js.
declare module 'three-gpu-pathtracer/src/materials/surface/AmbientOcclusionMaterial.js' {
  import type { ShaderMaterial } from 'three';
  import type { MeshBVHUniformStruct } from 'three-mesh-bvh';

  export class AmbientOcclusionMaterial extends ShaderMaterial {
    bvh: MeshBVHUniformStruct;
    radius: number;
    seed: number;
    normalMap: unknown;
    normalScale: unknown;
    setDefine(name: string, value: unknown): void;
    dispose(): void;
  }
}
