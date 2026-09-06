import type { DataTextureLoaderTexData } from 'three';
import { equirectFromExr, type EquirectRadiance } from '../runtime/shProbe.js';

/**
 * Decode an equirectangular HDRI file (.hdr RGBE or float .exr) into the
 * raw CPU-side radiance the SH probe consumes. Dispatches by extension.
 */
export async function equirectFromHdrBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<EquirectRadiance> {
  if (/\.exr$/i.test(fileName)) return equirectFromExr(buffer);
  const { texture } = await parseHdrFile(buffer, fileName);
  const img = texture.image as { data: Float32Array; width: number; height: number };
  if (!img?.data) throw new Error(`${fileName}: unexpected HDR texture layout`);
  return { rgba: img.data, width: img.width, height: img.height, bottomUp: true };
}

/**
 * Parse an equirectangular HDRI file (.hdr RGBE or float .exr) into a
 * three DataTexture usable as a path-trace environment. Shared by file
 * and workspace loads.
 */
export async function parseHdrFile(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<{ texture: import('three').DataTexture; name: string }> {
  const { DataTexture, RGBAFormat } = await import('three');
  let texData: DataTextureLoaderTexData;
  if (/\.exr$/i.test(fileName)) {
    const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
    texData = new EXRLoader().parse(buffer);
  } else {
    const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
    texData = new HDRLoader().parse(buffer);
  }
  // HDRLoader's TexData carries no `format` (always RGBA); EXR's does.
  if (!texData.data || !texData.width || !texData.height || !texData.type) {
    throw new Error(`${fileName}: not an equirectangular HDRI file (.hdr/.exr)`);
  }
  const texture = new DataTexture(
    texData.data,
    texData.width,
    texData.height,
    texData.format ?? RGBAFormat,
    texData.type,
  );
  if (texData.colorSpace) texture.colorSpace = texData.colorSpace;
  texture.wrapS = texData.wrapS ?? texture.wrapS;
  texture.wrapT = texData.wrapT ?? texture.wrapT;
  texture.magFilter = texData.magFilter ?? texture.magFilter;
  texture.minFilter = texData.minFilter ?? texture.minFilter;
  texture.generateMipmaps = texData.generateMipmaps ?? texture.generateMipmaps;
  texture.flipY = texData.flipY ?? texture.flipY;
  texture.needsUpdate = true;
  return { texture, name: fileName };
}
