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
void main() {
  outColor = vec4(vColor, uAlpha);
}
`;

const SPRITE_VERT = `#version 300 es
in vec2 aCorner;
in vec4 aInst;
uniform vec2 uRes;
uniform vec2 uSize;
out vec2 vUv;
flat out float vLayer;
flat out float vDepthOff;
void main() {
  vec2 px = aInst.xy + aCorner * uSize;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = aCorner;
  vLayer = aInst.z;
  vDepthOff = aInst.w;
}
`;

const SPRITE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uSprites;
uniform sampler2DArray uDepths;
uniform float uDepthA;
uniform float uDepthB;
in vec2 vUv;
flat in float vLayer;
flat in float vDepthOff;
out vec4 outColor;
void main() {
  vec4 c = texture(uSprites, vec3(vUv, vLayer));
  if (c.a < 0.01) discard;
  float d = texture(uDepths, vec3(vUv, vLayer)).r + vDepthOff;
  gl_FragDepth = uDepthA * d + uDepthB;
  outColor = c;
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

export class Renderer {
  private gl: WebGL2RenderingContext;
  private flatProg: WebGLProgram;
  private spriteProg: WebGLProgram;
  private tex: WebGLTexture;
  private depthTex: WebGLTexture;
  private groundVao: WebGLVertexArrayObject;
  private groundVbo: WebGLBuffer;
  private highlightVao: WebGLVertexArrayObject;
  private highlightVbo: WebGLBuffer;
  private spriteVao: WebGLVertexArrayObject;
  private instVbo: WebGLBuffer;
  private uFlatRes: WebGLUniformLocation;
  private uFlatAlpha: WebGLUniformLocation;
  private uSpriteRes: WebGLUniformLocation;
  private uSpriteSize: WebGLUniformLocation;
  private uDepthA: WebGLUniformLocation;
  private uDepthB: WebGLUniformLocation;
  private layerWidth: number;
  private layerHeight: number;

  constructor(
    canvas: HTMLCanvasElement,
    albedoLayers: Uint8Array[],
    depthLayers: Float32Array[],
    layerWidth: number,
    layerHeight: number,
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
    this.layerWidth = layerWidth;
    this.layerHeight = layerHeight;

    this.flatProg = link(gl, FLAT_VERT, FLAT_FRAG);
    this.spriteProg = link(gl, SPRITE_VERT, SPRITE_FRAG);
    this.uFlatRes = gl.getUniformLocation(this.flatProg, 'uRes')!;
    this.uFlatAlpha = gl.getUniformLocation(this.flatProg, 'uAlpha')!;
    this.uSpriteRes = gl.getUniformLocation(this.spriteProg, 'uRes')!;
    this.uSpriteSize = gl.getUniformLocation(this.spriteProg, 'uSize')!;
    this.uDepthA = gl.getUniformLocation(this.spriteProg, 'uDepthA')!;
    this.uDepthB = gl.getUniformLocation(this.spriteProg, 'uDepthB')!;
    gl.useProgram(this.spriteProg);
    gl.uniform1f(this.uDepthA, -1 / (2 * DEPTH_LINEAR_RANGE));
    gl.uniform1f(this.uDepthB, 0.5);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA8,
      layerWidth,
      layerHeight,
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
        layerWidth,
        layerHeight,
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

    this.depthTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.depthTex);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.R32F,
      layerWidth,
      layerHeight,
      depthLayers.length,
      0,
      gl.RED,
      gl.FLOAT,
      null,
    );
    depthLayers.forEach((data, i) => {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        i,
        layerWidth,
        layerHeight,
        1,
        gl.RED,
        gl.FLOAT,
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
    gl.vertexAttribPointer(aInst, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(aInst, 1);

    gl.bindVertexArray(null);
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uSprites')!, 0);
    gl.uniform1i(gl.getUniformLocation(this.spriteProg, 'uDepths')!, 1);

    gl.disable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.078, 0.086, 0.102, 1);
    gl.clearDepth(1);
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
    gl.bindVertexArray(this.groundVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.groundVerts);

    if (count > 0) {
      gl.enable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.spriteProg);
      gl.uniform2f(this.uSpriteRes, canvas.width, canvas.height);
      gl.uniform2f(this.uSpriteSize, this.layerWidth, this.layerHeight);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.depthTex);
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
