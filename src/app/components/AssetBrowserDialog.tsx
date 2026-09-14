import { useEffect, useMemo, useState } from 'react';
import { parseBakeManifest, readBakeEntry } from '../../bake/bundle.js';
import { readWorkspaceFile } from '../../shared/workspace.js';
import { CHARACTER_BRUSH_ID, type Brush } from '../store/world.js';
import { PRIMITIVE_KINDS } from '../document.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import { buildDirTree, filesAt, useExpansion, type DirNode } from './fileTree.js';
import { IconImage } from './icons.js';

/**
 * Asset browser modal for the world editor's placement brush: a
 * file-browser over the workspace's sprites/ folder (save-dialog chrome)
 * with baked bundle thumbnails, a Built-ins group for the primitives and
 * the character, and a search field over every folder. Picking an entry
 * acquires it as the brush; the dialog stays open on a failed pick so
 * another asset can be tried. Navigation and search state is editor
 * chrome — never serialized (ADR 0006).
 */

// Thumbnail object URLs by workspace-relative bundle path. Session-scoped
// cache shared across dialog openings: re-opening or re-entering a folder
// never re-reads a bundle for a thumbnail it already decoded.
const thumbUrls = new Map<string, string>();
const thumbPending = new Map<string, Promise<string | null>>();

/**
 * Read one bundle's manifest-referenced thumbnail pass as an object URL,
 * or resolve null when the bundle carries no thumbnail (pre-/7,
 * render-less) or cannot be read. Never throws.
 */
async function loadThumbnail(path: string): Promise<string | null> {
  const cached = thumbUrls.get(path);
  if (cached) return cached;
  let pending = thumbPending.get(path);
  if (!pending) {
    pending = (async () => {
      try {
        const file = await readWorkspaceFile('sprites', path);
        const buffer = new Uint8Array(await file.arrayBuffer());
        const { manifest } = parseBakeManifest(buffer);
        const thumbFile = manifest.thumbnail?.file;
        if (!thumbFile) return null;
        const png = readBakeEntry(buffer, thumbFile);
        const url = URL.createObjectURL(
          new Blob([png.slice()], { type: 'image/png' }),
        );
        const prev = thumbUrls.get(path);
        if (prev) URL.revokeObjectURL(prev);
        thumbUrls.set(path, url);
        return url;
      } catch {
        return null;
      } finally {
        thumbPending.delete(path);
      }
    })();
    thumbPending.set(path, pending);
  }
  return pending;
}

/** An asset offered by the browser: a workspace sprite or a built-in. */
interface AssetEntry {
  /** Asset id — also the tool id once picked. */
  id: string;
  /** Display name (file stem; no folder, no extension). */
  name: string;
  /** Folder context ('' = sprites/ root, 'Built-ins' = built-in). */
  context: string;
  brush: Brush;
  /** Workspace-relative bundle path; null for built-ins (never a thumbnail). */
  spritePath: string | null;
}

