import {
  formatSpan,
  isTracingEnabled,
  span,
  summarize,
  TraceBuffer,
  type LoadSpan,
} from './trace.js';

let passed = 0;
let failed = 0;

declare const process: { exit(code?: number): void };

function ok(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ok - ${label}`);
  } else {
    failed++;
    console.error(`  FAIL - ${label}`);
  }
}

console.log('trace buffer:');

{
  const buffer = new TraceBuffer();
  buffer.add({ tag: 'b', ms: 1 });
  buffer.add({ tag: 'a', ms: 2 });
  buffer.add({ tag: 'b', ms: 3 });
  ok(buffer.all().length === 3, 'add appends every span');
  ok(
    buffer.all().map((s) => s.tag).join(',') === 'b,a,b',
    'all() preserves completion order',
  );
  const rows = buffer.summary();
  ok(rows.length === 2, 'summary groups by tag');
  ok(rows[0].tag === 'a' && rows[1].tag === 'b', 'summary is sorted by tag');
  ok(rows[0].count === 1 && rows[0].totalMs === 2, 'single-span tag aggregates');
  ok(rows[1].count === 2 && rows[1].totalMs === 4, 'repeated tag counts and totals');
  buffer.clear();
  ok(buffer.all().length === 0, 'clear empties the accumulator');
  ok(buffer.summary().length === 0, 'summary after clear is empty');
}

console.log('span formatting:');

{
  const line = formatSpan({ tag: 'sprite.exr', ms: 12.345, meta: { z: 1, a: 'x' } });
  ok(line === '[loadtrace] sprite.exr 12.3ms a=x z=1', 'format sorts meta keys and fixes ms to one decimal');
  const bare = formatSpan({ tag: 'world.open', ms: 5 });
  ok(bare === '[loadtrace] world.open 5.0ms', 'format omits the meta suffix when absent');
}

console.log('summary is pure:');

{
  const spans: readonly LoadSpan[] = [
    { tag: 'sprite.read', ms: 10 },
    { tag: 'sprite.exr', ms: 20 },
    { tag: 'sprite.read', ms: 30 },
  ];
  const a = summarize(spans);
  const b = summarize(spans);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same input yields the same output');
  ok(spans.length === 3, 'input array is not mutated');
}

console.log('opt-in:');

{
  const g = globalThis as {
    __loadTrace?: readonly LoadSpan[];
    __loadTraceSummary?: () => unknown;
    __loadTraceClear?: () => void;
  };
  const enabled = isTracingEnabled();
  ok(enabled === false, 'tracing is disabled by default under Node');
  const finish = span('sprite.read', { asset: 'x' });
  finish();
  ok(Array.isArray(g.__loadTrace), 'the accumulator is exposed globally');
  ok(g.__loadTrace?.length === 0, 'a disabled span records nothing');
  ok(typeof g.__loadTraceSummary === 'function', 'summary helper is exposed');
  ok(typeof g.__loadTraceClear === 'function', 'clear helper is exposed');
}

console.log(`\ntrace-verify: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
