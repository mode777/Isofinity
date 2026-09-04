import { halfToFloat } from '../bake/bake.js';
import { parseBake, type BakeProvenance } from '../bake/bundle.js';
import type { BakeManifest } from '../bake/export.js';
import { HalfFloatType, RGBAFormat } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import type { PtImage } from '../bake/pt.js';
import type { BakeResult } from '../bake/bake.js';
import { decodePng } from '../runtime/assets.js';
import type { ExtraViewSlot } from '../shared/iso.js';

/**
 * Decode an opened bundle into the same in-memory shapes a live bake
 * produces (GL readback order, float RGBA), so display and bundle save-as
 * paths need no special cases.
 */
export interface DecodedBundle {
  manifest: BakeManifest;
  provenance: BakeProvenance | null;
  result: BakeResult;
  render: PtImage | null;
  /** Extra stored views (e/s/w); empty for `/4` and `/5` bundles. */
  extraViews: DecodedBundleView[];
}

/** One decoded extra view, in the document's `extraViews` shape. */
export interface DecodedBundleView {
  slot: ExtraViewSlot;
  result: BakeResult;
  render: PtImage | null;
}

/** Top-down PNG bytes -> GL-order PtImage. */
function bytesToPtImage(topDown: Uint8Array, w: number, h: number): PtImage {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = y * w * 4;
    const dst = (h - 1 - y) * w * 4;
    rgba.set(topDown.subarray(src, src + w * 4), dst);
  }
  return { width: w, height: h, rgba };
}

function halfArrayToFloat(half: Uint16Array): Float32Array {
  const out = new Float32Array(half.length);
  for (let i = 0; i < half.length; i++) out[i] = halfToFloat(half[i]);
  return out;
}

/**
 * Decode the g-buffer EXR in GL readback order (bottom-up), matching the
 * `BakeResult.gbuffer` convention. (`decodeExrGbuffer` in assets.ts flips
 * to top-down for texture uploads — the display path needs the unflipped
 * rows so `rgbaToCanvas` can apply its own flip.)
 */
function decodeExrGbufferGl(buffer: ArrayBuffer, w: number, h: number): Float32Array {
  const loader = new EXRLoader();
  loader.type = HalfFloatType;
  const texData = loader.parse(buffer) as {
    width: number;
    height: number;
    format: number;
    type: number;
    data: Uint16Array;
  };
  if (texData.width !== w || texData.height !== h) {
    throw new Error(`g-buffer is ${texData.width}x${texData.height}, manifest says ${w}x${h}`);
  }
  if (texData.type !== HalfFloatType || texData.format !== RGBAFormat) {
    throw new Error(`g-buffer must decode to half-float RGBA (got type=${texData.type} format=${texData.format})`);
  }
  return halfArrayToFloat(texData.data);
}

export async function decodeBundle(buffer: ArrayBuffer): Promise<DecodedBundle> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const parsed = parseBake(bytes);
  const m = parsed.manifest;
  const w = m.sprite.width;
  const h = m.sprite.height;

  const gbufferGl = decodeExrGbufferGl(await parsed.gbuffer.arrayBuffer(), w, h);

  const result: BakeResult = {
    id: m.id,
    label: m.id,
    size: [m.cube.size[0], m.cube.size[1], m.cube.size[2]],
    width: w,
    height: h,
    pxPerUnit: m.pxPerUnit,
    originPx: m.sprite.originPx,
    camera: {
      azimuthDeg: m.camera.azimuthDeg,
      elevationDeg: m.camera.elevationDeg,
      viewDir: m.camera.viewDir,
    },
    gbuffer: gbufferGl,
  };

  const render = parsed.render
    ? bytesToPtImage(await decodePng(parsed.render, w, h), w, h)
    : null;

  const extraViews: DecodedBundleView[] = [];
  for (const view of parsed.views) {
    const vw = view.width;
    const vh = view.height;
    const viewGbufferGl = decodeExrGbufferGl(await view.gbuffer.arrayBuffer(), vw, vh);
    extraViews.push({
      slot: view.slot,
      result: {
        id: m.id,
        label: m.id,
        size: [m.cube.size[0], m.cube.size[1], m.cube.size[2]],
        width: vw,
        height: vh,
        pxPerUnit: m.pxPerUnit,
        originPx: view.originPx,
        camera: {
          // The slot's view azimuth identifies the orientation; viewDir is
          // the fixed world view direction — the axis g-buffer depth is
          // measured along for every view.
          azimuthDeg: view.azimuthDeg,
          elevationDeg: m.camera.elevationDeg,
          viewDir: m.camera.viewDir,
        },
        gbuffer: viewGbufferGl,
      },
      render: view.render ? bytesToPtImage(await decodePng(view.render, vw, vh), vw, vh) : null,
    });
  }

  return { manifest: m, provenance: parsed.provenance, result, render, extraViews };
}
