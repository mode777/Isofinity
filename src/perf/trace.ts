export interface LoadSpan {
  tag: string;
  ms: number;
  meta?: Record<string, string | number | boolean>;
}

export type SpanMeta = Record<string, string | number | boolean>;

export interface TraceSummaryRow {
  tag: string;
  count: number;
  totalMs: number;
}

export function summarize(spans: readonly LoadSpan[]): TraceSummaryRow[] {
  const rows = new Map<string, TraceSummaryRow>();
  for (const span of spans) {
    const row = rows.get(span.tag) ?? { tag: span.tag, count: 0, totalMs: 0 };
    row.count += 1;
    row.totalMs += span.ms;
    rows.set(span.tag, row);
  }
  return [...rows.values()].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

export function formatSpan(span: LoadSpan): string {
  const entries = span.meta ? Object.entries(span.meta) : [];
  const meta = entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  const suffix = meta.length > 0 ? ` ${meta}` : '';
  return `[loadtrace] ${span.tag} ${span.ms.toFixed(1)}ms${suffix}`;
}

export class TraceBuffer {
  private spans: LoadSpan[] = [];

  add(span: LoadSpan): void {
    this.spans.push(span);
  }

  all(): readonly LoadSpan[] {
    return this.spans;
  }

  clear(): void {
    this.spans.length = 0;
  }

  summary(): TraceSummaryRow[] {
    return summarize(this.spans);
  }
}

export const TAGS = {
  spriteRead: 'sprite.read',
  spriteManifest: 'sprite.manifest',
  spriteInflate: 'sprite.inflate',
  spriteExr: 'sprite.exr',
  spriteDepth: 'sprite.depth',
  spritePng: 'sprite.png',
  spriteBitmap: 'sprite.bitmap',
  spriteNorth: 'sprite.north',
  spriteView: 'sprite.view',
  spritePadding: 'sprite.padding',
  spriteUpload: 'sprite.upload',
  worldOpen: 'world.open',
  worldAsset: 'world.asset',
  worldDirection: 'world.direction',
  rendererBuild: 'renderer.build',
  materialParse: 'material.parse',
  materialInflate: 'material.inflate',
  materialExr: 'material.exr',
  materialImage: 'material.image',
  materialSrgb: 'material.srgb',
  materialResample: 'material.resample',
  materialDefaults: 'material.defaults',
  materialUpload: 'material.upload',
  materialMipmap: 'material.mipmap',
  paintDecode: 'paint.decode',
} as const;

const buffer = new TraceBuffer();

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function devBuild(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

export function isTracingEnabled(): boolean {
  const g = globalThis as { __loadTraceOn?: unknown };
  if (g.__loadTraceOn === true) return true;
  if (typeof location !== 'undefined' && typeof location.search === 'string') {
    if (location.search.includes('loadtrace')) return true;
  }
  return devBuild();
}

export function span(tag: string, meta?: SpanMeta): (extraMeta?: SpanMeta) => void {
  if (!isTracingEnabled()) return () => {};
  const start = now();
  return (extraMeta?: SpanMeta) => {
    let merged: SpanMeta | undefined;
    if (meta && extraMeta) merged = { ...meta, ...extraMeta };
    else merged = extraMeta ?? meta;
    const record: LoadSpan = { tag, ms: now() - start, meta: merged };
    buffer.add(record);
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log(formatSpan(record));
    }
  };
}

let globalsInstalled = false;

export function installTraceGlobals(): void {
  if (globalsInstalled) return;
  globalsInstalled = true;
  const g = globalThis as {
    __loadTrace?: readonly LoadSpan[];
    __loadTraceSummary?: () => TraceSummaryRow[];
    __loadTraceClear?: () => void;
  };
  g.__loadTrace = buffer.all();
  g.__loadTraceSummary = () => {
    const rows = buffer.summary();
    if (typeof console !== 'undefined') {
      if (typeof console.table === 'function') console.table(rows);
      else console.log(rows);
    }
    return rows;
  };
  g.__loadTraceClear = () => {
    buffer.clear();
  };
}

installTraceGlobals();
