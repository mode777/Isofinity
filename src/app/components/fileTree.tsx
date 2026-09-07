import { useState } from 'react';

/** A directory node derived from a list of slash-relative file paths. */
export interface DirNode {
  /** Last path segment ('' for the root). */
  name: string;
  /** Full path relative to the section root ('' for the root). */
  path: string;
  dirs: DirNode[];
  /** File names directly inside this directory. */
  files: string[];
}

/** Build a directory tree from slash-relative paths (folders-first sorted). */
export function buildDirTree(paths: string[], rootName = ''): DirNode {
  const root: DirNode = { name: rootName, path: '', dirs: [], files: [] };
  const dirFor = (node: DirNode, segs: string[]): DirNode => {
    if (segs.length === 0) return node;
    const [head, ...rest] = segs;
    let child = node.dirs.find((d) => d.name === head);
    if (!child) {
      child = {
        name: head,
        path: node.path ? `${node.path}/${head}` : head,
        dirs: [],
        files: [],
      };
      node.dirs.push(child);
    }
    return dirFor(child, rest);
  };
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const segs = path.split('/');
    const file = segs.pop();
    if (file) dirFor(root, segs).files.push(file);
  }
  return root;
}

/** Files directly inside a directory of the tree. */
export function filesAt(root: DirNode, dirPath: string): string[] {
  if (dirPath === '') return root.files;
  const node = nodeAt(root, dirPath);
  return node ? node.files : [];
}

/** All directory paths (for the folder tree / navigation). */
export function dirPaths(node: DirNode, out: string[] = []): string[] {
  for (const dir of node.dirs) {
    out.push(dir.path);
    dirPaths(dir, out);
  }
  return out;
}

function nodeAt(root: DirNode, path: string): DirNode | null {
  let cur: DirNode | undefined = root;
  for (const seg of path.split('/')) {
    cur = cur.dirs.find((d) => d.name === seg);
    if (!cur) return null;
  }
  return cur ?? null;
}

/**
 * Collapsible tree of a directory node; `expanded` holds fully expanded dir
 * paths, `onToggle`/`onEnter` are optional interactions. `renderFile` draws
 * each leaf button.
 */
export function DirTree(props: {
  node: DirNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onEnter?: (path: string) => void;
  activeDir?: string;
  renderFile: (name: string, path: string) => React.ReactNode;
  depth?: number;
}): React.JSX.Element {
  const { node, depth = 0 } = props;
  return (
    <ul className={depth === 0 ? 'dirtree' : undefined}>
      {node.dirs.map((dir) => {
        const isOpen = props.expanded.has(dir.path);
        const active = props.activeDir === dir.path;
        return (
          <li key={dir.path}>
            <div className={`dirtree-dir${active ? ' active' : ''}`}>
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
                  props.onEnter?.(dir.path);
                }}
              >
                {dir.name}/
              </button>
            </div>
            {isOpen ? (
              <DirTree
                {...props}
                node={dir}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
      {node.files.map((file) => (
        <li key={file}>{props.renderFile(file, node.path ? `${node.path}/${file}` : file)}</li>
      ))}
    </ul>
  );
}

/** Expansion-set state helper: toggle one directory path; setter exposed too. */
export function useExpansion(
  initial: string[] = [],
): [Set<string>, (path: string) => void, React.Dispatch<React.SetStateAction<Set<string>>>] {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial));
  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  return [expanded, toggle, setExpanded];
}
