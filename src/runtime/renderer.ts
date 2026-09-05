import { SCREEN_RIGHT, SCREEN_UP, VIEW_DIR } from '../shared/iso.js';
import { SH_IRRADIANCE_GLSL } from './shProbe.js';
import type { MeshGeometry, MeshSurface } from './meshAsset.js';

/** Joint-palette cap, mirroring `meshAsset.ts`. */
export const MAX_MESH_JOINTS = 64;

const SHADE_CHUNK = `
uniform vec3 uLightDir;
uniform vec3 uKeyLight;
uniform vec3 uAmbient;
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 shade(vec3 albedoSrgb, vec3 N) {
  float ndl = max(dot(N, uLightDir), 0.0);
  return linearToSrgb(srgbToLinear(albedoSrgb) * (uAmbient + uKeyLight * ndl));
}
`;

// The fixed iso frame as shader literals, generated from the shared
// constants so CPU projection (sprites) and GPU projection (meshes) can
// never drift apart.
const isoFloat = (n: number): string => n.toPrecision(9);
const ISO_GLSL = `
const vec3 VIEW_DIR = vec3(${isoFloat(VIEW_DIR[0])}, ${isoFloat(VIEW_DIR[1])}, ${isoFloat(VIEW_DIR[2])});
const vec3 SCREEN_RIGHT = vec3(${isoFloat(SCREEN_RIGHT[0])}, ${isoFloat(SCREEN_RIGHT[1])}, ${isoFloat(SCREEN_RIGHT[2])});
const vec3 SCREEN_UP = vec3(${isoFloat(SCREEN_UP[0])}, ${isoFloat(SCREEN_UP[1])}, ${isoFloat(SCREEN_UP[2])});
`;

// Three's ACES filmic fit (the bake tonemap's `tonemapping_fragment`),
// with exposure folded in as uExposure — the mesh path produces the same
// tonemapped texel the path-traced render pass stores.
const ACES_GLSL = `
uniform float uExposure;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  color *= uExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
`;

const FLAT_VERT = `#version 300 es
in vec2 aPos;
in vec4 aColor;   // rgb + per-vertex alpha
uniform vec2 uRes;
uniform vec4 uView;  // view transform: scale.xy, offset.xy (backing-store px)
out vec4 vColor;
void main() {
  vec2 px = aPos * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vColor = aColor;
}
`;

const FLAT_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
${SHADE_CHUNK}
void main() {
  outColor = vec4(shade(vColor.rgb, vec3(0.0, 1.0, 0.0)), vColor.a);
}
`;

const SPRITE_VERT = `#version 300 es
in vec2 aCorner;
in vec4 aInst;   // px.xy, layer, depthOff
in vec4 aInst2;  // quadSize px, sprite texel size
uniform vec2 uRes;
uniform vec2 uMaxSize;
uniform vec4 uView;  // view transform: scale.xy, offset.xy (backing-store px)
out vec2 vUv;
flat out float vLayer;
flat out float vDepthOff;
void main() {
  vec2 px = aInst.xy + aCorner * aInst2.xy;
  px = px * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = mix(vec2(0.5), aInst2.zw - 0.5, aCorner) / uMaxSize;
  vLayer = aInst.z;
  vDepthOff = aInst.w;
}
`;

const SPRITE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uRender;
uniform sampler2DArray uGbuffer;
uniform float uDepthA;
uniform float uDepthB;
in vec2 vUv;
flat in float vLayer;
flat in float vDepthOff;
out vec4 outColor;
${SHADE_CHUNK}
void main() {
  vec4 g = texture(uGbuffer, vec3(vUv, vLayer));
  // G-buffer emptiness is the hard raster coverage: background pixels are
  // all-zero. The render pass's antialiased alpha never drops fragments.
  if (dot(g.rgb, g.rgb) == 0.0) discard;
  float d = g.a + vDepthOff;
  gl_FragDepth = uDepthA * d + uDepthB;
  vec4 r = texture(uRender, vec3(vUv, vLayer));
  outColor = vec4(shade(r.rgb, g.rgb), r.a);
}
`;

