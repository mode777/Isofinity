import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { PAD_PX } from '../bake/bake.js';
import { frameIsoBox } from '../bake/iso.js';
import type { Primitive } from '../bake/primitives.js';
import type { ViewTransform } from './document.js';

/** Fixed realtime-view lighting (geometry inspection, not look matching). */
const KEY_COLOR = 0xfff1dd;
const KEY_INTENSITY = 2.6;
const AMBIENT_COLOR = 0xa8a8a8;
const AMBIENT_INTENSITY = 1.15;

/**
 * Real-time three.js render of a sprite document's source geometry — a
 * classic lit mesh preview, not a shading of any baked pass. The camera
 * reuses the bake's fixed isometric frame (frameIsoBox), so the view stays
 * comparable with the baked passes. The shared zoom/pan model maps onto
 * the orthographic frustum: zoom 1 = the whole primitive framed with the
 * bake's padding, pan shifts the camera in the view plane at 1 world-px
 * per screen px of the current zoom.
 *
 * Owns only what it creates: materials and the WebGL renderer/canvas
 * context. Geometry and textures belong to the document's Primitive and
 * are disposed with its source.
 */
export class RealtimeMeshView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private materials: MeshStandardMaterial[] = [];
  /** Fit framing at zoom 1 (includes the bake's padding). */
  private fitHalfW: number;
  private fitHalfH: number;
  private basePos: Vector3;
  private center: Vector3;
  private camRight: Vector3;
  private camUp: Vector3;

  constructor(canvas: HTMLCanvasElement, prim: Primitive) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;

    // Same camera frame as the bake: fixed iso direction, box center,
    // frustum = the sprite extent plus the bake's padding.
    const frame = frameIsoBox(prim.size, 128, PAD_PX);
    this.camera = frame.camera;
    this.fitHalfW = (frame.camera.right - frame.camera.left) / 2;
    this.fitHalfH = (frame.camera.top - frame.camera.bottom) / 2;
    this.center = new Vector3(prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2);
    this.basePos = frame.camera.position.clone();
    this.camRight = new Vector3().setFromMatrixColumn(frame.camera.matrixWorld, 0);
    this.camUp = new Vector3().setFromMatrixColumn(frame.camera.matrixWorld, 1);

    const key = new DirectionalLight(KEY_COLOR, KEY_INTENSITY);
    key.position.copy(this.center).add(new Vector3(-4, 6, 3));
    key.target.position.copy(this.center);
    this.scene.add(key, key.target, new AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY));

    if (!prim.groups) {
      // Legacy primitive: geometry centered at the box center, flat albedo.
      const material = new MeshStandardMaterial({
        color: new Color(prim.albedoHex),
        roughness: 0.85,
        metalness: 0,
      });
      const mesh = new Mesh(prim.geometry, material);
      mesh.position.copy(this.center);
      this.materials.push(material);
      this.scene.add(mesh);
    } else {
      // glTF groups: geometry pre-normalized into the box (min corner at
      // the origin); the uniform scale is applied as the mesh transform.
      const scale = prim.scale ?? 1;
      for (const group of prim.groups) {
        const [r, g, b, a] = group.baseColorFactor;
        const material = new MeshStandardMaterial({
          color: new Color(r, g, b),
          opacity: a,
          transparent: a < 1,
          map: group.albedoTexture ?? null,
          alphaTest: group.alphaMode === 'mask' ? (group.alphaCutoff > 0 ? group.alphaCutoff : 0.5) : 0,
          roughness: 0.85,
          metalness: 0,
        });
        const mesh = new Mesh(group.geometry, material);
        mesh.scale.setScalar(scale);
        this.materials.push(material);
        this.scene.add(mesh);
      }
    }
  }

  /** Match the canvas backing store to the panel's CSS size. */
  resize(cssW: number, cssH: number): void {
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(cssW, cssH, false);
  }

  /** Draw one frame for the shared zoom/pan state (fit = zoom 1, pan 0). */
  render(transform: ViewTransform): void {
    const canvas = this.renderer.domElement;
    const cssW = canvas.width / (window.devicePixelRatio || 1);
    const cssH = canvas.height / (window.devicePixelRatio || 1);
    if (cssW < 1 || cssH < 1) return;

    const aspect = cssW / cssH;
    // Zoom 1 shows the whole primitive regardless of panel aspect.
    const fitHalfH = Math.max(this.fitHalfH, this.fitHalfW / aspect);
    const halfH = fitHalfH / transform.zoom;
    const halfW = halfH * aspect;

    // Pan in the view plane: 1 screen px = 2*halfH / panelH world units.
    const worldPerPx = (2 * halfH) / cssH;
    const offset = this.camRight
      .clone()
      .multiplyScalar(-transform.panX * worldPerPx)
      .addScaledVector(this.camUp, transform.panY * worldPerPx);

    const cam = this.camera;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.position.copy(this.basePos).add(offset);
    cam.lookAt(this.center.clone().add(offset));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.renderer.render(this.scene, cam);
  }

  /** Release materials, GL resources and the canvas' WebGL context. */
  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.materials = [];
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
