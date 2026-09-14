/**
 * Bounds concurrent bitmap decodes. A burst of `createImageBitmap` calls —
 * several material slots loading at once, or a run of extra-view resolves —
 * can starve the browser's image decoder and stall a single decode; this
 * serializes them through a small window. Pure async semaphore (no DOM, no
 * timing APIs), so it is Node-verifiable.
 */

const MAX_CONCURRENT_DECODES = 4;

let active = 0;
const waiters: (() => void)[] = [];

export async function withDecodeSlot<T>(decode: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_DECODES) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active += 1;
  try {
    return await decode();
  } finally {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}
