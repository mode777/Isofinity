import {
  ColorManagement,
  DataTexture,
  GLSL3,
  HalfFloatType,
  Mesh,
  NearestFilter,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import {
  ISO_AZIMUTH_DEG,
  ISO_ELEVATION_DEG,
  frameIsoBox,
  isoDirection,
} from './iso.js';
import type { Vec3 } from '../shared/iso.js';
import type { MaterialGroup, Primitive } from './primitives.js';

export const PX_PER_UNIT = 128;
export const PAD_PX = 2;

/** Hard cap on either sprite axis; larger models must be scaled down. */
export const MAX_SPRITE_PX = 8192;

ColorManagement.enabled = false;

export interface BakeResult {
  id: string;
  label: string;
  size: Vec3;
  width: number;
  height: number;
  pxPerUnit: number;
  originPx: [number, number];
  camera: { azimuthDeg: number; elevationDeg: number; viewDir: [number, number, number] };
  gbuffer: Float32Array;
}

const VERTEX_SHADER = `
out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec2 vUv;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = mat3(modelMatrix) * normal;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// Coverage sources, selected by uSrgb/uUseMap (alpha only — color data is
// the path-traced render pass's job):
// - uSrgb = 0 (primitives): opaque, coverage 1.
// - uSrgb = 1 (glTF groups): texel alpha (or 1 when uUseMap = 0) multiplied
//   by the factor alpha.
// Alpha: uAlphaMode = 1 (glTF MASK) discards below uAlphaCutoff; everything
// else bakes opaque (coverage 1).
const FRAGMENT_SHADER = `
in vec3 vWorldPos;
in vec3 vWorldNormal;
in vec2 vUv;

uniform vec3 uCubeMin;
uniform vec3 uCubeMax;
uniform vec3 uViewDir;
uniform sampler2D uAlbedoMap;
uniform vec4 uFactor;
uniform int uUseMap;
uniform int uSrgb;
uniform int uAlphaMode;
uniform float uAlphaCutoff;

layout(location = 0) out vec4 outGbuffer;

void main() {
  vec3 cubePos = (vWorldPos - uCubeMin) / (uCubeMax - uCubeMin);
  if (any(lessThan(cubePos, vec3(0.0))) || any(greaterThan(cubePos, vec3(1.0)))) {
    discard;
  }
  float alpha;
  if (uSrgb == 1) {
    vec4 texel = (uUseMap == 1) ? texture(uAlbedoMap, vUv) : vec4(1.0);
    alpha = texel.a * uFactor.a;
  } else {
    alpha = 1.0;
  }
  if (uAlphaMode == 1 && alpha < uAlphaCutoff) {
    discard;
  }
  outGbuffer = vec4(normalize(vWorldNormal), dot(vWorldPos, uViewDir));
}
`;

let renderer: WebGLRenderer | null = null;

function getRenderer(): WebGLRenderer {
  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: false, stencil: false });
  }
  return renderer;
}

// Sampler fallback so the uAlbedoMap uniform is always backed by a valid
// texture (unused when uUseMap = 0).
const WHITE_TEXEL = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE_TEXEL.needsUpdate = true;

function readAttachment(
  r: WebGLRenderer,
  target: WebGLRenderTarget,
  index: number,
  width: number,
  height: number,
): Float32Array {
  const half = new Uint16Array(width * height * 4);
  r.readRenderTargetPixels(target, 0, 0, width, height, half, undefined, index);
  const out = new Float32Array(half.length);
  for (let i = 0; i < half.length; i++) {
    out[i] = halfToFloat(half[i]);
  }
  return out;
}

function halfToFloat(h: number): number {
  const sign = (h & 0x8000) !== 0 ? -1 : 1;
  const exp = (h & 0x7c00) >> 10;
  const frac = h & 0x03ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
  if (exp === 0x1f) return frac === 0 ? sign * Infinity : NaN;
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

/** Decode one half-float bit pattern; shared by the bake readback and the
 *  bundle g-buffer decoder. */
export { halfToFloat };

interface DrawGroup {
  group: MaterialGroup;
  mesh: Mesh;
}

function buildDrawGroups(prim: Primitive): { draws: DrawGroup[]; boxPlacement: boolean } {
  if (!prim.groups) {
    // Legacy primitive: one flat-color draw, geometry centered at the box center.
    const group: MaterialGroup = {
      geometry: prim.geometry,
      albedoTexture: null,
      baseColorFactor: [1, 1, 1, 1],
      alphaMode: 'opaque',
      alphaCutoff: 0,
    };
    const mesh = new Mesh(prim.geometry);
    mesh.position.set(prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2);
    return { draws: [{ group, mesh }], boxPlacement: false };
  }
  // glTF groups: geometry is pre-normalized into the box (min corner at the
  // origin); the uniform scale is applied as the mesh transform.
  const scale = prim.scale ?? 1;
  const draws = prim.groups.map((group) => {
    const mesh = new Mesh(group.geometry);
    mesh.scale.setScalar(scale);
    return { group, mesh };
  });
  return { draws, boxPlacement: true };
}

export function bakePrimitive(
  prim: Primitive,
  pxPerUnit: number = PX_PER_UNIT,
  azimuthDeg: number = ISO_AZIMUTH_DEG,
): BakeResult {
  const r = getRenderer();
  const frame = frameIsoBox(prim.size, pxPerUnit, PAD_PX, azimuthDeg);
  const viewDir = isoDirection(azimuthDeg, ISO_ELEVATION_DEG);
  const { width, height } = frame;
  if (width > MAX_SPRITE_PX || height > MAX_SPRITE_PX) {
    throw new Error(
      `sprite ${width}x${height} px exceeds the ${MAX_SPRITE_PX} px cap — scale the model down`,
    );
  }

  const target = new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: true,
  });

  const { draws, boxPlacement } = buildDrawGroups(prim);
  const scene = new Scene();
  const materials: ShaderMaterial[] = [];
  for (const { group, mesh } of draws) {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uCubeMin: { value: new Vector3(0, 0, 0) },
        uCubeMax: { value: new Vector3(prim.size[0], prim.size[1], prim.size[2]) },
        uViewDir: { value: viewDir.clone() },
        uAlbedoMap: { value: group.albedoTexture ?? WHITE_TEXEL },
        uFactor: { value: new Vector4(...group.baseColorFactor) },
        uUseMap: { value: group.albedoTexture ? 1 : 0 },
        uSrgb: { value: boxPlacement ? 1 : 0 },
        uAlphaMode: { value: group.alphaMode === 'mask' ? 1 : 0 },
        uAlphaCutoff: { value: group.alphaCutoff },
      },
    });
    materials.push(material);
    mesh.material = material;
    scene.add(mesh);
  }

  r.setRenderTarget(target);
  r.setClearColor(0x000000, 0);
  r.clear(true, true, false);
  // One draw call per material group into the shared g-buffer target; the
  // depth buffer resolves occlusion between groups.
  r.render(scene, frame.camera);

  const gbuffer = readAttachment(r, target, 0, width, height);

  r.setRenderTarget(null);
  target.dispose();
  for (const material of materials) material.dispose();
  scene.clear();

  return {
    id: prim.id,
    label: prim.label,
    size: [prim.size[0], prim.size[1], prim.size[2]],
    width,
    height,
    pxPerUnit,
    originPx: frame.originPx,
    camera: {
      azimuthDeg,
      elevationDeg: ISO_ELEVATION_DEG,
      viewDir: [viewDir.x, viewDir.y, viewDir.z],
    },
    gbuffer,
  };
}
