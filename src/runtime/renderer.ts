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
    gl.deleteProgram(this.flatProg);
    gl.deleteProgram(this.spriteProg);
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

    // 3. Sprites: blended, per-pixel depth-tested against each other.
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

    // 4. Overlay (hover highlight, height gizmo): blended editor chrome.
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
