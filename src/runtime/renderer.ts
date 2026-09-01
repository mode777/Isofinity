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
in vec3 aColor;
uniform vec2 uRes;
out vec3 vColor;
void main() {
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
  vColor = aColor;
}
`;

const FLAT_FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
uniform float uAlpha;
out vec4 outColor;
${SHADE_CHUNK}
void main() {
  outColor = vec4(shade(vColor, vec3(0.0, 1.0, 0.0)), uAlpha);
}
`;

const SPRITE_VERT = `#version 300 es
in vec2 aCorner;
in vec4 aInst;   // px.xy, layer, depthOff
in vec4 aInst2;  // quadSize px, sprite texel size
uniform vec2 uRes;
uniform vec2 uMaxSize;
out vec2 vUv;
flat out float vLayer;
flat out float vDepthOff;
void main() {
  vec2 px = aInst.xy + aCorner * aInst2.xy;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = mix(vec2(0.5), aInst2.zw - 0.5, aCorner) / uMaxSize;
  vLayer = aInst.z;
  vDepthOff = aInst.w;
}
`;

const SPRITE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uSprites;
uniform sampler2DArray uGbuffer;
uniform float uDepthA;
uniform float uDepthB;
in vec2 vUv;
flat in float vLayer;
flat in float vDepthOff;
out vec4 outColor;
${SHADE_CHUNK}
void main() {
  vec4 c = texture(uSprites, vec3(vUv, vLayer));
  if (c.a < 0.01) discard;
  vec4 g = texture(uGbuffer, vec3(vUv, vLayer));
  float d = g.a + vDepthOff;
  gl_FragDepth = uDepthA * d + uDepthB;
  outColor = vec4(shade(c.rgb, g.rgb), c.a);
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

export interface LightParams {
  dir: [number, number, number];
  key: [number, number, number];
  ambient: [number, number, number];
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private flatProg: WebGLProgram;
  private spriteProg: WebGLProgram;
  private tex: WebGLTexture;
  private gbufferTex: WebGLTexture;
  private groundVao: WebGLVertexArrayObject;
  private groundVbo: WebGLBuffer;
  private highlightVao: WebGLVertexArrayObject;
  private highlightVbo: WebGLBuffer;
  private spriteVao: WebGLVertexArrayObject;
  private instVbo: WebGLBuffer;
  private uFlatRes: WebGLUniformLocation;
  private uFlatAlpha: WebGLUniformLocation;
  private uFlatLight: Uniforms3;
  private uSpriteRes: WebGLUniformLocation;
  private uSpriteMaxSize: WebGLUniformLocation;
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
    albedoLayers: Uint8Array[],
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
    this.uFlatAlpha = gl.getUniformLocation(this.flatProg, 'uAlpha')!;
    this.uFlatLight = {
      dir: gl.getUniformLocation(this.flatProg, 'uLightDir')!,
      key: gl.getUniformLocation(this.flatProg, 'uKeyLight')!,
      ambient: gl.getUniformLocation(this.flatProg, 'uAmbient')!,
    };
    this.uSpriteRes = gl.getUniformLocation(this.spriteProg, 'uRes')!;
    this.uSpriteMaxSize = gl.getUniformLocation(this.spriteProg, 'uMaxSize')!;
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
    gl.uniform2f(this.uSpriteMaxSize, maxW, maxH);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA8,
      maxW,
      maxH,
      albedoLayers.length,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    albedoLayers.forEach((bytes, i) => {
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
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.gbufferTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.gbufferTex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA16F,
      maxW,
      maxH,
      gbufferLayers.length,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    gbufferLayers.forEach((data, i) => {
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

    this.groundVao = gl.createVertexArray()!;
    this.groundVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundVbo);
    const aFlatPos = gl.getAttribLocation(this.flatProg, 'aPos');
    const aFlatColor = gl.getAttribLocation(this.flatProg, 'aColor');
    gl.enableVertexAttribArray(aFlatPos);
    gl.vertexAttribPointer(aFlatPos, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(aFlatColor);
    gl.vertexAttribPointer(aFlatColor, 3, gl.FLOAT, false, 20, 8);

    this.highlightVao = gl.createVertexArray()!;
    this.highlightVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.highlightVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightVbo);
    gl.enableVertexAttribArray(aFlatPos);
    gl.vertexAttribPointer(aFlatPos, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(aFlatColor);
    gl.vertexAttribPointer(aFlatColor, 3, gl.FLOAT, false, 20, 8);

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
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uSprites')!, 0);
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uGbuffer')!, 1);

    gl.disable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.078, 0.086, 0.102, 1);
    gl.clearDepth(1);
  }

  setLight(light: LightParams): void {
    this.light = light;
  }

  setGround(data: Float32Array): void {
    const gl = this.gl;
    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.groundVerts = data.length / 5;
    gl.bindVertexArray(null);
  }

  render(instances: Float32Array, count: number, highlight: Float32Array | null): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.flatProg);
    gl.uniform2f(this.uFlatRes, canvas.width, canvas.height);
    gl.uniform1f(this.uFlatAlpha, 1);
    uploadLight(gl, this.uFlatLight, this.light);
    gl.bindVertexArray(this.groundVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.groundVerts);

    if (count > 0) {
      gl.enable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.spriteProg);
      gl.uniform2f(this.uSpriteRes, canvas.width, canvas.height);
      uploadLight(gl, this.uSpriteLight, this.light);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.gbufferTex);
      gl.bindVertexArray(this.spriteVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
      gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.disable(gl.DEPTH_TEST);
    }

    if (highlight) {
      gl.useProgram(this.flatProg);
      gl.uniform1f(this.uFlatAlpha, 0.35);
      gl.bindVertexArray(this.highlightVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightVbo);
      gl.bufferData(gl.ARRAY_BUFFER, highlight, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
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
