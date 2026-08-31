import {
  Color,
  ColorManagement,
  GLSL3,
  HalfFloatType,
  Mesh,
  NearestFilter,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import {
  ISO_AZIMUTH_DEG,
  ISO_ELEVATION_DEG,
  ISO_VIEW_DIR,
  frameIsoCube,
} from './iso.js';
import type { Primitive } from './primitives.js';

export const PX_PER_UNIT = 128;
export const PAD_PX = 2;

ColorManagement.enabled = false;

export interface BakeResult {
  id: string;
  label: string;
  albedoHex: number;
  width: number;
  height: number;
  pxPerUnit: number;
  originPx: [number, number];
  camera: { azimuthDeg: number; elevationDeg: number; viewDir: [number, number, number] };
  albedo: Float32Array;
  depth: Float32Array;
  normal: Float32Array;
}

const VERTEX_SHADER = `
out vec3 vWorldPos;
out vec3 vWorldNormal;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT_SHADER = `
in vec3 vWorldPos;
in vec3 vWorldNormal;

uniform vec3 uAlbedo;
uniform vec3 uCubeMin;
uniform vec3 uCubeMax;
uniform vec3 uViewDir;

layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outDepth;
layout(location = 2) out vec4 outNormal;

void main() {
  vec3 cubePos = (vWorldPos - uCubeMin) / (uCubeMax - uCubeMin);
  if (any(lessThan(cubePos, vec3(0.0))) || any(greaterThan(cubePos, vec3(1.0)))) {
    discard;
  }
  outAlbedo = vec4(uAlbedo, 1.0);
  outDepth = vec4(dot(vWorldPos, uViewDir), 0.0, 0.0, 1.0);
  outNormal = vec4(normalize(vWorldNormal), 1.0);
}
`;

let renderer: WebGLRenderer | null = null;

function getRenderer(): WebGLRenderer {
  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: false, stencil: false });
  }
  return renderer;
}

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

export function bakePrimitive(prim: Primitive, pxPerUnit: number = PX_PER_UNIT): BakeResult {
  const r = getRenderer();
  const frame = frameIsoCube(pxPerUnit, PAD_PX);
  const { width, height } = frame;

  const target = new WebGLRenderTarget(width, height, {
    count: 3,
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: true,
  });

  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uAlbedo: { value: new Color(prim.albedoHex) },
      uCubeMin: { value: new Vector3(0, 0, 0) },
      uCubeMax: { value: new Vector3(1, 1, 1) },
      uViewDir: { value: ISO_VIEW_DIR.clone() },
    },
  });

  const mesh = new Mesh(prim.geometry, material);
  mesh.position.set(0.5, 0.5, 0.5);
  const scene = new Scene();
  scene.add(mesh);

  r.setRenderTarget(target);
  r.setClearColor(0x000000, 0);
  r.clear(true, true, false);
  r.render(scene, frame.camera);

  const albedo = readAttachment(r, target, 0, width, height);
  const depth = readAttachment(r, target, 1, width, height);
  const normal = readAttachment(r, target, 2, width, height);

  r.setRenderTarget(null);
  target.dispose();
  material.dispose();
  scene.remove(mesh);

  return {
    id: prim.id,
    label: prim.label,
    albedoHex: prim.albedoHex,
    width,
    height,
    pxPerUnit,
    originPx: frame.originPx,
    camera: {
      azimuthDeg: ISO_AZIMUTH_DEG,
      elevationDeg: ISO_ELEVATION_DEG,
      viewDir: [ISO_VIEW_DIR.x, ISO_VIEW_DIR.y, ISO_VIEW_DIR.z],
    },
    albedo,
    depth,
    normal,
  };
}