// Skinned character mesh: palette skinning in the vertex stage, then the
// same projection/depth/light pipeline the sprite path uses. The screen
// projection inlines the shared iso constants (ISO_GLSL) so CPU-projected
// sprites and GPU-projected meshes can never drift apart.
// Vertices arrive pre-skinned in world space (the CPU pose engine skins
// them — see CharacterPlayer.skinInto); the vertex stage is a pure
// passthrough through the shared iso projection. The GPU-side palette
// blend was dropped: dynamic uniform-array indexing corrupted the mesh on
// the test driver while the identical CPU math verified clean.
const MESH_VERT = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
uniform mat3 uYaw;
uniform vec3 uOrigin;  // placement feet position (world x, y, z)
uniform vec3 uProj;    // world-image origin px (x, y), px per unit
uniform vec2 uRes;
uniform vec4 uView;    // view transform: scale.xy, offset.xy (backing px)
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUv;
${ISO_GLSL}
void main() {
  vec3 wp = uYaw * aPos + uOrigin;
  vWorldPos = wp;
  vNormal = uYaw * aNormal;
  vec2 px = vec2(uProj.x + dot(SCREEN_RIGHT, wp) * uProj.z,
                 uProj.y - dot(SCREEN_UP, wp) * uProj.z);
  px = px * uView.xy + uView.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

// Shades like a baked texel: env-lit albedo through the same ACES + sRGB +
// display-saturation chain the render pass was produced with, then the
// world's dynamic key+ambient exactly as sprites apply it. Depth is the
// shared world linear map — a mesh texel and a sprite texel at the same
// world point write the same window depth.
const MESH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uAlbedo;
uniform vec3 uAlbedoFactor;
uniform float uSaturation;
uniform float uDepthA;
uniform float uDepthB;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUv;
out vec4 outColor;
${SHADE_CHUNK}
${ACES_GLSL}
${SH_IRRADIANCE_GLSL}
${ISO_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 albedo = uAlbedoFactor * srgbToLinear(texture(uAlbedo, vUv).rgb);
  vec3 hdr = albedo * max(shIrradiance(N), vec3(0.0));
  vec3 texel = linearToSrgb(ACESFilmic(hdr));
  float lum = dot(texel, vec3(0.2126, 0.7152, 0.0722));
  texel = mix(vec3(lum), texel, uSaturation);
  outColor = vec4(shade(texel, N), 1.0);
  gl_FragDepth = uDepthA * dot(VIEW_DIR, vWorldPos) + uDepthB;
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export const DEPTH_LINEAR_RANGE = 64;

/**
 * A 2D view transform over the world-projected image: zoom/pan given in
 * backing-store (device) pixels. All vertex data stays in world-image
 * pixels; this transform scales/offsets it at draw time. Structurally
 * compatible with the editor's `ViewTransform`.
 */
export interface RenderView {
  zoom: number;
  panX: number;
  panY: number;
}

const IDENTITY_VIEW: RenderView = { zoom: 1, panX: 0, panY: 0 };

/**
 * One flat-shaded draw batch (the ground grid, contact shadows, or the
 * hover/gizmo overlay): triangle vertices as `[x, y, r, g, b, a]` in
 * world-image pixels.
 */
export interface FlatBatch {
  data: Float32Array;
  verts: number;
}

export interface LightParams {
  dir: [number, number, number];
  key: [number, number, number];
  ambient: [number, number, number];
}

/**
 * One skinned-character draw: CPU-skinned vertex buffers plus the
 * placement's world transform. Opaque, drawn between the shadow and
 * sprite batches.
 */
export interface MeshDraw {
  /** Pre-skinned world-space positions (bind-space * palette). */
  positions: Float32Array;
  /** Pre-skinned world-space normals (same transform). */
  normals: Float32Array;
  /** Feet position in world units. */
  origin: [number, number, number];
  /** Column-major rotation about +Y (`meshYawMat`). */
  yawMat: Float32Array;
}

/** Rotation about +Y as a column-major mat3 (local → world). */
export function meshYawMat(yawRad: number, out: Float32Array = new Float32Array(9)): Float32Array {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  out[0] = c;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = s;
  out[7] = 0;
  out[8] = c;
  return out;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private flatProg: WebGLProgram;
  private spriteProg: WebGLProgram;
  private renderTex: WebGLTexture | null = null;
  private gbufferTex: WebGLTexture | null = null;
  private groundVao: WebGLVertexArrayObject;
  private groundVbo: WebGLBuffer;
  private shadowVao: WebGLVertexArrayObject;
  private shadowVbo: WebGLBuffer;
  private highlightVao: WebGLVertexArrayObject;
  private highlightVbo: WebGLBuffer;
  private spriteVao: WebGLVertexArrayObject;
  private instVbo: WebGLBuffer;
  private meshProg: WebGLProgram;
  private meshVao: WebGLVertexArrayObject;
  private meshPosNorVbo: WebGLBuffer | null = null;
  private meshIbo: WebGLBuffer | null = null;
  private meshAlbedoTex: WebGLTexture | null = null;
  private meshIndexCount = 0;
  private uMeshRes: WebGLUniformLocation;
  private uMeshView: WebGLUniformLocation;
  private uMeshLight: Uniforms3;
  private uMeshYaw: WebGLUniformLocation;
  private uMeshOrigin: WebGLUniformLocation;
  private uMeshProj: WebGLUniformLocation;
  private uMeshSh: WebGLUniformLocation;
  private uMeshExposure: WebGLUniformLocation;
  private uMeshSaturation: WebGLUniformLocation;
  private meshFrame: [number, number, number] = [0, 0, 64];
  private uFlatRes: WebGLUniformLocation;
  private uFlatView: WebGLUniformLocation;
  private uFlatLight: Uniforms3;
  private uSpriteRes: WebGLUniformLocation;
  private uSpriteMaxSize: WebGLUniformLocation;
  private uSpriteView: WebGLUniformLocation;
  private uSpriteLight: Uniforms3;
  private uDepthA: WebGLUniformLocation;
  private uDepthB: WebGLUniformLocation;
  private light: LightParams = {
    dir: [0, 1, 0],
    key: [1, 1, 1],
    ambient: [0.3, 0.3, 0.3],
  };

  constructor(
    canvas: HTMLCanvasElement,
    renderLayers: Uint8Array[],
    gbufferLayers: Uint16Array[],
    maxW: number,
    maxH: number,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      stencil: false,
    });
    if (!gl) {
      throw new Error('WebGL2 unavailable');
    }
    this.gl = gl;

    this.flatProg = link(gl, FLAT_VERT, FLAT_FRAG);
    this.spriteProg = link(gl, SPRITE_VERT, SPRITE_FRAG);
    this.uFlatRes = gl.getUniformLocation(this.flatProg, 'uRes')!;
    this.uFlatView = gl.getUniformLocation(this.flatProg, 'uView')!;
    this.uFlatLight = {
      dir: gl.getUniformLocation(this.flatProg, 'uLightDir')!,
      key: gl.getUniformLocation(this.flatProg, 'uKeyLight')!,
      ambient: gl.getUniformLocation(this.flatProg, 'uAmbient')!,
    };
    this.uSpriteRes = gl.getUniformLocation(this.spriteProg, 'uRes')!;
    this.uSpriteMaxSize = gl.getUniformLocation(this.spriteProg, 'uMaxSize')!;
    this.uSpriteView = gl.getUniformLocation(this.spriteProg, 'uView')!;
    this.uSpriteLight = {
      dir: gl.getUniformLocation(this.spriteProg, 'uLightDir')!,
      key: gl.getUniformLocation(this.spriteProg, 'uKeyLight')!,
      ambient: gl.getUniformLocation(this.spriteProg, 'uAmbient')!,
    };
    this.uDepthA = gl.getUniformLocation(this.spriteProg, 'uDepthA')!;
    this.uDepthB = gl.getUniformLocation(this.spriteProg, 'uDepthB')!;
    gl.useProgram(this.spriteProg);
    gl.uniform1f(this.uDepthA, -1 / (2 * DEPTH_LINEAR_RANGE));
    gl.uniform1f(this.uDepthB, 0.5);

    this.setSprites(renderLayers, gbufferLayers, maxW, maxH);

    this.groundVao = gl.createVertexArray()!;
    this.groundVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundVbo);
    const aFlatPos = gl.getAttribLocation(this.flatProg, 'aPos');
    const aFlatColor = gl.getAttribLocation(this.flatProg, 'aColor');
    gl.enableVertexAttribArray(aFlatPos);
    gl.vertexAttribPointer(aFlatPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aFlatColor);
    gl.vertexAttribPointer(aFlatColor, 4, gl.FLOAT, false, 24, 8);

    this.shadowVao = gl.createVertexArray()!;
    this.shadowVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
    gl.enableVertexAttribArray(aFlatPos);
    gl.vertexAttribPointer(aFlatPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aFlatColor);
    gl.vertexAttribPointer(aFlatColor, 4, gl.FLOAT, false, 24, 8);

    this.highlightVao = gl.createVertexArray()!;
    this.highlightVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.highlightVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightVbo);
    gl.enableVertexAttribArray(aFlatPos);
    gl.vertexAttribPointer(aFlatPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aFlatColor);
    gl.vertexAttribPointer(aFlatColor, 4, gl.FLOAT, false, 24, 8);

    this.spriteVao = gl.createVertexArray()!;
    this.instVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.spriteVao);
    const cornerVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aCorner = gl.getAttribLocation(this.spriteProg, 'aCorner');
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    const aInst = gl.getAttribLocation(this.spriteProg, 'aInst');
    gl.enableVertexAttribArray(aInst);
    gl.vertexAttribPointer(aInst, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(aInst, 1);
    const aInst2 = gl.getAttribLocation(this.spriteProg, 'aInst2');
    gl.enableVertexAttribArray(aInst2);
    gl.vertexAttribPointer(aInst2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(aInst2, 1);

    gl.bindVertexArray(null);
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uRender')!, 0);
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uGbuffer')!, 1);

    // Mesh program: joint palette + display uniforms. Depth map matches
    // the sprite path exactly.
    this.meshProg = link(gl, MESH_VERT, MESH_FRAG);
    this.uMeshRes = gl.getUniformLocation(this.meshProg, 'uRes')!;
    this.uMeshView = gl.getUniformLocation(this.meshProg, 'uView')!;
    this.uMeshLight = {
      dir: gl.getUniformLocation(this.meshProg, 'uLightDir')!,
      key: gl.getUniformLocation(this.meshProg, 'uKeyLight')!,
      ambient: gl.getUniformLocation(this.meshProg, 'uAmbient')!,
    };
    this.uMeshYaw = gl.getUniformLocation(this.meshProg, 'uYaw')!;
    this.uMeshOrigin = gl.getUniformLocation(this.meshProg, 'uOrigin')!;
    this.uMeshProj = gl.getUniformLocation(this.meshProg, 'uProj')!;
    this.uMeshSh = gl.getUniformLocation(this.meshProg, 'uSh[0]')!;
    this.uMeshExposure = gl.getUniformLocation(this.meshProg, 'uExposure')!;
    this.uMeshSaturation = gl.getUniformLocation(this.meshProg, 'uSaturation')!;
    gl.useProgram(this.meshProg);
    gl.uniform1f(this.uMeshExposure, 1);
    gl.uniform1f(this.uMeshSaturation, 1);
    gl.uniform3f(this.uMeshProj, 0, 0, 64);
    gl.uniform1f(gl.getUniformLocation(this.meshProg, 'uDepthA')!, -1 / (2 * DEPTH_LINEAR_RANGE));
    gl.uniform1f(gl.getUniformLocation(this.meshProg, 'uDepthB')!, 0.5);
    gl.uniform1i(gl.getUniformLocation(this.meshProg, 'uAlbedo')!, 0);
    gl.uniform3fv(this.uMeshSh, new Float32Array(27));
    this.meshVao = gl.createVertexArray()!;
    this.setMesh(null, null);

    gl.disable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.078, 0.086, 0.102, 1);
    gl.clearDepth(1);
  }

  /** (Re)builds the sprite texture arrays; callable again after loading new layers. */
  setSprites(
    renderLayers: Uint8Array[],
    gbufferLayers: Uint16Array[],
    maxW: number,
    maxH: number,
  ): void {
    const gl = this.gl;
    if (this.renderTex !== null) gl.deleteTexture(this.renderTex);
    if (this.gbufferTex !== null) gl.deleteTexture(this.gbufferTex);

    this.renderTex = this.byteArray(renderLayers, maxW, maxH, gl.LINEAR);
    this.gbufferTex = this.halfArray(gbufferLayers, maxW, maxH);

    gl.useProgram(this.spriteProg);
    gl.uniform2f(this.uSpriteMaxSize, maxW, maxH);
  }

  private byteArray(layers: Uint8Array[], maxW: number, maxH: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA8,
      maxW,
      maxH,
      layers.length,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    layers.forEach((bytes, i) => {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        i,
        maxW,
        maxH,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private halfArray(layers: Uint16Array[], maxW: number, maxH: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA16F,
      maxW,
      maxH,
      layers.length,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    layers.forEach((data, i) => {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        i,
        maxW,
        maxH,
        1,
        gl.RGBA,
        gl.HALF_FLOAT,
        data,
      );
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  setLight(light: LightParams): void {
    this.light = light;
  }

  /**
   * Upload a character's skinned geometry + surface (null clears).
   * Callable again when the document's character changes; one upload per
   * asset, shared by every placement draw.
   */
  setMesh(geometry: MeshGeometry | null, surface: MeshSurface | null): void {
    const gl = this.gl;
    gl.bindVertexArray(this.meshVao);
    if (this.meshPosNorVbo) gl.deleteBuffer(this.meshPosNorVbo);
    if (this.meshIbo) gl.deleteBuffer(this.meshIbo);
    if (this.meshAlbedoTex) gl.deleteTexture(this.meshAlbedoTex);
    this.meshPosNorVbo = this.meshIbo = null;
    this.meshAlbedoTex = null;
    this.meshIndexCount = 0;
    if (!geometry) {
      gl.bindVertexArray(null);
      return;
    }

    const posNor = new Float32Array(geometry.vertexCount * 6);
    posNor.set(geometry.positions, 0);
    posNor.set(geometry.normals, geometry.vertexCount * 3);
    this.meshPosNorVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshPosNorVbo);
    gl.bufferData(gl.ARRAY_BUFFER, posNor, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.meshProg, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    const aNormal = gl.getAttribLocation(this.meshProg, 'aNormal');
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);

    this.meshIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    this.meshIndexCount = geometry.indices.length;

    // Base color: sRGB image, flipped to GL orientation on upload (glTF
    // UVs are top-down); the shader does the sRGB → linear decode.
    this.meshAlbedoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.meshAlbedoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (surface?.image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface.image);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.useProgram(this.meshProg);
    if (surface) gl.uniform3f(this.uMeshFactor(), surface.factor[0], surface.factor[1], surface.factor[2]);
    gl.bindVertexArray(null);
  }

  private uMeshFactor(): WebGLUniformLocation {
    if (!this.uMeshAlbedoFactor) {
      this.uMeshAlbedoFactor = this.gl.getUniformLocation(this.meshProg, 'uAlbedoFactor')!;
    }
    return this.uMeshAlbedoFactor;
  }

  private uMeshAlbedoFactor: WebGLUniformLocation | null = null;

  /** World-image pixel origin (the editor's ORIGIN_X/ORIGIN_Y) + PPU. */
  setMeshFrame(originXpx: number, originYpx: number, ppu: number): void {
    this.meshFrame = [originXpx, originYpx, ppu];
  }

  /** SH irradiance probe coefficients (27 floats; null = black ambient). */
  setShProbe(coeffs: Float32Array | null): void {
    this.gl.useProgram(this.meshProg);
    this.gl.uniform3fv(this.uMeshSh, coeffs ?? new Float32Array(27));
  }

  /** Display-referred env parameters that shaped the baked render texels. */
  setEnvDisplay(exposure: number, saturation: number): void {
    this.gl.useProgram(this.meshProg);
    this.gl.uniform1f(this.uMeshExposure, exposure);
    this.gl.uniform1f(this.uMeshSaturation, saturation);
  }

  /**
   * Release every GL object (tab close / StrictMode remount). The context
   * itself is per-canvas and stays usable: a remount re-creates its
   * programs, buffers and textures on it.
   */
  dispose(): void {
    const gl = this.gl;
    if (this.renderTex) gl.deleteTexture(this.renderTex);
    if (this.gbufferTex) gl.deleteTexture(this.gbufferTex);
    gl.deleteBuffer(this.groundVbo);
    gl.deleteVertexArray(this.groundVao);
    gl.deleteBuffer(this.shadowVbo);
    gl.deleteVertexArray(this.shadowVao);
    gl.deleteBuffer(this.highlightVbo);
    gl.deleteVertexArray(this.highlightVao);
    gl.deleteBuffer(this.instVbo);
    gl.deleteVertexArray(this.spriteVao);
    if (this.meshPosNorVbo) gl.deleteBuffer(this.meshPosNorVbo);
    if (this.meshIbo) gl.deleteBuffer(this.meshIbo);
    if (this.meshAlbedoTex) gl.deleteTexture(this.meshAlbedoTex);
    gl.deleteVertexArray(this.meshVao);
    gl.deleteProgram(this.flatProg);
    gl.deleteProgram(this.meshProg);
    gl.deleteProgram(this.spriteProg);
  }

  /** The raw context (diagnostic harnesses only — do not draw through it). */
  get context(): WebGL2RenderingContext {
    return this.gl;
  }

  /** The mesh program (diagnostic harnesses only). */
  get meshProgram(): WebGLProgram {
    return this.meshProg;
  }

  /** Readback of the default framebuffer (verification harnesses). */
  readPixels(out: Uint8Array): void {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    this.gl.readPixels(0, 0, canvas.width, canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out);
  }

  setGround(data: Float32Array): void {
    const gl = this.gl;
    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.groundVerts = data.length / 6;
    gl.bindVertexArray(null);
  }

  render(
    instances: Float32Array,
    count: number,
    shadows: FlatBatch | null,
    overlay: FlatBatch | null,
    view: RenderView = IDENTITY_VIEW,
    meshes: readonly MeshDraw[] = [],
  ): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.flatProg);
    gl.uniform2f(this.uFlatRes, canvas.width, canvas.height);
    gl.uniform4f(this.uFlatView, view.zoom, view.zoom, view.panX, view.panY);
    gl.useProgram(this.spriteProg);
    gl.uniform2f(this.uSpriteRes, canvas.width, canvas.height);
    gl.uniform4f(this.uSpriteView, view.zoom, view.zoom, view.panX, view.panY);
    gl.useProgram(this.meshProg);
    gl.uniform2f(this.uMeshRes, canvas.width, canvas.height);
    gl.uniform4f(this.uMeshView, view.zoom, view.zoom, view.panX, view.panY);
    gl.uniform3f(this.uMeshProj, this.meshFrame[0], this.meshFrame[1], this.meshFrame[2]);

    // 1. Ground: opaque, no depth interaction (writes none, tests none —
    //    sprites always composite over it).
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.flatProg);
    gl.uniform2f(this.uFlatRes, canvas.width, canvas.height);
    uploadLight(gl, this.uFlatLight, this.light);
    gl.bindVertexArray(this.groundVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.groundVerts);

    // 2. Contact shadows: blended, still no depth interaction — they lie
    //    flat on the ground and every sprite composites over them.
    if (shadows && shadows.verts > 0) {
      gl.enable(gl.BLEND);
      gl.bindVertexArray(this.shadowVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
      gl.bufferData(gl.ARRAY_BUFFER, shadows.data, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, shadows.verts);
    }

    // 3. Meshes (skinned characters): opaque, depth WRITE + test — every
    //    sprite/character overlap below resolves pixel-accurately against
    //    this depth. Skipped entirely when nothing is placed: no writes,
    //    no state, the frame matches the pre-mesh renderer exactly.
    if (meshes.length > 0 && this.meshIndexCount > 0) {
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(this.meshProg);
      uploadLight(gl, this.uMeshLight, this.light);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.meshAlbedoTex);
      gl.bindVertexArray(this.meshVao);
      for (const mesh of meshes) {
        gl.uniform3f(this.uMeshOrigin, mesh.origin[0], mesh.origin[1], mesh.origin[2]);
        gl.uniformMatrix3fv(this.uMeshYaw, false, mesh.yawMat);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshPosNorVbo);
        // Size-only (orphaning) allocation: bufferData with an array would
        // resize the store to positions alone and the normals overflow it.
        gl.bufferData(
          gl.ARRAY_BUFFER,
          mesh.positions.byteLength + mesh.normals.byteLength,
          gl.DYNAMIC_DRAW,
        );
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.positions);
        gl.bufferSubData(gl.ARRAY_BUFFER, mesh.positions.byteLength, mesh.normals);
        gl.drawElements(gl.TRIANGLES, this.meshIndexCount, gl.UNSIGNED_INT, 0);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(null);
    }

    // 4. Sprites: blended, per-pixel depth-tested against each other and
    //    against any mesh depth written above.
    if (count > 0) {
      gl.enable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.spriteProg);
      gl.uniform2f(this.uSpriteRes, canvas.width, canvas.height);
      uploadLight(gl, this.uSpriteLight, this.light);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.renderTex!);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.gbufferTex!);
      gl.bindVertexArray(this.spriteVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
      gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.disable(gl.DEPTH_TEST);
    }

    // 5. Overlay (hover highlight, height gizmo): blended editor chrome.
    if (overlay && overlay.verts > 0) {
      gl.useProgram(this.flatProg);
      gl.uniform2f(this.uFlatRes, canvas.width, canvas.height);
      gl.enable(gl.BLEND);
      gl.bindVertexArray(this.highlightVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightVbo);
      gl.bufferData(gl.ARRAY_BUFFER, overlay.data, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, overlay.verts);
    }

    gl.bindVertexArray(null);
  }

  private groundVerts = 0;
}

interface Uniforms3 {
  dir: WebGLUniformLocation;
  key: WebGLUniformLocation;
  ambient: WebGLUniformLocation;
}

function uploadLight(gl: WebGL2RenderingContext, u: Uniforms3, light: LightParams): void {
  gl.uniform3f(u.dir, light.dir[0], light.dir[1], light.dir[2]);
  gl.uniform3f(u.key, light.key[0], light.key[1], light.key[2]);
  gl.uniform3f(u.ambient, light.ambient[0], light.ambient[1], light.ambient[2]);
}