/** Subscribe one entry's thumbnail URL; null while loading or absent. */
function useThumbnail(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    path ? thumbUrls.get(path) ?? null : null,
  );
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const cached = thumbUrls.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    void loadThumbnail(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

export function AssetBrowserDialog(props: {
  /** Acquire a brush; resolves true when it became placeable. */
  onPick: (brush: Brush) => Promise<boolean>;
  onClose: () => void;
}): React.JSX.Element {
  const sprites = useProject((s) => s.sprites);
  const connected = useWorkspace((s) => s.state.kind) === 'connected';
  const [expanded, toggle] = useExpansion([]);
  const [cur, setCur] = useState('');
  const [query, setQuery] = useState('');

  // The Built-ins pseudo-folder's tree path. A NUL byte cannot occur in a
  // workspace file name, so it can never collide with a real subfolder.
  const BUILTINS_DIR = '\0built-ins';

  // The sprites/ tree plus the synthetic Built-ins folder, pinned to the
  // top of the root so the built-in brushes are as discoverable as the
  // workspace folders.
  const tree = useMemo(() => {
    const t = buildDirTree(sprites, 'sprites');
    t.dirs.unshift({ name: 'Built-ins', path: BUILTINS_DIR, dirs: [], files: [] });
    return t;
  }, [sprites]);
  const filesHere = useMemo(() => filesAt(tree, cur), [tree, cur]);
  const inBuiltins = cur === BUILTINS_DIR;
  const fullPath = `sprites/${cur && !inBuiltins ? `${cur}/` : ''}`;

  const builtIns = useMemo<AssetEntry[]>(
    () => [
      ...PRIMITIVE_KINDS.map(
        (p): AssetEntry => ({
          id: p,
          name: p,
          context: 'Built-ins',
          brush: { kind: 'primitive', id: p },
          spritePath: null,
        }),
      ),
      {
        id: CHARACTER_BRUSH_ID,
        name: CHARACTER_BRUSH_ID,
        context: 'Built-ins',
        brush: { kind: 'character' },
        spritePath: null,
      },
    ],
    [],
  );

  const spriteEntries = useMemo<AssetEntry[]>(
    () =>
      sprites.map((fileName) => {
        const id = fileName.replace(/\.(sprite|zip)$/i, '');
        const segs = id.split('/');
        return {
          id,
          name: segs[segs.length - 1],
          context: segs.slice(0, -1).join('/'),
          brush: { kind: 'sprite', id, fileName },
          spritePath: fileName,
        };
      }),
    [sprites],
  );

  const folderEntries = useMemo<AssetEntry[]>(
    () =>
      filesHere.map((file) => {
        const path = cur ? `${cur}/${file}` : file;
        const id = path.replace(/\.(sprite|zip)$/i, '');
        return {
          id,
          name: file.replace(/\.(sprite|zip)$/i, ''),
          context: cur,
          brush: { kind: 'sprite', id, fileName: path },
          spritePath: path,
        };
      }),
    [filesHere, cur],
  );

  // Search reaches every folder and the built-ins regardless of the open
  // folder; results carry their folder context.
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const results = useMemo(() => {
    if (!searching) return null;
    const match = (e: AssetEntry): boolean =>
      e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      (e.spritePath ?? '').toLowerCase().includes(q);
    return [...spriteEntries, ...builtIns].filter(match);
  }, [searching, q, spriteEntries, builtIns]);

  const pick = async (entry: AssetEntry): Promise<void> => {
    if (await props.onPick(entry.brush)) props.onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onClose();
      }}
    >
      <div className="file-dialog asset-browser" role="dialog" aria-label="Pick a placement brush">
        <div className="file-dialog-head">
          <span>Pick a placement brush</span>
          <input
            className="asset-browser-search"
            type="text"
            placeholder="Search assets…"
            aria-label="Search assets"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                if (query) setQuery('');
                else props.onClose();
              }
            }}
          />
          <button className="file-dialog-close" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="file-dialog-body">
          <div className="file-dialog-folders">
            <FolderTree
              node={tree}
              expanded={expanded}
              onToggle={toggle}
              onEnter={(path) => {
                setCur(path);
                setQuery('');
              }}
              activeDir={cur}
            />
            {connected ? null : (
              <p className="hint">Connect a workspace to browse its sprites/ folder</p>
            )}
          </div>
          <div className="file-dialog-files">
            <div className="file-dialog-crumb" title={searching ? `Search: ${q}` : fullPath}>
              {searching ? `Search: ${query.trim()}` : inBuiltins ? 'Built-ins/' : fullPath}
            </div>
            <div className="asset-browser-files">
              {searching ? (
                results && results.length > 0 ? (
                  <ul className="asset-browser-list">
                    {results.map((entry) => (
                      <AssetEntryRow
                        key={`${entry.spritePath ? 's' : 'b'}:${entry.id}`}
                        entry={entry}
                        showContext
                        onPick={pick}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="hint">No assets match</p>
                )
              ) : inBuiltins ? (
                <ul className="asset-browser-list">
                  {builtIns.map((entry) => (
                    <AssetEntryRow key={entry.id} entry={entry} onPick={pick} />
                  ))}
                </ul>
              ) : folderEntries.length > 0 ? (
                <ul className="asset-browser-list">
                  {folderEntries.map((entry) => (
                    <AssetEntryRow key={entry.id} entry={entry} onPick={pick} />
                  ))}
                </ul>
              ) : (
                <p className="hint">No sprites here</p>
              )}
            </div>
          </div>
        </div>
        <div className="file-dialog-foot">
          <span className="hint">Click an asset to place with the pencil</span>
          <button onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** One asset row: thumbnail (or fallback icon), name, optional folder context. */
function AssetEntryRow(props: {
  entry: AssetEntry;
  showContext?: boolean;
  onPick: (entry: AssetEntry) => void;
}): React.JSX.Element {
  const { entry } = props;
  const url = useThumbnail(entry.spritePath);
  const title = entry.spritePath ? `sprites/${entry.spritePath}` : `${entry.name} (built-in)`;
  return (
    <li>
      <button className="asset-browser-entry" title={title} onClick={() => props.onPick(entry)}>
        <span className={`asset-browser-thumb${url ? '' : ' empty'}`}>
          {url ? <img src={url} alt="" width={32} height={32} /> : <IconImage />}
        </span>
        <span className="asset-browser-entry-text">
          <span className="asset-browser-entry-name">{entry.name}</span>
          {props.showContext && entry.context ? (
            <span className="asset-browser-entry-context">{entry.context}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Folder pane of the browser: the sprites/ tree, files live in the right pane. */
function FolderTree(props: {
  node: DirNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onEnter: (path: string) => void;
  activeDir: string;
}): React.JSX.Element {
  return (
    <div className="dirtree">
      <div className={`dirtree-dir${props.activeDir === '' ? ' active' : ''}`}>
        <span className="dirtree-caret" />
        <button className="dirtree-name" onClick={() => props.onEnter('')}>
          {props.node.name}/
        </button>
      </div>
      <FolderNode {...props} node={props.node} depth={1} />
    </div>
  );
}

function FolderNode(props: {
  node: DirNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onEnter: (path: string) => void;
  activeDir: string;
  depth: number;
}): React.JSX.Element {
  const { node, depth } = props;
  return (
    <ul>
      {node.dirs.map((dir) => {
        const isOpen = props.expanded.has(dir.path);
        return (
          <li key={dir.path}>
            <div className={`dirtree-dir${props.activeDir === dir.path ? ' active' : ''}`}>
              <button
                className="dirtree-caret"
                aria-label={isOpen ? `Collapse ${dir.name}` : `Expand ${dir.name}`}
                onClick={() => props.onToggle(dir.path)}
              >
                {isOpen ? '▾' : '▸'}
              </button>
              <button
                className="dirtree-name"
                title={dir.path}
                onClick={() => {
                  if (!isOpen) props.onToggle(dir.path);
                  props.onEnter(dir.path);
                }}
              >
                {dir.name}/
              </button>
            </div>
            {isOpen ? <FolderNode {...props} node={dir} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
