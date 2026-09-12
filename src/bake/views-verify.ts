/**
 * Node-runnable verification for the multi-view bundle logic (no WebGL,
 * no DOM): /6 manifest shape, parse round trips, /4+/5 compatibility,
 * remove-view omission, and the load-time depth-validity guard. Run with:
 *   npx esbuild src/bake/views-verify.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/views-verify.mjs && node /tmp/views-verify.mjs
 */
import { buildBundle, parseBake, parseBakeManifest, type BakeProvenance } from './bundle.js';
import { applySlotModelRotation, PAD_PX } from './bake.js';
import type { BakeResult } from './bake.js';
import { buildManifest, encodeExr } from './export.js';
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { Object3D } from 'three';
import { depthRange, frameIsoBox, projectBoxFrame, ISO_AZIMUTH_DEG } from './iso.js';
import {
  slotAnchorPoint,
  slotAzimuthDeg,
  slotYawDeg,
  VIEW_SLOTS,
  yawRotatedBoxSize,
  type Vec3,
  type ViewSlot,
} from '../shared/iso.js';
import {
  loadBundleNorth,
  loadBundleViews,
  orderedViewSlots,
  parseViewLayerId,
  resolveBundleView,
  viewLayerId,
  VIEW_SKIP_NO_RENDER,
  VIEW_SKIP_NOT_STORED,
  VIEW_SKIP_STALE_DEPTH,
  type BundleSource,
} from '../runtime/assets.js';
import {
  boxBlur,
  composeGroundShadow,
  groundShadowFrame,
  groundShadowMask,
  groundShadowPadPx,
  GROUND_SHADOW_TINT,
} from './shadow.js';

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

  // 1b. The authored-anchor slot mapping mirrors the slot model rotation:
  // every point of the unrotated asset must land where the rotated model
  // puts it, so per-slot origins anchor the same spot of the asset.
  {
    console.log('test: slotAnchorPoint mirrors the slot model rotation');
    const size: Vec3 = [2, 1, 0.5];
    const points: Vec3[] = [];
    for (let i = 0; i < 8; i++) {
      points.push([
        (i & 1) * size[0],
        ((i >> 1) & 1) * size[1],
        ((i >> 2) & 1) * size[2],
      ]);
    }
    points.push([0.3 * size[0], 0.4 * size[1], 0.9 * size[2]]);
    let mismatches = 0;
    for (const slot of VIEW_SLOTS) {
      const yaw = slotYawDeg(slot);
      for (const p of points) {
        const obj = new Object3D();
        obj.position.set(p[0], p[1], p[2]);
        applySlotModelRotation(obj, size, yaw);
        const want = slotAnchorPoint(p, size, yaw);
        if (
          !approx(obj.position.x, want[0], 1e-9) ||
          !approx(obj.position.y, want[1], 1e-9) ||
          !approx(obj.position.z, want[2], 1e-9)
        ) {
          mismatches++;
        }
      }
    }
    ok(mismatches === 0, `all box corners map identically in every slot (${mismatches} mismatches)`);
  }

  // 1c. Authored origin: the provenance record and the per-view originPx
  // derived from the anchor (quarter-turn + pure projection) survive a
  // bundle save/parse unchanged.
  {
    console.log('test: authored origin round trips through the manifest');
    const prov: BakeProvenance = {
      source: { kind: 'primitive', primitive: 'cube' },
      bake: { samples: 16, bounces: 2, textureSize: 256 },
      environment: { procedural: true },
    };
    const size: Vec3 = [2, 1, 0.5];
    const anchor: Vec3 = [0.5, 0.25, 0.125];

    // The E slot's derived anchor + projected originPx, computed the same
    // way the editor derives them.
    const rotated = yawRotatedBoxSize(size, 90);
    const anchorE = slotAnchorPoint(anchor, size, 90);
    const originPxE = projectBoxFrame(rotated, 128, PAD_PX, ISO_AZIMUTH_DEG, anchorE).origin;

    const north = { ...fakeResult(slotAzimuthDeg('n')), size, originPx: [4.5, 8.25] as [number, number] };
    const eastView = { ...fakeResult(slotAzimuthDeg('e')), size: rotated, originPx: originPxE };
    const bytes = await buildBundle(
      north,
      undefined,
      { ...prov, origin: [...anchor] as [number, number, number] },
      [{ slot: 'e', result: eastView }],
    );
    const parsed = parseBake(bytes.buffer as ArrayBuffer);
    ok(
      parsed.manifest.provenance !== undefined &&
        JSON.stringify(parsed.manifest.provenance!.origin) === JSON.stringify([0.5, 0.25, 0.125]),
      `provenance origin round trips (got ${JSON.stringify(parsed.manifest.provenance?.origin)})`,
    );
    const nEntry = (parsed.manifest.views ?? []).find((v) => v.slot === 'n');
    const eEntry = (parsed.manifest.views ?? []).find((v) => v.slot === 'e');
    ok(
      !!nEntry &&
        approx(nEntry.sprite.originPx[0], 4.5, 5e-4) &&
        approx(nEntry.sprite.originPx[1], 8.25, 5e-4),
      'n view keeps its anchored originPx',
    );
    ok(
      !!eEntry &&
        approx(eEntry.sprite.originPx[0], originPxE[0], 5e-4) &&
        approx(eEntry.sprite.originPx[1], originPxE[1], 5e-4),
      'e view keeps the derived projected originPx',
    );
    ok(
      parsed.views[0].slot === 'e' && approx(parsed.views[0].originPx[0], originPxE[0], 5e-4),
      'parsed e view record carries the derived originPx',
    );
  }

  // 1d. buildManifest normalizes the provenance origin: rounded at 1e-4,
  // dropped entirely at the default (byte-stability with older saves).
  {
    console.log('test: provenance origin normalized (round + default omission)');
    const prov: BakeProvenance = {
      source: { kind: 'primitive', primitive: 'cube' },
      bake: { samples: 16, bounces: 2, textureSize: 256 },
      environment: { procedural: true },
    };
    const north = fakeResult(slotAzimuthDeg('n'));
    const rounded = await buildBundle(north, undefined, {
      ...prov,
      origin: [0.12345678, 0, 0],
    });
    const parsedRounded = parseBake(rounded.buffer as ArrayBuffer);
    ok(
      parsedRounded.manifest.provenance?.origin?.[0] === 0.1235,
      `origin rounds to 1e-4 (got ${JSON.stringify(parsedRounded.manifest.provenance?.origin)})`,
    );
    const defaulted = await buildBundle(north, undefined, { ...prov, origin: [0, 0, 0] });
    const parsedDefaulted = parseBake(defaulted.buffer as ArrayBuffer);
    ok(
      parsedDefaulted.manifest.provenance !== undefined &&
        parsedDefaulted.manifest.provenance!.origin === undefined,
      'default origin omitted from the manifest',
    );
    // Byte-stability: a default-anchored manifest is byte-identical to a
    // pre-origin manifest of the same passes.
    const result = north;
    const withDefault = JSON.stringify(buildManifest(result, undefined, { ...prov, origin: [0, 0, 0] }));
    const withoutField = JSON.stringify(buildManifest(result, undefined, prov));
    ok(withDefault === withoutField, 'default-origin manifest bytes equal pre-origin bytes');
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

  // 5b. Load-time depth-validity guard: loadBundleViews skips extra views
  //     whose decoded g-buffer depth leaves the manifest's recorded range
  //     (the stale camera-frame slot signature) and fails the load when
  //     north is stale. EXR g-buffers encode/decode for real; the PNG
  //     render decode is stubbed (encoding needs a canvas, the render
  //     bytes are irrelevant to the guard, and the real decode is covered
  //     by the browser scratch-verify).
  {
    console.log('test: load-time depth-validity guard (loadBundleViews)');
    (globalThis as Record<string, unknown>).createImageBitmap = () =>
      Promise.resolve({ width: 8, height: 8, close() {} });
    (globalThis as Record<string, unknown>).document = {
      createElement: () => ({
        width: 8,
        height: 8,
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: new Uint8Array(8 * 8 * 4) }),
        }),
      }),
    };

    const exrWithAlpha = async (alpha: number): Promise<Uint8Array> => {
      const result = fakeResult(slotAzimuthDeg('n'), 8, 8);
      result.gbuffer[3] = alpha;
      return encodeExr(result.gbuffer, result.width, result.height);
    };
    const guardBundle = async (
      nDepth: number,
      eDepth: number,
      opts: { depth?: boolean; eRender?: boolean } = {},
    ): Promise<ArrayBuffer> => {
      const { depth = true, eRender = true } = opts;
      const passes = (tag: string): Record<string, unknown> => ({
        gbuffer: {
          file: `x${tag}-gbuffer.exr`,
          encoding: 'exr-f32-linear',
          channels: 'rgb=world-normal a=ray-depth',
        },
        ...(eRender || tag === ''
          ? {
              render: {
                file: `x${tag}-render.png`,
                encoding: 'png-r8-srgb',
                channels: 'rgb=tonemapped-render a=coverage',
              },
            }
          : {}),
      });
      const manifest: Record<string, unknown> = {
        format: 'isoinfinity-bake/6',
        id: 'x',
        pxPerUnit: 128,
        cube: { size: [1, 1, 1], origin: [0, 0, 0] },
        sprite: { width: 8, height: 8, originPx: [0, 0] },
        passes: passes(''),
        views: [
          { slot: 'n', azimuthDeg: 45, sprite: { width: 8, height: 8, originPx: [0, 0] }, passes: passes('') },
          { slot: 'e', azimuthDeg: 135, sprite: { width: 8, height: 8, originPx: [0, 0] }, passes: passes('-e') },
        ],
      };
      if (depth) {
        manifest.depth = { definition: 'dot(worldPos, viewDir)', range: depthRange([1, 1, 1]) };
      }
      return zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'x-gbuffer.exr': await exrWithAlpha(nDepth),
        'x-render.png': new Uint8Array(4),
        'x-e-gbuffer.exr': await exrWithAlpha(eDepth),
        ...(eRender ? { 'x-e-render.png': new Uint8Array(4) } : {}),
      }).buffer as ArrayBuffer;
    };

    const staleE = await loadBundleViews(await guardBundle(0.9, -0.5));
    ok(staleE.extras.length === 0, 'stale e view is not placeable');
    ok(staleE.north.width === 8 && staleE.north.gbuffer.length > 0,
      'north still loads beside a stale extra');
    ok(staleE.skipped.length === 1 && staleE.skipped[0].slot === 'e' &&
        staleE.skipped[0].reason === VIEW_SKIP_STALE_DEPTH,
      `e skipped with the named stale-depth reason (got ${JSON.stringify(staleE.skipped)})`);

    let guardErr = '';
    try {
      await loadBundleViews(await guardBundle(-0.5, 0.9));
    } catch (err) {
      guardErr = err instanceof Error ? err.message : String(err);
    }
    ok(guardErr.includes('north view depth outside the manifest range'),
      `stale north fails the load with a named error (got "${guardErr}")`);

    const control = await loadBundleViews(await guardBundle(0.9, 0.9));
    ok(control.extras.length === 1 && control.extras[0].slot === 'e' &&
        control.skipped.length === 0,
      'in-range bundle loads n + e with nothing skipped');

    const above = await loadBundleViews(
      await guardBundle(0.9, depthRange([1, 1, 1])[1] + 0.5),
    );
    ok(above.extras.length === 0 && above.skipped.length === 1 &&
        above.skipped[0].reason === VIEW_SKIP_STALE_DEPTH,
      'depth above the recorded range is stale too');

    const noRange = await loadBundleViews(await guardBundle(0.9, -0.5, { depth: false }));
    ok(noRange.extras.length === 0 && noRange.skipped.length === 1 &&
        noRange.skipped[0].reason === VIEW_SKIP_STALE_DEPTH,
      'missing manifest range still rejects negative depth');
    const noRangeBig = await loadBundleViews(await guardBundle(0.9, 4, { depth: false }));
    ok(noRangeBig.extras.length === 1 && noRangeBig.skipped.length === 0,
      'missing manifest range leaves the upper bound open');

    const noRender = await loadBundleViews(
      await guardBundle(0.9, 0.9, { eRender: false }),
    );
    ok(noRender.extras.length === 0 && noRender.skipped.length === 1 &&
        noRender.skipped[0].slot === 'e' &&
        noRender.skipped[0].reason === VIEW_SKIP_NO_RENDER,
      `missing render pass keeps its named reason (got ${JSON.stringify(noRender.skipped)})`);

    // 5c. Lazy view loading: the manifest parses without inflating any
    //     pass, north decodes alone, and an extra view is decoded (and
    //     depth-guarded) only when first resolved — then cached.
    console.log('test: lazy view loading (manifest-first + on demand)');
    const lazyBuffer = await guardBundle(0.9, 0.9);
    const info = parseBakeManifest(lazyBuffer);
    ok(
      info.north.renderFile !== null && info.extras.length === 1 && info.extras[0].slot === 'e',
      'parseBakeManifest lists stored views without decoding passes',
    );

    let reads = 0;
    const lazySource: BundleSource = {
      key: 'views-verify/lazy-ok',
      size: lazyBuffer.byteLength,
      lastModified: 1,
      read: async () => {
        reads++;
        return lazyBuffer;
      },
    };
    const loadedNorth = await loadBundleNorth(lazySource);
    ok(
      loadedNorth.north.width === 8 && reads === 1,
      `loadBundleNorth decodes only north (reads=${reads})`,
    );
    const resolvedE = await resolveBundleView(lazySource, 'e');
    ok(
      resolvedE.ok && resolvedE.layer.width === 8 && reads === 2,
      'resolveBundleView decodes the extra view on first request',
    );
    const resolvedAgain = await resolveBundleView(lazySource, 'e');
    ok(resolvedAgain.ok && reads === 2, 'a repeat resolve is cache-served');

    // A changed file identity must not serve stale cached views.
    const changedSource: BundleSource = {
      ...lazySource,
      key: 'views-verify/lazy-changed',
      lastModified: 2,
    };
    await loadBundleNorth(changedSource);
    ok(reads === 3, `a changed file identity reloads (reads=${reads})`);
    const notStored = await resolveBundleView(lazySource, 's');
    ok(
      !notStored.ok && notStored.reason === VIEW_SKIP_NOT_STORED,
      'an unstored slot resolves with the named not-stored reason',
    );

    // The deferred guard fires on first resolve: north loads, the stale
    // extra is skipped with its named cause.
    const staleSource: BundleSource = {
      key: 'views-verify/lazy-stale',
      size: (await guardBundle(0.9, -0.5)).byteLength,
      lastModified: 1,
      read: async () => guardBundle(0.9, -0.5),
    };
    const staleNorth = await loadBundleNorth(staleSource);
    ok(staleNorth.north.width === 8, 'north loads beside a lazy stale extra');
    const lazyStaleE = await resolveBundleView(staleSource, 'e');
    ok(
      !lazyStaleE.ok && lazyStaleE.reason === VIEW_SKIP_STALE_DEPTH,
      'a stale extra view is skipped when first resolved',
    );

    // A stale north fails the north load itself.
    let lazyNorthErr = '';
    try {
      await loadBundleNorth({
        key: 'views-verify/lazy-stale-north',
        size: 1,
        lastModified: 1,
        read: async () => guardBundle(-0.5, 0.9),
      });
    } catch (err) {
      lazyNorthErr = err instanceof Error ? err.message : String(err);
    }
    ok(
      lazyNorthErr.includes('north view depth outside the manifest range'),
      `stale north fails loadBundleNorth with a named error (got "${lazyNorthErr}")`,
    );

    // Only the requested view's bytes are touched: a bundle that lists an
    // extra slot but omits its entry still loads north, and only fails
    // when that slot is resolved.
    const lazyManifest = {
      format: 'isoinfinity-bake/6',
      id: 'lazy',
      pxPerUnit: 128,
      cube: { size: [1, 1, 1], origin: [0, 0, 0] },
      depth: { definition: 'dot', range: depthRange([1, 1, 1]) },
      sprite: { width: 8, height: 8, originPx: [0, 0] },
      passes: {
        gbuffer: { file: 'lazy-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
        render: { file: 'lazy-render.png', encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' },
      },
      views: [
        {
          slot: 'n',
          azimuthDeg: 45,
          sprite: { width: 8, height: 8, originPx: [0, 0] },
          passes: {
            gbuffer: { file: 'lazy-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
            render: { file: 'lazy-render.png', encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' },
          },
        },
        {
          slot: 'e',
          azimuthDeg: 135,
          sprite: { width: 8, height: 8, originPx: [0, 0] },
          passes: {
            gbuffer: { file: 'lazy-e-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
            render: { file: 'lazy-e-render.png', encoding: 'png-r8-srgb', channels: 'rgb=tonemapped-render a=coverage' },
          },
        },
      ],
    };
    const missingExtra = zipSync({
      'manifest.json': strToU8(JSON.stringify(lazyManifest)),
      'lazy-gbuffer.exr': await exrWithAlpha(0.9),
      'lazy-render.png': new Uint8Array(4),
    }).buffer as ArrayBuffer;
    const missingSource: BundleSource = {
      key: 'views-verify/lazy-missing-extra',
      size: missingExtra.byteLength,
      lastModified: 1,
      read: async () => missingExtra,
    };
    const missingNorth = await loadBundleNorth(missingSource);
    ok(missingNorth.north.width === 8, 'north loads although the extra entry is absent');
    let missingErr = '';
    try {
      await resolveBundleView(missingSource, 'e');
    } catch (err) {
      missingErr = err instanceof Error ? err.message : String(err);
    }
    ok(
      missingErr.includes('missing pass lazy-e-gbuffer.exr'),
      `an extra entry is only read when resolved (got "${missingErr}")`,
    );
  }

  // 6. Grounding shadow: provenance flag round trip + default omission.
  {
    console.log('test: grounding-shadow provenance flag round trips');
    const prov: BakeProvenance = {
      source: { kind: 'primitive', primitive: 'cube' },
      bake: { samples: 16, bounces: 2, textureSize: 256 },
      environment: { procedural: true },
    };
    const off = await buildBundle(north, undefined, { ...prov, groundShadow: false });
    const parsedOff = parseBake(off.buffer as ArrayBuffer);
    ok(
      parsedOff.manifest.provenance?.groundShadow === false,
      'disabled toggle records groundShadow: false',
    );
    const on = await buildBundle(north, undefined, prov);
    const parsedOn = parseBake(on.buffer as ArrayBuffer);
    ok(
      parsedOn.manifest.provenance !== undefined &&
        parsedOn.manifest.provenance!.groundShadow === undefined,
      'on default omits the field (byte-stable with older saves)',
    );
    // Unknown-field tolerance: a /6 manifest with an unexpected provenance
    // field still parses (readers ignore what they do not consume).
    const makeZip = (manifest: Record<string, unknown>): Uint8Array =>
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'x-gbuffer.exr': new Uint8Array(4),
      });
    const manifest = {
      format: 'isoinfinity-bake/6',
      id: 'x',
      pxPerUnit: 128,
      sprite: { width: 2, height: 2, originPx: [0, 0] },
      passes: {
        gbuffer: { file: 'x-gbuffer.exr', encoding: 'exr-f32-linear', channels: 'rgb=world-normal a=ray-depth' },
      },
      provenance: {
        source: { kind: 'primitive', primitive: 'cube' },
        bake: { samples: 16, bounces: 2, textureSize: 256 },
        environment: { procedural: true },
        futureField: { anything: true },
      },
    };
    const parsedUnknown = parseBake(makeZip(manifest).buffer as ArrayBuffer);
    ok(parsedUnknown.provenance !== null, 'manifest with unknown provenance fields still parses');
  }

  // 7. Grounding shadow: mask math (blur, splat determinism, composition).
  {
    console.log('test: grounding-shadow mask math');
    // Blur: a centered impulse stays a centered blob, symmetric,
    // deterministic, fading past the kernel radius.
    const g = new Float32Array(25 * 25);
    g[12 * 25 + 12] = 1;
    boxBlur(g, 25, 25, 3);
    ok(g[12 * 25 + 11] === g[12 * 25 + 13] && g[11 * 25 + 12] === g[13 * 25 + 12],
      'blur is symmetric');
    ok(g[12 * 25 + 8] > 0 && g[12 * 25 + 6] < 0.01, 'blur fades past the kernel radius');
    const g2 = new Float32Array(25 * 25);
    g2[12 * 25 + 12] = 1;
    boxBlur(g2, 25, 25, 3);
    ok(g.every((v, i) => v === g2[i]), 'blur is deterministic');

    // Splat + composition over a synthetic unit-cube bake: the ground
    // footprint (a top face at y = 1) splats to a solid core and the
    // composition tints only fully empty pixels.
    const ppu = 128;
    const size: Vec3 = [1, 1, 1];
    const frame = frameIsoBox(size, ppu, 2, ISO_AZIMUTH_DEG, [0, 0, 0], groundShadowPadPx(ppu));
    const { width: w, height: h } = frame;
    const gbuffer = new Float32Array(w * h * 4);
    const vd = frame.viewDir;
    const project = (p: [number, number, number]): [number, number] | null => {
      const cam = frame.camera;
      const e = cam.matrixWorldInverse.elements;
      const px = p[0] * e[0] + p[1] * e[4] + p[2] * e[8] + e[12];
      const py = p[0] * e[1] + p[1] * e[5] + p[2] * e[9] + e[13];
      const sx = (px - cam.left) / (cam.right - cam.left);
      const sy = (py - cam.bottom) / (cam.top - cam.bottom);
      const pixX = Math.floor(sx * w);
      const pixY = Math.floor((1 - sy) * h);
      if (pixX < 0 || pixX >= w || pixY < 0 || pixY >= h) return null;
      return [pixX, pixY];
    };
    const seen = new Set<string>();
    for (let i = 0; i <= 64; i++) {
      for (let j = 0; j <= 64; j++) {
        const p: [number, number, number] = [i / 64, 1, j / 64];
        const pix = project(p);
        if (!pix) continue;
        // GL readback rows are bottom-up.
        const idx = ((h - 1 - pix[1]) * w + pix[0]) * 4;
        gbuffer[idx + 1] = 1; // normal (0,1,0)
        gbuffer[idx + 3] = vd.x * p[0] + vd.y * p[1] + vd.z * p[2];
        seen.add(`${pix[0]},${pix[1]}`);
      }
    }
    const result: BakeResult = {
      id: 'shadowcheck',
      label: 'shadowcheck',
      size,
      width: w,
      height: h,
      pxPerUnit: ppu,
      originPx: frame.originPx,
      camera: { azimuthDeg: 45, elevationDeg: 30, viewDir: [vd.x, vd.y, vd.z] },
      gbuffer,
    };
    const m1 = groundShadowMask(result, frame);
    const m2 = groundShadowMask(result, frame);
    ok(m1.mask.every((v, i) => v === m2.mask[i]), 'splat + blur is deterministic');
    ok(m1.mask.filter((v) => v > 0.9).length > 0, 'mask has a solid core over the footprint');
    ok(m1.mask[0] < 0.1, 'mask fades toward the grid corner');

    const rgba = new Uint8Array(w * h * 4);
    const [oxp, oyp] = [...seen][Math.floor(seen.size / 2)].split(',').map(Number);
    const oiGL = ((h - 1 - oyp) * w + oxp) * 4;
    rgba[oiGL] = 200;
    rgba[oiGL + 1] = 120;
    rgba[oiGL + 2] = 60;
    rgba[oiGL + 3] = 255;
    const composed = composeGroundShadow({ width: w, height: h, rgba }, result, frame);
    ok(
      composed.rgba[oiGL] === 200 && composed.rgba[oiGL + 3] === 255,
      'composition leaves object pixels byte-identical',
    );
    let tinted = 0;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (
        o !== oiGL &&
        composed.rgba[o + 3] > 0 &&
        composed.rgba[o] === GROUND_SHADOW_TINT[0] &&
        composed.rgba[o + 2] === GROUND_SHADOW_TINT[2]
      ) {
        tinted++;
      }
    }
    ok(tinted > 0, `grounding tint composited into empty pixels (${tinted})`);
    ok(tinted < (w * h) / 2, 'the patch stays local to the footprint + reach');
    // Rect growth: shadow frame is the grown frame, matching bake framing.
    const plain = frameIsoBox(size, ppu, 2);
    ok(groundShadowFrame(result).width > plain.width, 'shadow frame grows the rect');
  }

  // 8. Per-slot shadow derivation: each slot's mask comes from its own
  //    (rotated) presentation — a 2x0.5x1 slab's E slot footprint is the
  //    quarter-turned 0.5x1x2 box, and its mask core follows it.
  {
    console.log('test: per-slot grounding-shadow derivation follows the rotated asset');
    const ppu = 64;
    const buildSlot = (size: Vec3, azimuthDeg: number) => {
      const frame = frameIsoBox(size, ppu, 2, ISO_AZIMUTH_DEG, [0, 0, 0], groundShadowPadPx(ppu));
      const { width: w, height: h } = frame;
      const gbuffer = new Float32Array(w * h * 4);
      const vd = frame.viewDir;
      const e = frame.camera.matrixWorldInverse.elements;
      for (let i = 0; i <= 96; i++) {
        for (let j = 0; j <= 96; j++) {
          // top face of the box at y = size[1]
          const p: [number, number, number] = [
            (i / 96) * size[0],
            size[1],
            (j / 96) * size[2],
          ];
          const px = p[0] * e[0] + p[1] * e[4] + p[2] * e[8] + e[12];
          const py = p[0] * e[1] + p[1] * e[5] + p[2] * e[9] + e[13];
          const sx = (px - frame.camera.left) / (frame.camera.right - frame.camera.left);
          const sy = (py - frame.camera.bottom) / (frame.camera.top - frame.camera.bottom);
          const pixX = Math.floor(sx * w);
          const pixY = Math.floor((1 - sy) * h);
          if (pixX < 0 || pixX >= w || pixY < 0 || pixY >= h) continue;
          const idx = ((h - 1 - pixY) * w + pixX) * 4;
          gbuffer[idx + 1] = 1;
          gbuffer[idx + 3] = vd.x * p[0] + vd.y * p[1] + vd.z * p[2];
        }
      }
      const result: BakeResult = {
        id: `slot${size[0]}x${size[2]}`,
        label: 'slot',
        size,
        width: w,
        height: h,
        pxPerUnit: ppu,
        originPx: frame.originPx,
        camera: { azimuthDeg, elevationDeg: 30, viewDir: [vd.x, vd.y, vd.z] },
        gbuffer,
      };
      return { result, frame };
    };
    const north = buildSlot([2, 0.5, 1], 45);
    const east = buildSlot([1, 0.5, 2], 135);
    const mn = groundShadowMask(north.result, north.frame);
    const me = groundShadowMask(east.result, east.frame);
    // Solid-core centroid in ground space: N over x∈[0,2], z∈[0,1];
    // E over x∈[0,1], z∈[0,2].
    const centroid = (m: { mask: Float32Array; width: number; height: number }): [number, number] => {
      let sx = 0;
      let sz = 0;
      let sw = 0;
      for (let z = 0; z < m.height; z++) {
        for (let x = 0; x < m.width; x++) {
          const v = m.mask[z * m.width + x];
          if (v < 0.9) continue;
          sx += x;
          sz += z;
          sw += v;
        }
      }
      return [sx / sw, sz / sw];
    };
    const cell = 1 / 32;
    const [nx, nz] = centroid(mn);
        const [ex, ez] = centroid(me);
    ok(
      Math.abs(nx * cell - 0.25 - 1) < 0.15 && Math.abs(nz * cell - 0.25 - 0.5) < 0.15,
      `N mask core centers on the 2x1 footprint (got ${nx * cell},${nz * cell})`,
    );
    ok(
      Math.abs(ex * cell - 0.25 - 0.5) < 0.15 && Math.abs(ez * cell - 0.25 - 1) < 0.15,
      `E mask core centers on the rotated 1x2 footprint (got ${ex * cell},${ez * cell})`,
    );
  }

  // 9. Origin-anchor order invariance + overlay parity: authoring the
  //    anchor before or after a bake must produce identical framing,
  //    camera and originPx (the anchor is authoring state, never framing
  //    data — ADR 0008), and the sprite editor's overlay projection must
  //    reproduce the bake frame's pixels exactly when it uses the same
  //    ground-shadow pad rule.
  {
    console.log('test: origin-anchor order invariance + overlay parity');
    const ppu = 64;
    const size: Vec3 = [2, 1, 0.5];
    const center: Vec3 = [size[0] / 2, 0, size[2] / 2];

    const bakeFraming = (origin: Vec3, yawDeg: number, shadow: boolean) => {
      const boxSize = yawRotatedBoxSize(size, yawDeg);
      const anchor = slotAnchorPoint(origin, size, yawDeg);
      return frameIsoBox(
        boxSize,
        ppu,
        PAD_PX,
        ISO_AZIMUTH_DEG,
        anchor,
        shadow ? groundShadowPadPx(ppu) : 0,
      );
    };

    for (const shadow of [false, true]) {
      for (const yawDeg of [0, 90]) {
        const boxSize = yawRotatedBoxSize(size, yawDeg);
        // Order A: anchor authored first, then baked.
        const a = bakeFraming(center, yawDeg, shadow);
        // Order B: baked at the default anchor, then re-anchored (the
        // editor's setBakeOrigin math: projectBoxFrame with the slot
        // anchor and the same pad rule).
        const b = bakeFraming([0, 0, 0], yawDeg, shadow);
        const bAnchor = slotAnchorPoint(center, size, yawDeg);
        const bOrigin = projectBoxFrame(
          boxSize,
          ppu,
          PAD_PX,
          ISO_AZIMUTH_DEG,
          bAnchor,
          shadow ? groundShadowPadPx(ppu) : 0,
        ).origin;
        const tag = `shadow=${shadow ? 'on' : 'off'} yaw=${yawDeg}`;
        ok(
          a.width === b.width && a.height === b.height,
          `${tag}: both orders frame the same rect (${a.width}x${a.height})`,
        );
        ok(
          a.camera.projectionMatrix.equals(b.camera.projectionMatrix) &&
            a.camera.matrixWorld.equals(b.camera.matrixWorld),
          `${tag}: both orders project through the identical camera`,
        );
        ok(
          approx(a.originPx[0], bOrigin[0], 1e-9) && approx(a.originPx[1], bOrigin[1], 1e-9),
          `${tag}: both orders record the same originPx`,
        );
        // Anchor-only effect: a non-default anchor moves originPx while
        // the projected box edges (the pixels) stay fixed.
        const plain = projectBoxFrame(boxSize, ppu, PAD_PX, ISO_AZIMUTH_DEG, [0, 0, 0], 0);
        const anchored = projectBoxFrame(boxSize, ppu, PAD_PX, ISO_AZIMUTH_DEG, bAnchor, 0);
        ok(
          (anchored.origin[0] !== plain.origin[0] || anchored.origin[1] !== plain.origin[1]) &&
            plain.edges.every(([p, q], i) =>
              approx(p[0], anchored.edges[i][0][0], 1e-9) &&
              approx(p[1], anchored.edges[i][0][1], 1e-9) &&
              approx(q[0], anchored.edges[i][1][0], 1e-9) &&
              approx(q[1], anchored.edges[i][1][1], 1e-9),
            ),
          `${tag}: the anchor moves the cross, never the box pixels`,
        );
      }
    }

    // Overlay parity: the sprite editor's overlay projection, when given
    // the same ground-shadow pad the bake used, reproduces the bake
    // frame's box-corner pixel and origin cross exactly; omitting the pad
    // (the pre-fix bug) shifts them.
    for (const shadow of [false, true]) {
      const bake = bakeFraming(center, 0, shadow);
      const bakeProj = projectBoxFrame(
        size,
        ppu,
        PAD_PX,
        ISO_AZIMUTH_DEG,
        slotAnchorPoint(center, size, 0),
        shadow ? groundShadowPadPx(ppu) : 0,
      );
      const anchor = slotAnchorPoint(center, size, 0);
      const pad = shadow ? groundShadowPadPx(ppu) : 0;
      const overlay = projectBoxFrame(size, ppu, PAD_PX, ISO_AZIMUTH_DEG, anchor, pad);
      const tag = `shadow=${shadow ? 'on' : 'off'}`;
      ok(
        overlay.width === bake.width &&
          overlay.height === bake.height &&
          approx(overlay.edges[0][0][0], bakeProj.edges[0][0][0], 1e-9) &&
          approx(overlay.edges[0][0][1], bakeProj.edges[0][0][1], 1e-9) &&
          approx(overlay.origin[0], bake.originPx[0], 1e-9) &&
          approx(overlay.origin[1], bake.originPx[1], 1e-9),
        `${tag}: pad-matched overlay projection equals the bake frame`,
      );
      if (shadow) {
        const unpadded = projectBoxFrame(size, ppu, PAD_PX, ISO_AZIMUTH_DEG, anchor, 0);
        ok(
          unpadded.origin[0] !== bake.originPx[0] || unpadded.origin[1] !== bake.originPx[1],
          `${tag}: omitting the pad shifts the overlay (the fixed bug)`,
        );
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
