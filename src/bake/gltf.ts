import {
  Box3,
  ColorManagement,
  Float32BufferAttribute,
  LoadingManager,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { BufferGeometry, Material, Mesh, MeshStandardMaterial, SkinnedMesh, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from './iso.js';
import type { MaterialGroup, Primitive } from './primitives.js';

// Must match bake.ts: raw glTF linear values in material colors, sRGB
// encoding handled explicitly in the bake shader.
ColorManagement.enabled = false;

/** Compressed-payload extensions this tool cannot decode. */
const UNSUPPORTED_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_texture_basisu',
]);

const GLB_MAGIC = 0x46546c67; // 'glTF'
const GLB_JSON_CHUNK = 0x4e4f534a; // 'JSON'

export interface GltfSource {
  id: string;
  label: string;
  /** Unscaled box extent; the box min corner sits at the origin. */
  extent: Vec3;
  /** Material groups normalized into the unscaled box, in draw order. */
  groups: MaterialGroup[];
  /** User-facing notes about ignored content (skins, animations, …). */
  skipped: string[];
  /** Primitive for a given uniform scale (box min stays at the origin). */
  primitive(scale: number): Primitive;
  /** Free merged geometries and loaded textures. */
  dispose(): void;
}

function decodePart(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Percent-decode, normalize separators and strip query/hash so resource URIs
 * can be matched against picked file paths (the glTF spec expects
 * POSIX-style relative paths).
 */
function normalizeUri(uri: string): string {
  const path = uri.replace(/\\/g, '/').split('?')[0].split('#')[0];
  return decodePart(path.replace(/^\.\//, ''));
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function fileKey(file: File): string {
  const rel =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  return normalizeUri(rel);
}

/** Read the JSON section out of a `.gltf` (raw text) or `.glb` (container). */
function readContainerJson(name: string, buffer: ArrayBuffer): Record<string, unknown> {
  if (name.toLowerCase().endsWith('.glb')) {
    const view = new DataView(buffer);
    if (view.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
      throw new Error(`${name}: not a GLB file (bad magic)`);
    }
    if (view.getUint32(4, true) !== 2) {
      throw new Error(`${name}: unsupported GLB version ${view.getUint32(4, true)}`);
    }
    const chunkLength = view.getUint32(12, true);
    const chunkType = view.getUint32(16, true);
    if (chunkType !== GLB_JSON_CHUNK) {
      throw new Error(`${name}: GLB first chunk is not JSON`);
    }
    const text = new TextDecoder().decode(new Uint8Array(buffer, 20, chunkLength));
    return JSON.parse(text) as Record<string, unknown>;
  }
  return JSON.parse(new TextDecoder().decode(buffer)) as Record<string, unknown>;
}

function rejectUnsupportedExtensions(name: string, json: Record<string, unknown>): void {
  const used = (json.extensionsUsed as string[] | undefined) ?? [];
  for (const ext of used) {
    if (UNSUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(
        `${name}: unsupported glTF extension "${ext}" — Draco/Meshopt/KTX2 payloads are not supported`,
      );
    }
  }
}

interface ResourceMap {
  byPath: Map<string, File>;
  byBasename: Map<string, File[]>;
}

function buildResourceMap(files: File[]): ResourceMap {
  const map: ResourceMap = { byPath: new Map(), byBasename: new Map() };
  for (const file of files) {
    const key = fileKey(file);
    map.byPath.set(key, file);
    const base = basename(key);
    const list = map.byBasename.get(base);
    if (list) list.push(file);
    else map.byBasename.set(base, [file]);
  }
  return map;
}

/**
 * Resolve a requested resource URI against the picked file set: exact
 * (relative) path first; otherwise a unique basename match — ambiguity or
 * absence is an error, never a silent guess.
 */
function resolveResource(map: ResourceMap, requested: string): File | null {
  const exact = map.byPath.get(requested);
  if (exact) return exact;
  const candidates = map.byBasename.get(basename(requested));
  if (candidates && candidates.length === 1) return candidates[0];
  return null;
}

function describeMissing(requested: string, map: ResourceMap): string {
  const candidates = map.byBasename.get(basename(requested));
  if (candidates && candidates.length > 1) {
    return `ambiguous resource "${requested}" — ${candidates.length} picked files share the name "${basename(requested)}"`;
  }
  return `missing external resource "${requested}"`;
}

function sanitizeId(name: string): string {
  const base = name.replace(/\.(glb|gltf)$/i, '');
  const id = base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'model';
}

interface Collected {
  geometry: BufferGeometry;
  material: Material;
  meshName: string;
}

/** Clone a mesh's geometry with its world transform baked in. */
function bakeWorldTransform(mesh: Mesh): BufferGeometry {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

/** Keep only the attributes the bake consumes, so groups merge cleanly. */
function stripAttributes(geometry: BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') {
      geometry.deleteAttribute(name);
    }
  }
}

function ensureUv(geometry: BufferGeometry): void {
  if (geometry.getAttribute('uv')) return;
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
}

function isMasked(material: Material): boolean {
  return !material.transparent && material.alphaTest > 0;
}

export async function loadGltf(files: File[]): Promise<GltfSource> {
  const modelFiles = files.filter((f) => /\.(glb|gltf)$/i.test(f.name));
  if (modelFiles.length === 0) {
    throw new Error('no .glb or .gltf file in the selection');
  }
  if (modelFiles.length > 1) {
    throw new Error('select exactly one .gltf or .glb (plus its external resources)');
  }
  const modelFile = modelFiles[0];
  const others = files.filter((f) => f !== modelFile);

  const buffer = await modelFile.arrayBuffer();
  let json: Record<string, unknown>;
  try {
    json = readContainerJson(modelFile.name, buffer);
  } catch {
    json = {};
  }
  rejectUnsupportedExtensions(modelFile.name, json);

  const resourceMap = buildResourceMap([modelFile, ...others]);
  let missingResource: string | null = null;
  const blobUrls: string[] = [];

  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data:|blob:|https?:)/i.test(url)) return url;
    const file = resolveResource(resourceMap, normalizeUri(url));
    if (!file) {
      if (!missingResource) missingResource = normalizeUri(url);
      const empty = URL.createObjectURL(new Blob([], { type: 'application/octet-stream' }));
      blobUrls.push(empty);
      return empty;
    }
    const objectUrl = URL.createObjectURL(file);
    blobUrls.push(objectUrl);
    return objectUrl;
  });

  const loader = new GLTFLoader(manager);
  let gltf: GLTF;
  try {
    gltf = await loader.parseAsync(
      modelFile.name.toLowerCase().endsWith('.glb') ? buffer : new TextDecoder().decode(buffer),
      '',
    );
    if (missingResource) {
      throw new Error(describeMissing(missingResource, resourceMap));
    }
  } catch (err) {
    for (const url of blobUrls) URL.revokeObjectURL(url);
    if (missingResource) {
      throw new Error(describeMissing(missingResource, resourceMap));
    }
    throw err;
  }
  for (const url of blobUrls) URL.revokeObjectURL(url);

  const skipped: string[] = [];
  if (gltf.animations.length > 0) {
    skipped.push(`${gltf.animations.length} animation(s)`);
  }

  gltf.scene.updateMatrixWorld(true);
  const collected: Collected[] = [];
  gltf.scene.traverse((obj) => {
    if (!(obj as Mesh).isMesh || !obj.visible) return;
    const mesh = obj as Mesh;
    if ((mesh as SkinnedMesh).isSkinnedMesh || (mesh as SkinnedMesh).skeleton) {
      skipped.push(`skinned mesh "${mesh.name || 'unnamed'}"`);
      return;
    }
    if (Array.isArray(mesh.material)) {
      skipped.push(`multi-material mesh "${mesh.name || 'unnamed'}"`);
      return;
    }
    const geometry = bakeWorldTransform(mesh);
    stripAttributes(geometry);
    const name = mesh.name || 'unnamed';
    if (!geometry.getAttribute('normal')) {
      throw new Error(`mesh "${name}" has no normals — the g-buffer needs baked normals`);
    }
    if ((mesh.material as Material & { map?: Texture | null }).map && !geometry.getAttribute('uv')) {
      throw new Error(`mesh "${name}" has no UVs but its material has a base-color texture`);
    }
    ensureUv(geometry);
    collected.push({ geometry, material: mesh.material, meshName: name });
  });

  if (collected.length === 0) {
    throw new Error(
      skipped.length > 0
        ? `no static meshes found — only: ${skipped.join(', ')}`
        : 'no meshes found in the file',
    );
  }

  // Normalize placement: the merged bounding-box min corner goes to the
  // origin; native dimensions are preserved (scaling happens at bake time).
  const box = new Box3();
  for (const { geometry } of collected) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  const min = box.min;
  for (const { geometry } of collected) {
    geometry.translate(-min.x, -min.y, -min.z);
  }
  const extent: Vec3 = [
    box.max.x - min.x,
    box.max.y - min.y,
    box.max.z - min.z,
  ];

  // Group by material (identity) and merge each group into one geometry.
  const byMaterial = new Map<Material, BufferGeometry[]>();
  for (const { geometry, material } of collected) {
    const list = byMaterial.get(material);
    if (list) list.push(geometry);
    else byMaterial.set(material, [geometry]);
  }

  const groups: MaterialGroup[] = [];
  const textures: Texture[] = [];
  for (const [material, geometries] of byMaterial) {
    // mergeGeometries needs a consistent indexed/non-indexed set.
    const allIndexed = geometries.every((g) => g.getIndex() !== null);
    const noneIndexed = geometries.every((g) => g.getIndex() === null);
    const mergeable =
      allIndexed || noneIndexed ? geometries : geometries.map((g) => g.toNonIndexed());
    const merged = mergeGeometries(mergeable, false);
    if (!merged) {
      throw new Error(`failed to merge geometry for material "${material.name || 'unnamed'}"`);
    }
    const map = (material as Material & { map?: Texture | null }).map ?? null;
    if (map) {
      map.colorSpace = SRGBColorSpace;
      map.wrapS = RepeatWrapping;
      map.wrapT = RepeatWrapping;
      textures.push(map);
    }
    // All glTF-produced materials carry a base color.
    const color = (material as Material & { color: { r: number; g: number; b: number } }).color;
    groups.push({
      geometry: merged,
      albedoTexture: map,
      baseColorFactor: [color.r, color.g, color.b, material.opacity],
      alphaMode: isMasked(material) ? 'mask' : 'opaque',
      alphaCutoff: material.alphaTest > 0 ? material.alphaTest : 0,
      // The path-traced render stage consumes the full PBR material.
      // GLTFLoader can yield MeshPhysicalMaterial (extends Standard) for
      // transmission-style extensions; non-standard materials (unlit) fall
      // back to the base-color fields in the render stage.
      pbrMaterial: (material as Material & { isMeshStandardMaterial?: boolean })
        .isMeshStandardMaterial
        ? (material as MeshStandardMaterial)
        : null,
    });
  }
  // The un-merged, world-baked clones are no longer needed once merged.
  for (const { geometry } of collected) geometry.dispose();

  const id = sanitizeId(modelFile.name);
  const label = modelFile.name;

  return {
    id,
    label,
    extent,
    groups,
    skipped,
    primitive(scale: number): Primitive {
      return {
        id,
        label,
        albedoHex: 0xffffff,
        size: [extent[0] * scale, extent[1] * scale, extent[2] * scale],
        geometry: groups[0].geometry,
        groups,
        scale,
      };
    },
    dispose(): void {
      for (const group of groups) {
        group.geometry.dispose();
        const pbr = group.pbrMaterial;
        if (pbr) {
          for (const tex of [
            pbr.map,
            pbr.normalMap,
            pbr.roughnessMap,
            pbr.metalnessMap,
            pbr.aoMap,
            pbr.emissiveMap,
          ]) {
            if (tex) tex.dispose();
          }
        }
      }
      for (const texture of textures) texture.dispose();
    },
  };
}
