import {
  AnimationClip,
  AnimationMixer,
  Matrix3,
  Matrix4,
  Object3D,
  SkinnedMesh,
  Vector3,
} from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Joint-palette cap: 64 joints = 256 vec4 vertex uniforms. */
export const MAX_JOINTS = 64;

/**
 * Skinned geometry in upload-ready form. Positions/normals are
 * bind-transformed (the skinned mesh's `bindMatrix` is pre-applied), so
 * the per-frame joint palette `bone.matrixWorld · boneInverse` applied to
 * them lands directly in world space — see `parseCharacterAsset`.
 */
export interface MeshGeometry {
  positions: Float32Array;
  normals: Float32Array;
  /** Joint indices as floats (integers 0..jointCount-1) — float attributes
   *  avoid the driver-specific integer-attribute pitfalls. */
  joints: Float32Array;
  weights: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  jointCount: number;
}

/** The material surface the mesh batch shades with. */
export interface MeshSurface {
  /** sRGB image (ImageBitmap/HTMLImageElement) for the base color, null = white. */
  image: TexImageSource | null;
  /** glTF base color factor (linear RGBA; alpha unused — meshes are opaque). */
  factor: [number, number, number];
}

/**
 * A parsed skinned character: upload-ready geometry plus the CPU-side
 * three.js scene graph that drives poses. three.js is used as a library
 * only — it makes no GL calls; rendering is the raw-GL compositor's mesh
 * batch.
 */
export interface CharacterAsset {
  geometry: MeshGeometry;
  surface: MeshSurface;
  /** glTF scene graph in bind pose; the source for per-placement clones. */
  source: Object3D;
  clips: AnimationClip[];
  /**
   * Height of the first rendered pose (world units) — the walk pose the
   * character stands in, not the bind pose.
   */
  height: number;
  /**
   * Constant world-space offset (post-skinning) that puts the first
   * rendered pose's feet at y = 0, centered over x/z. The draw origin
   * adds this; x/z centering keeps the yaw axis through the body.
   */
  worldOffset: [number, number, number];
}

/**
 * Per-placement animation player: an independent mixer over a skeleton
 * clone, writing `bone.matrixWorld · boneInverse` into a palette buffer
 * each update. `palette` is column-major `mat4[jointCount]`, ready for
 * `uniformMatrix4fv` and the skinning vertex shader.
 */
export class CharacterPlayer {
  readonly palette: Float32Array;
  readonly jointCount: number;

  private mixer: AnimationMixer;
  private root: Object3D;
  private bones: Object3D[];
  private inverses: Matrix4[];
  private tmp = new Matrix4();

  constructor(asset: CharacterAsset) {
    this.jointCount = asset.geometry.jointCount;
    this.palette = new Float32Array(this.jointCount * 16);
    this.root = skeletonClone(asset.source);
    let skinned: SkinnedMesh | null = null;
    this.root.traverse((obj) => {
      if (!skinned && (obj as SkinnedMesh).isSkinnedMesh) skinned = obj as SkinnedMesh;
    });
    if (!skinned) throw new Error('character asset lost its skinned mesh (clone failed)');
    this.mixer = new AnimationMixer(this.root);
    // v1 playback: the first clip, looping (multi-clip blending is out of
    // scope — see the change's non-goals).
    if (asset.clips.length > 0) this.mixer.clipAction(asset.clips[0]).play();
    this.bones = (skinned as SkinnedMesh).skeleton.bones;
    this.inverses = (skinned as SkinnedMesh).skeleton.boneInverses;
    if (this.bones.length !== this.jointCount) {
      throw new Error('character clone joint count mismatch');
    }
  }

  /** Advance animation by `dt` seconds and recompute the joint palette. */
  update(dt: number): void {
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    for (let j = 0; j < this.jointCount; j++) {
      this.tmp.multiplyMatrices(this.bones[j].matrixWorld, this.inverses[j]);
      this.palette.set(this.tmp.elements, j * 16);
    }
  }

