import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Plane,
  Points,
  PointsMaterial,
  Raycaster,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Intersection,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PAD_PX, applySlotModelRotation } from '../bake/bake.js';
import { ISO_AZIMUTH_DEG, frameIsoBox } from '../bake/iso.js';
import type { Primitive } from '../bake/primitives.js';
import { yawRotatedBoxSize, type Vec3 } from '../shared/iso.js';
import type { ViewTransform } from './document.js';
import humanMeshUrl from './assets/free_base_mesh.glb?url';

/** Fixed realtime-view lighting (geometry inspection, not look matching). */
const KEY_COLOR = 0xfff1dd;
const KEY_INTENSITY = 2.6;
const AMBIENT_COLOR = 0xa8a8a8;
const AMBIENT_INTENSITY = 1.15;

/** Bounding-box overlay styling: neutral edges, per-axis origin edges, origin marker. */
const EDGE_RGB: [number, number, number] = [0.82, 0.82, 0.82];
const AXIS_RGB: Record<'x' | 'y' | 'z', [number, number, number]> = {
  x: [1, 0.36, 0.36],
  y: [0.42, 0.95, 0.55],
  z: [0.38, 0.62, 1],
};
const ORIGIN_MARKER_HEX = 0xffd54f;

/** Human reference figure: total height in meters (= world units). */
export const HUMAN_REFERENCE_HEIGHT = 1.8;
/** Ground gap between the figure and the yaw-rotated box's near corner. */
const HUMAN_REFERENCE_GAP = 0.3;
const HUMAN_COLOR = 0x9aa0a6;

/**
 * Fallback reference figure (procedural low-poly mannequin, legs/torso/
 * head) exactly `HUMAN_REFERENCE_HEIGHT` tall, feet on the ground plane.
 * Only used when the bundled base mesh fails to load; same editor-chrome
 * semantics. Axis-aligned in the fixed camera frame; callers position it
 * beside the yaw-rotated box (never apply the slot model rotation to it).
 */
function buildMannequin(): Group {
  const h = HUMAN_REFERENCE_HEIGHT;
  const material = new MeshStandardMaterial({
    color: HUMAN_COLOR,
    roughness: 0.85,
    metalness: 0,
  });
  const part = (
    geometry: CylinderGeometry | SphereGeometry,
    y: number,
  ): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.y = y;
    return mesh;
  };
  const group = new Group();
  group.add(
    // Legs: 0 … 0.45h.
    part(new CylinderGeometry(0.05 * h, 0.05 * h, 0.45 * h, 12), 0.225 * h)
      .translateX(0.055 * h),
    part(new CylinderGeometry(0.05 * h, 0.05 * h, 0.45 * h, 12), 0.225 * h)
      .translateX(-0.055 * h),
    // Torso: 0.45h … 0.8h, slightly tapered.
    part(new CylinderGeometry(0.085 * h, 0.105 * h, 0.35 * h, 12), 0.625 * h),
    // Head: top lands exactly at h.
    part(new SphereGeometry(0.067 * h, 16, 12), 0.933 * h),
  );
  return group;
}

/**
 * Load the bundled base-mesh figure into `group`, normalized at load:
 * uniform scale so the height is exactly `HUMAN_REFERENCE_HEIGHT`, feet
 * translated to y = 0, centered over the group origin (its ground spot).
 * Falls back to the procedural mannequin if loading fails. `onLoad` lets
 * the view repaint once the figure arrives.
 */
function loadHumanMesh(group: Group, onLoad: () => void): void {
  new GLTFLoader().load(
    humanMeshUrl,
    (gltf) => {
      const obj = gltf.scene;
      const box = new Box3().setFromObject(obj);
      const height = box.max.y - box.min.y;
      if (height > 0) obj.scale.setScalar(HUMAN_REFERENCE_HEIGHT / height);
      const fit = new Box3().setFromObject(obj);
      const center = fit.getCenter(new Vector3());
      obj.position.set(-center.x, -fit.min.y, -center.z);
      group.add(obj);
      onLoad();
    },
    undefined,
    () => {
      group.add(buildMannequin());
      onLoad();
    },
  );
}

/** Dispose every geometry and material(s) under `root` (any depth). */
function disposeRenderables(root: Object3D): void {
  root.traverse((obj) => {
    const renderable = obj as Mesh;
    renderable.geometry?.dispose();
    const material = renderable.material as Material | Material[] | undefined;
    if (!material) return;
    if (Array.isArray(material)) for (const m of material) m.dispose();
    else material.dispose();
  });
}

/** Corner index pairs (bit 0 = x, bit 1 = y, bit 2 = z) forming the 12 edges. */
const BOX_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
];

/**
 * Box overlay for the realtime view: the box from the world origin
 * `(0,0,0)` to `size` with the origin-adjacent edges colored per axis
 * (X red, Y green, Z blue) and the origin marked. Drawn on top of the
 * mesh (no depth test), matching the 2D views' overlay semantics.
 */
