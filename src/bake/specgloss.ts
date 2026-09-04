/**
 * In-browser conversion of deprecated `KHR_materials_pbrSpecularGlossiness`
 * materials to the metallic-roughness workflow, used by the workspace
 * model-open flow (see the model-material-migration spec).
 *
 * Confirmed @gltf-transform v4.5 call shapes (spiked against the installed
 * dist; Node-side verified end to end on a fixture GLB):
 *
 *   const io = new WebIO().registerExtensions([
 *     KHRMaterialsPBRSpecularGlossiness, KHRMaterialsSpecular, KHRMaterialsIOR,
 *   ]);
 *   const doc = await io.readBinary(new Uint8Array(await file.arrayBuffer()));
 *   await doc.transform(metalRough());
 *   const glb = await io.writeBinary(doc); // Uint8Array
 *
 * - KHRMaterialsPBRSpecularGlossiness MUST be registered before readBinary;
 *   otherwise the reader drops it and metalRough() warns and no-ops. The
 *   two OUTPUT extensions (Specular, IOR) must also be registered — the
 *   writer silently skips extensions it does not know ("Some extensions
 *   were not registered for I/O").
 * - readBinary/writeBinary take and return bytes directly — no blob URL or
 *   filesystem access involved, so WebIO's fetch-based readURI never runs.
 * - metalRough() maps diffuse → baseColor, glossiness → roughness (texture:
 *   G channel = 1 − A·glossiness), metalness stays 0, preserves tinted
 *   specular via KHR_materials_specular (+ KHR_materials_ior, ior 1000).
 *   Both extensions are handled by the installed three GLTFLoader.
 * - The ior = 1000 trick saturates three's realtime ior-derived F0
 *   (min(pow2((ior−1)/(ior+1)) × tint, 1)) so the specular look survives,
 *   and its Lambert diffuse is not reduced against F0 — the realtime view
 *   looks right. three-gpu-pathtracer instead treats ior physically
 *   (f0 = ((ior−1)/(ior+1))² ≈ 1 and diffuse × (1 − disneyFresnel)), so
 *   baked renders come out nearly black. `clampDegenerateIor` below
 *   rewrites ior to the glTF-normal 1.5 after the transform: both
 *   renderers then see a standard dielectric (F0 = 0.04 × tint).
 *
 * The gltf-transform packages are imported dynamically so they stay in a
 * lazy chunk outside the editor's main bundle.
 */
import type { Document } from '@gltf-transform/core';
import type { IOR } from '@gltf-transform/extensions';
import { readContainerJson } from './gltf.js';

/** Refuse anything but .glb — the .gltf file-set workflow is out of scope. */
function assertGlbName(fileName: string): void {
  if (!fileName.toLowerCase().endsWith('.glb')) {
    throw new Error(`${fileName}: only .glb files can be converted to metallic-roughness`);
  }
}

/** Parse a GLB into a Document, validating the container cheaply first. */
function asGlbBytes(file: File): Promise<Uint8Array<ArrayBuffer>> {
  return file.arrayBuffer().then((buffer) => {
    readContainerJson(file.name, buffer); // throws on bad magic/version/chunks
    return new Uint8Array(buffer);
  });
}

/**
 * metalRough() emits ior = 1000 (see header); clamp degenerate values to
 * the glTF-normal 1.5 so the path tracer's physical ior handling cannot
 * annihilate the diffuse term. Legitimate KHR_materials_ior values live in
 * roughly [1, 2] and are left untouched.
 */
function clampDegenerateIor(doc: Document): void {
  for (const material of doc.getRoot().listMaterials()) {
    const ior = material.getExtension<IOR>('KHR_materials_ior');
    if (ior && (ior.getIOR() > 2 || ior.getIOR() < 1)) ior.setIOR(1.5);
  }
}

/**
 * Convert a specGloss `.glb` to metallic-roughness. Throws (with the file
 * name) on any parse, conversion, or encode failure; the caller owns the
 * decision to overwrite the original file only after this resolves.
 */
export async function convertSpecGlossToMR(file: File): Promise<Uint8Array<ArrayBuffer>> {
  assertGlbName(file.name);
  const bytes = await asGlbBytes(file);
  try {
    const [{ WebIO }, { KHRMaterialsPBRSpecularGlossiness, KHRMaterialsSpecular, KHRMaterialsIOR }, { metalRough }] =
      await Promise.all([
        import('@gltf-transform/core'),
        import('@gltf-transform/extensions'),
        import('@gltf-transform/functions'),
      ]);
    const io = new WebIO().registerExtensions([
      KHRMaterialsPBRSpecularGlossiness,
      KHRMaterialsSpecular,
      KHRMaterialsIOR,
    ]);
    const doc = await io.readBinary(bytes);
    await doc.transform(metalRough());
    clampDegenerateIor(doc);
    return await io.writeBinary(doc);
  } catch (err) {
    throw new Error(
      `${file.name}: specular-glossiness conversion failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