  release(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}

/** Identity palette: reproduces the bind pose exactly (`Σ w·I·v = v`). */
export function bindPosePalette(jointCount: number): Float32Array {
  const palette = new Float32Array(jointCount * 16);
  for (let j = 0; j < jointCount; j++) {
    palette[j * 16] = 1;
    palette[j * 16 + 5] = 1;
    palette[j * 16 + 10] = 1;
    palette[j * 16 + 15] = 1;
  }
  return palette;
}

/**
 * A minimal unskinned asset (one joint, identity palette): a box standing
 * on the ground plane, feet at y = 0, centered over x/z. Diagnostic brush
 * for isolating skinning from attribute/projection/shading layers.
 */
export function makeCubeMesh(size = 0.5): CharacterAsset {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faces: [number[], number[]][] = [
    [[1, 0, 0], [0, 1, 0]],
    [[-1, 0, 0], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0]],
    [[0, 0, -1], [1, 0, 0]],
  ];
  for (const [n, t] of faces) {
    const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
    const half = size / 2;
    const center = [n[0] * half, size / 2 + n[1] * half, n[2] * half];
    const base = positions.length / 3;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(
        center[0] + (t[0] * su + b[0] * sv) * half,
        center[1] + (t[1] * su + b[1] * sv) * half,
        center[2] + (t[2] * su + b[2] * sv) * half,
      );
      normals.push(n[0], n[1], n[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const vertexCount = positions.length / 3;
  return {
    geometry: {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      joints: new Float32Array(vertexCount * 4),
      weights: new Float32Array(vertexCount * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
      indices: new Uint32Array(indices),
      vertexCount,
      jointCount: 1,
    },
    surface: { image: null, factor: [1, 1, 1] },
    source: new Object3D(),
    clips: [],
    height: size,
    worldOffset: [0, 0, 0],
  };
}

/**
 * Parse skinned glTF bytes into a `CharacterAsset`. Takes the first
 * `SkinnedMesh` (the character brush ships exactly one), pre-applies its
 * bind transform to the vertex data, re-anchors feet at y=0 over the
 * origin, and errors by name on unsupported shapes.
 */
export async function parseCharacterAsset(bytes: ArrayBuffer): Promise<CharacterAsset> {
  const gltf = await new Promise<{
    scene: Object3D;
    animations: AnimationClip[];
  }>((resolve, reject) => {
    new GLTFLoader().parse(
      bytes,
      '',
      (g) => resolve({ scene: g.scene, animations: g.animations }),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  let mesh: SkinnedMesh | null = null;
  scene.traverse((obj) => {
    if (!mesh && (obj as SkinnedMesh).isSkinnedMesh) mesh = obj as SkinnedMesh;
  });
  if (!mesh) throw new Error('glTF has no skinned mesh — the character brush needs a rigged model');
  const skinned = mesh as SkinnedMesh;
  const skeleton = skinned.skeleton;
  const jointCount = skeleton.bones.length;
  if (jointCount > MAX_JOINTS) {
    throw new Error(`character has ${jointCount} joints — the limit is ${MAX_JOINTS}`);
  }
  if (skeleton.boneInverses.length !== jointCount) {
    throw new Error('character skeleton is missing inverse bind matrices');
  }

  const geometry = skinned.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const joint = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  if (!position || !normal || !joint || !weight) {
    throw new Error('skinned mesh is missing position/normal/skin attributes');
  }
  const vertexCount = position.count;

  // Bind transform: pre-apply so per-frame palettes land in world space.
  // `bindMatrixInverse` cancels it against the skeleton root at identity
  // (the composition matches three's skinning path exactly).
  const bind = skinned.bindMatrix.clone();

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const v = new Vector3();
  const bindNormal = new Matrix3().setFromMatrix4(bind).invert().transpose();
  for (let i = 0; i < vertexCount; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(bind);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    v.fromBufferAttribute(normal, i).applyMatrix3(bindNormal).normalize();
    normals[i * 3] = v.x;
    normals[i * 3 + 1] = v.y;
    normals[i * 3 + 2] = v.z;
  }

  const joints = new Float32Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < vertexCount; i++) {
      joints[i * 4 + c] = joint.getComponent(i, c);
      weights[i * 4 + c] = weight.getComponent(i, c);
    }
  }

  // World offset: the animation's root transform differs from the bind
  // pose, so feet-anchoring happens in the *rendered* space. Skin the
  // first pose on the CPU and measure it — the constant offset is applied
  // by the draw's origin uniform (post-skinning, so it commutes with the
  // animation), and its x/z centering puts the yaw axis through the body.
  const clone = skeletonClone(scene);
  let skinned0: SkinnedMesh | null = null;
  clone.traverse((obj) => {
    if (!skinned0 && (obj as SkinnedMesh).isSkinnedMesh) skinned0 = obj as SkinnedMesh;
  });
  if (!skinned0) throw new Error('character asset lost its skinned mesh (clone failed)');
  const mixer0 = new AnimationMixer(clone);
  if (gltf.animations.length > 0) mixer0.clipAction(gltf.animations[0]).play();
  mixer0.update(0);
  clone.updateMatrixWorld(true);
  const skeleton0 = (skinned0 as SkinnedMesh).skeleton;
  const probe = new Float32Array(jointCount * 16);
  const tmp = new Matrix4();
  for (let j = 0; j < jointCount; j++) {
    tmp.multiplyMatrices(skeleton0.bones[j].matrixWorld, skeleton0.boneInverses[j]);
    probe.set(tmp.elements, j * 16);
  }
  mixer0.stopAllAction();
  mixer0.uncacheRoot(clone);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const p = new Vector3();
  for (let i = 0; i < vertexCount; i++) {
    p.set(0, 0, 0);
    for (let c = 0; c < 4; c++) {
      const w = weights[i * 4 + c];
      if (w === 0) continue;
      const j = joints[i * 4 + c] * 16;
      p.x += w * (probe[j] * positions[i * 3] + probe[j + 4] * positions[i * 3 + 1] + probe[j + 8] * positions[i * 3 + 2] + probe[j + 12]);
      p.y += w * (probe[j + 1] * positions[i * 3] + probe[j + 5] * positions[i * 3 + 1] + probe[j + 9] * positions[i * 3 + 2] + probe[j + 13]);
      p.z += w * (probe[j + 2] * positions[i * 3] + probe[j + 6] * positions[i * 3 + 1] + probe[j + 10] * positions[i * 3 + 2] + probe[j + 14]);
    }
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!Number.isFinite(minY) || maxY - minY <= 0) {
    throw new Error('character has no measurable extent');
  }
  const height = maxY - minY;
  const worldOffset: [number, number, number] = [
    -(minX + maxX) / 2,
    -minY,
    -(minZ + maxZ) / 2,
  ];

  const indexAttr = geometry.getIndex();
  if (!indexAttr) throw new Error('skinned mesh has no index buffer');
  const indices = new Uint32Array(indexAttr.count);
  for (let i = 0; i < indexAttr.count; i++) indices[i] = indexAttr.getX(i);

  // Base color: first material's map + factor. Textures stay three.js
  // objects; the renderer uploads the image to its own GL texture.
  const material = Array.isArray(skinned.material) ? skinned.material[0] : skinned.material;
  const std = material as { map?: { image?: TexImageSource } | null; color?: { r: number; g: number; b: number } };
  const surface: MeshSurface = {
    image: std.map?.image ?? null,
    factor: std.color ? [std.color.r, std.color.g, std.color.b] : [1, 1, 1],
  };

  const asset0: CharacterAsset = {
    geometry: { positions, normals, joints, weights, indices, vertexCount, jointCount },
    surface,
    source: scene,
    clips: gltf.animations,
    height,
    worldOffset,
  };
  return asset0;
}
