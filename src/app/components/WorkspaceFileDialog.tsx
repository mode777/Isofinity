import { useMemo, useState } from 'react';
import type { WorkspaceFolder } from '../../shared/workspace.js';
import { useProject } from '../store/project.js';
import { buildDirTree, filesAt, useExpansion, type DirNode } from './fileTree.js';

/**
 * Custom save/load dialog over the connected workspace, modeled on native
 * file dialogs: folder tree on the left, filtered file list on the right,
 * a breadcrumb for the current path, and a name field in save mode.
 * Navigation state is editor chrome — never serialized (ADR 0006).
 */

// Last-used folder per convention folder, per session, in memory only.
const lastDir = new Map<WorkspaceFolder, string>();

export function WorkspaceFileDialog(props: {
  mode: 'save' | 'load';
  folder: WorkspaceFolder;
  title: string;
  defaultName?: string;
  onAccept: (path: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { folder, mode } = props;
  const paths = useProject((s) => s[listingKey(folder)]);
  const [expanded, toggle] = useExpansion([]);
  const [cur, setCur] = useState(() => lastDir.get(folder) ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(props.defaultName ?? '');

  const tree = useMemo(() => buildDirTree(paths, folder), [folder, paths]);
  const filesHere = useMemo(() => filesAt(tree, cur), [tree, cur]);
  const fullPath = `${folder}/${cur ? `${cur}/` : ''}`;

  const enter = (path: string): void => {
    setCur(path);
    setSelected(null);
  };

  const accept = (): void => {
    if (mode === 'save') {
      const trimmed = name.trim();
      if (!trimmed) return;
      lastDir.set(folder, cur);
      props.onAccept(cur ? `${cur}/${trimmed}` : trimmed);
    } else if (selected) {
      lastDir.set(folder, cur);
      props.onAccept(selected);
    }
  };

  const acceptLabel = mode === 'save' ? 'Save' : 'Open';
  const acceptEnabled = mode === 'save' ? name.trim().length > 0 : selected !== null;

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
      <div className="file-dialog" role="dialog" aria-label={props.title}>
        <div className="file-dialog-head">
          <span>{props.title}</span>
          <button className="file-dialog-close" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="file-dialog-body">
          <div className="file-dialog-folders">
            <DirTree tree={tree} expanded={expanded} onToggle={toggle} onEnter={enter} activeDir={cur} />
          </div>
          <div className="file-dialog-files">
            <div className="file-dialog-crumb" title={fullPath}>
              {fullPath || `${folder}/`}
            </div>
            {filesHere.length === 0 ? (
              <p className="hint">No matching files here</p>
            ) : (
              <ul>
                {filesHere.map((file) => {
                  const path = cur ? `${cur}/${file}` : file;
                  return (
                    <li key={path}>
                      <button
                        className={selected === path ? 'active' : undefined}
                        title={path}
                        onClick={() => setSelected(path)}
                        onDoubleClick={() => {
                          if (mode === 'load') {
                            lastDir.set(folder, cur);
                            props.onAccept(path);
                          } else setSelected(path);
                        }}
                      >
                        {file}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <div className="file-dialog-foot">
          {mode === 'save' ? (
            <label>
              Name
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && acceptEnabled) accept();
                }}
              />
            </label>
          ) : (
            <span className="hint">{selected ?? 'Select a file'}</span>
          )}
          <button onClick={props.onClose}>Cancel</button>
          <button className="primary" disabled={!acceptEnabled} onClick={accept}>
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type ListingKey = 'sprites' | 'models' | 'worlds' | 'hdris' | 'presets' | 'materials';

function listingKey(folder: WorkspaceFolder): ListingKey {
  return folder === 'hdri' ? 'hdris' : folder;
}

function DirTree(props: {
  tree: DirNode;
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
          {props.tree.name}/
        </button>
      </div>
      <FolderNode {...props} node={props.tree} depth={1} />
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
    <ul className={depth === 0 ? 'dirtree' : undefined}>
      {node.dirs.map((dir) => {
        const isOpen = props.expanded.has(dir.path);
        return (
          <li key={dir.path}>
            <div className={`dirtree-dir${props.activeDir === dir.path ? ' active' : ''}`}>
              {dir.dirs.length > 0 ? (
                <button
                  className="dirtree-caret"
                  aria-label={isOpen ? `Collapse ${dir.name}` : `Expand ${dir.name}`}
                  onClick={() => props.onToggle(dir.path)}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
              ) : (
                <span className="dirtree-caret" />
              )}
              <button
                className="dirtree-name"
                title={dir.path}
                onClick={() => {
                  if (!isOpen && dir.dirs.length > 0) props.onToggle(dir.path);
                  props.onEnter(dir.path);
                }}
              >
                {dir.name}/
              </button>
            </div>
            {isOpen ? (
              <FolderNode {...props} node={dir} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
