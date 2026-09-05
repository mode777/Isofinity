/**
 * Node-runnable verification for the multi-view bundle logic (no WebGL, no
 * DOM): /6 manifest shape, parse round trips, /4+/5 compatibility, and
 * remove-view omission. Run with:
 *   npx esbuild src/bake/views-verify.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/views-verify.mjs && node /tmp/views-verify.mjs
 */
import { buildBundle, parseBake } from './bundle.js';
import type { BakeResult } from './bake.js';
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { slotAzimuthDeg, type ViewSlot } from '../shared/iso.js';
import { orderedViewSlots, parseViewLayerId, viewLayerId } from '../runtime/assets.js';

declare const process: { exit(code?: number): void };

let passed = 0;
let failed = 0;

function ok(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ok - ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL - ${msg}`);
  }
}

function approx(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

let fakeId = 0;

/** A synthetic BakeResult — no WebGL needed for bundle-level checks. */
function fakeResult(azimuthDeg: number, width = 66, height = 40): BakeResult {
  const el = (30 * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return {
    id: `fake${++fakeId}`,
    label: `fake${fakeId}`,
    size: [1, 1, 1],
    width,
    height,
    pxPerUnit: 128,
    originPx: [3.5, 7.25],
    camera: {
      azimuthDeg,
      elevationDeg: 30,
      viewDir: [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)],
    },
    // Non-zero somewhere so an EXR encode/decode round trip has content.
    gbuffer: new Float32Array(width * height * 4).fill(0).map((_, i) =>
      i % 4 === 3 ? 0 : (i % 11) / 11,
    ),
  };
}

async function main(): Promise<void> {
  const north = fakeResult(slotAzimuthDeg('n'));
  const east = fakeResult(slotAzimuthDeg('e'));

  // 1. /6 round trip with one extra view.
  {
    console.log('test: /6 round trip with n + e views');
    const bytes = await buildBundle(north, undefined, undefined, [
      { slot: 'e', result: east },
    ]);
    const parsed = parseBake(bytes.buffer as ArrayBuffer);
    ok(parsed.manifest.format === 'isoinfinity-bake/6', `format /6 (got ${parsed.manifest.format})`);
    ok(approx(parsed.manifest.camera.azimuthDeg, 45, 1e-6), 'top-level camera stays the north view');
    const table = parsed.manifest.views ?? [];
    ok(table.length === 2 && table[0].slot === 'n' && table[1].slot === 'e',
      `view table lists n + e (got ${JSON.stringify(table.map((v) => v.slot))})`);
    ok(approx(table[1].azimuthDeg, 135, 1e-6) &&
        table[1].sprite.width === east.width &&
        table[1].sprite.height === east.height,
      `e view records azimuth + sprite rect (got ${JSON.stringify(table[1])})`);
    ok(table[0].passes.gbuffer.file === `${north.id}-gbuffer.exr`,
      'n keeps the historical entry names');
    ok(table[1].passes.gbuffer.file === `${north.id}-e-gbuffer.exr`,
      'e uses the per-view entry names');
    ok(parsed.views.length === 1 && parsed.views[0].slot === 'e' &&
        parsed.views[0].gbuffer.size > 0,
      'parser exposes the e view g-buffer blob');
    ok(parsed.views[0].originPx[0] === east.originPx[0] &&
        parsed.views[0].width === east.width,
      'parsed e view keeps its sprite rect');
    ok(parsed.render === null && parsed.views[0].render === null,
      'no render passes in a raster-only bundle');
  }

  // 2. Remove-view omission: saving without the extra view drops it.
  {
    console.log('test: removed view omitted from the next save');
    const bytes = await buildBundle(north);
    const parsed = parseBake(bytes.buffer as ArrayBuffer);
    ok(parsed.views.length === 0, 'no extra view blobs after removal');
    ok((parsed.manifest.views ?? []).length === 1 && parsed.manifest.views![0].slot === 'n',
      'view table records only north after removal');
  }

  // 3. Per-view render pass entries (fixture-built: PNG encoding needs a
  // canvas, so the encode side is covered by the browser scratch-verify).
  {
    console.log('test: per-view render pass entries');
    const makeZip = (manifest: Record<string, unknown>, extra: Record<string, Uint8Array> = {}): Uint8Array =>
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'x-gbuffer.exr': new Uint8Array(4),
        ...extra,
      });
    const passes = {
      gbuffer: { file: 'x-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
      render: { file: 'x-render.png', encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' },
    };
    const manifest = {
      format: 'isoinfinity-bake/6',
      id: 'x',
      pxPerUnit: 128,
      sprite: { width: 2, height: 2, originPx: [0, 0] },
      passes,
      environment: { procedural: true },
      renderer: { name: 'pt', samples: 16, bounces: 2, denoise: false, seed: 0 },
      views: [
        { slot: 'n', azimuthDeg: 45, sprite: { width: 2, height: 2, originPx: [0, 0] }, passes },
        {
          slot: 'e',
          azimuthDeg: 135,
          sprite: { width: 3, height: 2, originPx: [1, 0] },
          passes: {
            gbuffer: { file: 'x-e-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
            render: { file: 'x-e-render.png', encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' },
          },
        },
      ],
    };
    const parsed = parseBake(
      makeZip(manifest, { 'x-render.png': new Uint8Array(4), 'x-e-gbuffer.exr': new Uint8Array(4), 'x-e-render.png': new Uint8Array(4) }).buffer as ArrayBuffer,
    );
    ok(parsed.render !== null && parsed.render.size > 0, 'n render blob present');
    ok(parsed.views[0].render !== null && parsed.views[0].render!.size > 0, 'e render blob present');
    ok(parsed.manifest.renderer !== undefined && parsed.manifest.environment !== undefined,
      'renderer/environment recorded for the render passes');
    ok(parsed.views[0].width === 3 && parsed.views[0].originPx[0] === 1,
      'e view keeps its distinct sprite rect');
  }

  // 4. Hand-built fixtures: /5 and /4 read as single-view (n) sprites.
  {
    console.log('test: /5 and /4 fixtures read single-view');
    const makeZip = (manifest: Record<string, unknown>, extra: Record<string, Uint8Array> = {}): Uint8Array =>
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'x-gbuffer.exr': new Uint8Array(4),
        ...extra,
      });
    const base = (format: string, passes: Record<string, unknown>): Record<string, unknown> => ({
      format,
      id: 'x',
      pxPerUnit: 128,
      sprite: { width: 2, height: 2, originPx: [0, 0] },
      passes,
    });
    const gbufferPasses = {
      gbuffer: { file: 'x-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
    };

    const v5 = parseBake(makeZip(base('isoinfinity-bake/5', gbufferPasses)).buffer as ArrayBuffer);
    ok(v5.views.length === 0, '/5 has no extra views');
    ok(v5.gbuffer.size > 0, '/5 g-buffer loads');

    const v4Passes = {
      ...gbufferPasses,
      render: { file: 'x-render.png', encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' },
    };
    const v4 = parseBake(
      makeZip(base('isoinfinity-bake/4', v4Passes), { 'x-render.png': new Uint8Array(4) }).buffer as ArrayBuffer,
    );
    ok(v4.views.length === 0 && v4.render !== null, '/4 reads single-view with its render pass');

    let threw = '';
    try {
      parseBake(makeZip(base('isoinfinity-bake/7', gbufferPasses)).buffer as ArrayBuffer);
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }
    ok(threw.includes('isoinfinity-bake/7'), `unknown format rejected by name (got "${threw}")`);

    // A /6 manifest with an unknown slot is rejected by name.
    const badSlot = base('isoinfinity-bake/6', gbufferPasses);
    badSlot.views = [
      {
        slot: 'x',
        azimuthDeg: 45,
        sprite: { width: 2, height: 2, originPx: [0, 0] },
        passes: gbufferPasses,
      },
    ];
    threw = '';
    try {
      parseBake(makeZip(badSlot).buffer as ArrayBuffer);
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }
    ok(threw.includes('view slot'), `unknown view slot rejected (got "${threw}")`);
  }

  // 5. Placement-direction support: which views a bundle exposes as
  // placeable (loadBundleViews decodes the same set — the PNG decode
  // itself needs a browser and is covered by the scratch-verify), plus
  // the direction-tagged layer-id convention.
  {
    console.log('test: per-view placeability + direction-tagged layer ids');
    const makeZip = (manifest: Record<string, unknown>, extra: Record<string, Uint8Array> = {}): Uint8Array =>
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'x-gbuffer.exr': new Uint8Array(4),
        ...extra,
      });
    const viewPasses = (render: boolean, tag = ''): Record<string, unknown> => ({
      gbuffer: { file: `x${tag}-gbuffer.exr`, encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
      ...(render
        ? { render: { file: `x${tag}-render.png`, encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' } }
        : {}),
    });
    const slotEntry = (slot: ViewSlot, render: boolean): Record<string, unknown> => ({
      slot,
      azimuthDeg: slotAzimuthDeg(slot),
      sprite: { width: 2, height: 2, originPx: [0, 0] },
      passes: viewPasses(render, slot === 'n' ? '' : `-${slot}`),
    });
    // n/e/w with render passes, s stored without one (not placeable).
    const manifest: Record<string, unknown> = {
      format: 'isoinfinity-bake/6',
      id: 'x',
      pxPerUnit: 128,
      sprite: { width: 2, height: 2, originPx: [0, 0] },
      passes: viewPasses(true),
      views: [slotEntry('n', true), slotEntry('e', true), slotEntry('s', false), slotEntry('w', true)],
    };
    const entries: Record<string, Uint8Array> = {};
    for (const slot of ['e', 's', 'w'] as const) {
      entries[`x-${slot}-gbuffer.exr`] = new Uint8Array(4);
    }
    entries['x-render.png'] = new Uint8Array(4);
    entries['x-e-render.png'] = new Uint8Array(4);
    entries['x-w-render.png'] = new Uint8Array(4);
    const parsed = parseBake(makeZip(manifest, entries).buffer as ArrayBuffer);
    const placeable = ['n', ...parsed.views.filter((v) => v.render !== null).map((v) => v.slot)];
    const skipped = parsed.views.filter((v) => v.render === null).map((v) => v.slot);
    ok(JSON.stringify(placeable) === JSON.stringify(['n', 'e', 'w']),
      `placeable views are n/e/w (got ${JSON.stringify(placeable)})`);
    ok(JSON.stringify(skipped) === JSON.stringify(['s']),
      `s skipped for lacking a render pass (got ${JSON.stringify(skipped)})`);
    ok(JSON.stringify(orderedViewSlots(skipped)) === JSON.stringify(['s']),
      'orderedViewSlots sorts into N/E/S/W order');

    ok(viewLayerId('tree', 'n') === 'tree' && viewLayerId('tree', 'e') === 'tree@e',
      'viewLayerId keeps north plain and tags extra slots');
    ok(parseViewLayerId('tree').slot === 'n' && parseViewLayerId('tree@w').asset === 'tree' &&
        parseViewLayerId('tree@w').slot === 'w',
      'parseViewLayerId round-trips tagged ids');
    ok(parseViewLayerId('tree@mail').slot === 'n' && parseViewLayerId('tree@mail').asset === 'tree@mail',
      'non-slot @ suffixes stay part of the asset id');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
