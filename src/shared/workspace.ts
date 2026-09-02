/**
 * Shared workspace folder: one browser-picked local directory bound into
 * both tools (bake + runtime) via the File System Access API, with a fixed
 * convention of asset subfolders and local persistence of the chosen
 * handle so a page reload only needs a permission click to reconnect.
 *
 * State machine: unsupported -> (nothing) | disconnected -> connected,
 * plus `reconnectable` when a stored handle exists but is not connected.
 * Permission is only ever requested inside an explicit user gesture
 * (open/reconnect click); a page load never silently reconnects.
 */

export const BUNDLE_EXT = '.sprite';

export const WORKSPACE_FOLDERS = ['hdri', 'models', 'sprites', 'worlds'] as const;
export type WorkspaceFolder = (typeof WORKSPACE_FOLDERS)[number];

export type WorkspaceState =
  | { kind: 'unsupported' }
  | { kind: 'disconnected' }
  | { kind: 'reconnectable'; name: string }
  | { kind: 'connected'; name: string };

export function workspaceSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// --- IndexedDB handle persistence (db `isoinfinity-workspace`) ---

const DB_NAME = 'isoinfinity-workspace';
const STORE = 'handles';
const KEY = 'workspace';

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(STORE);
    };
    open.onerror = () =>
      reject(open.error ?? new Error('workspace: IndexedDB open failed'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('workspace: IndexedDB request failed'));
      };
    };
  });
}

const loadStoredHandle = (): Promise<FileSystemDirectoryHandle | undefined> =>
  withStore('readonly', (store) => store.get(KEY));

const storeHandle = (handle: FileSystemDirectoryHandle): Promise<IDBValidKey> =>
  withStore('readwrite', (store) => store.put(handle, KEY));

const clearStoredHandle = (): Promise<undefined> =>
  withStore('readwrite', (store) => store.delete(KEY));

// --- connection state ---

let dir: FileSystemDirectoryHandle | null = null;
let stored: FileSystemDirectoryHandle | null = null;
let state: WorkspaceState = workspaceSupported()
  ? { kind: 'disconnected' }
  : { kind: 'unsupported' };
const listeners = new Set<(s: WorkspaceState) => void>();

export function getWorkspaceState(): WorkspaceState {
  return state;
}

/** Subscribe to workspace state changes; fires immediately. */
export function onWorkspaceChange(fn: (s: WorkspaceState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

async function setState(next: WorkspaceState): Promise<void> {
  state = next;
  for (const fn of [...listeners]) fn(state);
}

/** Restore a stored handle at page boot: reconnectable, never connected. */
export async function initWorkspace(): Promise<void> {
  if (!workspaceSupported() || state.kind !== 'disconnected') return;
  try {
    stored = (await loadStoredHandle()) ?? null;
  } catch {
    stored = null; // storage unavailable: worst case is re-picking the folder
  }
  if (stored) await setState({ kind: 'reconnectable', name: stored.name });
}

function assertConnected(): FileSystemDirectoryHandle {
  if (state.kind !== 'connected' || !dir) {
    throw new Error('workspace: not connected — open a workspace first');
  }
  return dir;
}

async function ensureFolders(root: FileSystemDirectoryHandle): Promise<void> {
  for (const name of WORKSPACE_FOLDERS) {
    try {
      await root.getDirectoryHandle(name, { create: true });
    } catch (err) {
      throw new Error(
        `workspace "${root.name}": cannot create ${name}/ — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Create any missing convention folders (idempotent). */
export async function ensureConventionFolders(): Promise<void> {
  await ensureFolders(assertConnected());
}

async function connect(handle: FileSystemDirectoryHandle): Promise<void> {
  dir = handle;
  stored = handle;
  // Run against the handle directly: the connected state is only set once
  // the convention folders exist.
  await ensureFolders(handle);
  await setState({ kind: 'connected', name: handle.name });
}

/**
 * Open a folder via the directory picker. Canceling the picker leaves the
 * state unchanged; the picked handle is persisted for future reconnects.
 */
export async function openWorkspace(): Promise<void> {
  if (!workspaceSupported()) throw new Error('workspace: unsupported browser');
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    throw new Error(`workspace: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    await storeHandle(handle);
  } catch {
    // Persisting is best-effort; the session still works fully.
  }
  await connect(handle);
}

/** Reconnect to the stored folder, requesting permission in-gesture. */
export async function reconnectWorkspace(): Promise<void> {
  if (!stored) throw new Error('workspace: nothing stored to reconnect to');
  const name = stored.name;
  try {
    let perm = await stored.queryPermission({ mode: 'readwrite' });
    if (perm === 'prompt') perm = await stored.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      throw new Error(`workspace "${name}": permission denied`);
    }
    await connect(stored);
  } catch (err) {
    // The stored handle stays available for another attempt.
    if (err instanceof Error && err.message.startsWith('workspace')) throw err;
    throw new Error(
      `workspace "${name}" is no longer available — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Forget the connection and the stored handle. */
export async function disconnectWorkspace(): Promise<void> {
  dir = null;
  stored = null;
  try {
    await clearStoredHandle();
  } catch {
    // Storage failure must not block the state change.
  }
  await setState({ kind: 'disconnected' });
}

// --- per-folder helpers (require a connected workspace) ---

function matchesExts(name: string, exts: string[]): boolean {
  const lower = name.toLowerCase();
  return exts.some((ext) => lower.endsWith(ext.toLowerCase()));
}

/** Flat listing of the folder's files whose name ends in one of `exts`, name-sorted. */
export async function listWorkspaceFiles(
  folder: WorkspaceFolder,
  exts: string[],
): Promise<string[]> {
  const root = assertConnected();
  const sub = await root.getDirectoryHandle(folder);
  const names: string[] = [];
  for await (const [name, handle] of sub.entries()) {
    if (handle.kind === 'file' && matchesExts(name, exts)) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** Read one file from the folder as a File (content loads lazily). */
export async function readWorkspaceFile(
  folder: WorkspaceFolder,
  name: string,
): Promise<File> {
  const root = assertConnected();
  try {
    const handle = await root.getFileHandle(name, { create: false });
    return await handle.getFile();
  } catch (err) {
    throw new Error(
      `workspace ${folder}/: cannot read "${name}" — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Read every file in the folder (extension-filtered), name-sorted. */
export async function readAllWorkspaceFiles(
  folder: WorkspaceFolder,
  exts: string[],
): Promise<File[]> {
  const names = await listWorkspaceFiles(folder, exts);
  return Promise.all(names.map((name) => readWorkspaceFile(folder, name)));
}

/** Write (overwriting) one file into the folder. */
export async function writeWorkspaceFile(
  folder: WorkspaceFolder,
  name: string,
  data: Uint8Array<ArrayBuffer> | string,
): Promise<void> {
  const root = assertConnected();
  try {
    const handle = await root.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
      await stream.write(data);
    } finally {
      await stream.close();
    }
  } catch (err) {
    throw new Error(
      `workspace ${folder}/: cannot write "${name}" — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