function buildBoxOverlay(size: Vec3): Group {
  const corners: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    corners.push([
      (i & 1) * size[0],
      ((i >> 1) & 1) * size[1],
      ((i >> 2) & 1) * size[2],
    ]);
  }
  const axisOfCorner: Record<number, 'x' | 'y' | 'z'> = { 1: 'x', 2: 'y', 4: 'z' };
  const positions: number[] = [];
  const colors: number[] = [];
  for (const [a, b] of BOX_EDGES) {
    const rgb = a === 0 ? AXIS_RGB[axisOfCorner[b]] : EDGE_RGB;
    for (const corner of [corners[a], corners[b]]) {
      positions.push(...corner);
      colors.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const lines = new LineSegments(
    geometry,
    new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      toneMapped: false,
    }),
  );
  lines.renderOrder = 1000;
  const markerGeometry = new BufferGeometry();
  markerGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
  const marker = new Points(
    markerGeometry,
    new PointsMaterial({
      color: ORIGIN_MARKER_HEX,
      size: 7,
      sizeAttenuation: false,
      depthTest: false,
      toneMapped: false,
    }),
  );
  marker.renderOrder = 1001;
  const group = new Group();
  group.add(lines, marker);
  return group;
}

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
  private overlay: Group;
  private human: Group;
  /** Last rendered transform, for repaints from outside the React flow. */
  private lastTransform: ViewTransform | null = null;
  private readonly raycaster = new Raycaster();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);

  constructor(canvas: HTMLCanvasElement, prim: Primitive, azimuthDeg: number = ISO_AZIMUTH_DEG) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;

    // Same convention as the bake: the view slot turns the MODEL about the
    // vertical axis while the camera stays in the fixed iso frame, so the
    // preview shows the asset exactly as its non-north views bake it.
    const yawDeg = azimuthDeg - ISO_AZIMUTH_DEG;
    const boxSize = yawRotatedBoxSize(prim.size, yawDeg);
    const frame = frameIsoBox(boxSize, 128, PAD_PX);
    this.camera = frame.camera;
    this.fitHalfW = (frame.camera.right - frame.camera.left) / 2;
    this.fitHalfH = (frame.camera.top - frame.camera.bottom) / 2;
    const boxCenter = new Vector3(prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2);
    this.center = new Vector3(boxSize[0] / 2, boxSize[1] / 2, boxSize[2] / 2);
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
      mesh.position.copy(boxCenter);
      applySlotModelRotation(mesh, prim.size, yawDeg);
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
        applySlotModelRotation(mesh, prim.size, yawDeg);
        this.materials.push(material);
        this.scene.add(mesh);
      }
    }

    this.overlay = buildBoxOverlay(prim.size);
    applySlotModelRotation(this.overlay, prim.size, yawDeg);
    this.overlay.visible = false;
    this.scene.add(this.overlay);

    // Human-scale reference: fixed in the camera frame (never slot-rotated),
    // defaulting to just outside the yaw-rotated box's camera-facing ground
    // corner — the fixed iso camera sits toward +x/+z at 45° azimuth — so
    // the figure stays beside the asset in every view slot. The base mesh
    // loads async and is normalized to the reference height on arrival.
    this.human = new Group();
    this.human.position.set(
      boxSize[0] + HUMAN_REFERENCE_GAP * Math.SQRT1_2,
      0,
      boxSize[2] + HUMAN_REFERENCE_GAP * Math.SQRT1_2,
    );
    this.human.visible = false;
    this.scene.add(this.human);
    loadHumanMesh(this.human, () => this.rerender());
  }

  /** Match the canvas backing store to the panel's CSS size. */
  resize(cssW: number, cssH: number): void {
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(cssW, cssH, false);
  }

  /** Draw one frame for the shared zoom/pan state (fit = zoom 1, pan 0). */
  render(transform: ViewTransform): void {
    this.lastTransform = transform;
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

  /** Show or hide the bounding-box overlay. */
  setBoxOverlay(on: boolean): void {
    this.overlay.visible = on;
  }

  /** Show or hide the human-scale reference figure. */
  setHumanReference(on: boolean): void {
    this.human.visible = on;
  }

  /** Place the figure's feet anchor at a ground position (x/z, world). */
  setHumanPosition(x: number, z: number): void {
    this.human.position.set(x, 0, z);
    this.rerender();
  }

  /** True when a viewport point (CSS px) hits the visible figure. */
  hitHuman(cssX: number, cssY: number): boolean {
    if (!this.human.visible) return false;
    return this.pick(cssX, cssY, this.human).length > 0;
  }

  /**
   * Drag the figure's feet anchor under a viewport point (CSS px) by
   * raycasting the ground plane; returns the new ground position, or null
   * when the ray misses the plane (parallel to it).
   */
  dragHumanTo(cssX: number, cssY: number): [number, number] | null {
    this.raycaster.setFromCamera(this.ndcFor(cssX, cssY), this.camera);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    this.human.position.set(hit.x, 0, hit.z);
    this.rerender();
    return [hit.x, hit.z];
  }

  /** Repaint from the last render call (async loads, drag moves). */
  private rerender(): void {
    if (this.lastTransform) this.render(this.lastTransform);
  }

  private ndcFor(cssX: number, cssY: number): Vector2 {
    const canvas = this.renderer.domElement;
    const dpr = window.devicePixelRatio || 1;
    return new Vector2(
      (cssX / (canvas.width / dpr)) * 2 - 1,
      -(cssY / (canvas.height / dpr)) * 2 + 1,
    );
  }

  private pick(cssX: number, cssY: number, target: Object3D): Intersection[] {
    this.raycaster.setFromCamera(this.ndcFor(cssX, cssY), this.camera);
    return this.raycaster.intersectObject(target, true);
  }

  /** Release materials, GL resources and the canvas' WebGL context. */
  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.materials = [];
    disposeRenderables(this.overlay);
    disposeRenderables(this.human);
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
