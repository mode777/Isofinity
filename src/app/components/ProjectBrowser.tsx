import { useRef } from 'react';
import { openBundleDoc, openGltfFiles, openModelDoc } from '../store/bake.js';
import { useProject } from '../store/project.js';
import { newWorldDoc, openWorldDoc, selectGroundMaterial } from '../store/world.js';
import { useWorkspace } from '../store/workspace.js';
import { buildDirTree, useExpansion, type DirNode } from './fileTree.js';

export function ProjectBrowser(): React.JSX.Element {
  const sprites = useProject((s) => s.sprites);
  const models = useProject((s) => s.models);
  const worlds = useProject((s) => s.worlds);
  const materials = useProject((s) => s.materials);
  const refresh = useProject((s) => s.refresh);
  const connected = useWorkspace((s) => s.state.kind) === 'connected';
  const gltfInput = useRef<HTMLInputElement>(null);

  return (
    <div className="browser">
      <div className="browser-head">
        <h2>Project</h2>
        <button
          className="refresh"
          title="Re-read the workspace folders"
          disabled={!connected}
          onClick={() => void refresh()}
        >
          refresh
        </button>
      </div>

      <section>
        <h3>Sprites</h3>
        {connected ? (
          <SectionTree paths={sprites} empty="sprites/ is empty" onOpen={(n) => void openBundleDoc(n)} />
        ) : (
          <p className="hint">Connect a workspace to browse sprites/</p>
        )}
      </section>

      <section>
        <h3>Models</h3>
        {connected ? (
          <SectionTree paths={models} empty="models/ is empty" onOpen={(n) => void openModelDoc(n)} />
        ) : (
          <p className="hint">Connect a workspace to browse models/</p>
        )}
        <button onClick={() => gltfInput.current?.click()}>Import glTF file…</button>
        <input
          ref={gltfInput}
          type="file"
          accept=".glb,.gltf"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length > 0) void openGltfFiles(files);
          }}
        />
      </section>

      <section>
        <h3>Worlds</h3>
        <button onClick={() => newWorldDoc()}>New world</button>
        {connected ? (
          <SectionTree paths={worlds} empty="worlds/ is empty" onOpen={(n) => void openWorldDoc(n)} />
        ) : (
          <p className="hint">Connect a workspace to browse worlds/</p>
        )}
      </section>

      <section>
        <h3>Materials</h3>
        {connected ? (
          <SectionTree paths={materials} empty="materials/ is empty" onOpen={(n) => void selectGroundMaterial(n)} />
        ) : (
          <p className="hint">Connect a workspace to browse materials/</p>
        )}
      </section>

      {!connected ? (
        <p className="hint">
          Import a glTF file to start a sprite without a workspace; workspace
          assets need a connected folder.
        </p>
      ) : null}
    </div>
  );
}

/** One convention folder rendered as a collapsible tree of its files. */
function SectionTree(props: {
  paths: string[];
  empty: string;
  onOpen: (path: string) => void;
}): React.JSX.Element {
  const tree = buildDirTree(props.paths);
  const [expanded, toggle] = useExpansion(tree.dirs.map((d) => d.path));
  if (props.paths.length === 0) return <p className="hint">{props.empty}</p>;
  return <DirNodeView node={tree} expanded={expanded} onToggle={toggle} onOpen={props.onOpen} depth={0} />;
}

function DirNodeView(props: {
  node: DirNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  depth: number;
}): React.JSX.Element {
  const { node, depth } = props;
  return (
    <ul className={depth === 0 ? 'dirtree browser-tree' : 'dirtree'}>
      {node.dirs.map((dir) => {
        const isOpen = props.expanded.has(dir.path);
        return (
          <li key={dir.path}>
            <div className="dirtree-dir">
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
                onClick={() => props.onToggle(dir.path)}
              >
                {dir.name}/
              </button>
            </div>
            {isOpen ? <DirNodeView {...props} node={dir} depth={depth + 1} /> : null}
          </li>
        );
      })}
      {node.files.map((file) => {
        const path = node.path ? `${node.path}/${file}` : file;
        return (
          <li key={path}>
            <button title={path} onClick={() => props.onOpen(path)}>
              {file}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
