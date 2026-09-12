/**
 * Minimal lossless PNG codec for data textures (the terrain coverage
 * splat). Canvas `putImageData`/`getImageData` premultiply and therefore
 * destroy RGB values wherever alpha is 0 — unacceptable for a coverage
 * splat, whose fourth channel can be 0 while the RGB slots still matter.
 * This codec reads and writes the raw 8-bit channels instead.
 *
 * Supports 8-bit grayscale/RGB/RGBA, no interlacing (i.e. what we write,
 * plus common external edits). Pure and Node-verifiable.
 */

import { decompressSync, zlibSync } from 'three/examples/jsm/libs/fflate.module.js';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out, 4, 8 + data.length);
  view.setUint32(8 + data.length, crc);
  return out;
}

/** Encode top-down RGBA8 bytes as a PNG (color type 6, no interlacing). */
export function encodePngRgba(data: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
  if (data.length < width * height * 4) {
    throw new Error(`png: expected ${width * height * 4} RGBA bytes, got ${data.length}`);
  }
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (width * 4 + 1);
    raw[dst] = 0; // filter: none
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), dst + 1);
  }
  const idat = zlibSync(raw);
  return concat([
    new Uint8Array(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export interface DecodedPng {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Decode an 8-bit PNG (grayscale/RGB/RGBA, non-interlaced) to RGBA8. */
export function decodePngRgba(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error('png: bad signature');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('png: truncated chunk');
    if (type === 'IHDR') {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (width <= 0 || height <= 0) throw new Error('png: missing IHDR');
  if (bitDepth !== 8) throw new Error(`png: unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('png: interlaced images are unsupported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : -1;
  if (channels < 0) throw new Error(`png: unsupported color type ${colorType}`);
  const raw = decompressSync(concat(idat));
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (raw.length < expected) throw new Error('png: short image data');
  const out = new Uint8Array(width * height * 4);
  const prior = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filter = raw[base];
    for (let i = 0; i < stride; i++) {
      const x = raw[base + 1 + i];
      const a = i >= channels ? row[i - channels] : 0;
      const b = prior[i];
      const c = i >= channels ? prior[i - channels] : 0;
      let value: number;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: value = x + paeth(a, b, c); break;
        default: throw new Error(`png: unsupported filter ${filter}`);
      }
      row[i] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (channels === 4) {
        out[d] = row[s];
        out[d + 1] = row[s + 1];
        out[d + 2] = row[s + 2];
        out[d + 3] = row[s + 3];
      } else if (channels === 3) {
        out[d] = row[s];
        out[d + 1] = row[s + 1];
        out[d + 2] = row[s + 2];
        out[d + 3] = 255;
      } else {
        out[d] = row[s];
        out[d + 1] = row[s];
        out[d + 2] = row[s];
        out[d + 3] = 255;
      }
    }
    prior.set(row.subarray(0, stride));
  }
  return { data: out, width, height };
}
