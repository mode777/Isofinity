import { useRef } from 'react';
import { openBundleDoc, openGltfFiles, openModelDoc } from '../store/bake.js';
import { useProject } from '../store/project.js';
import { newWorldDoc, openWorldDoc } from '../store/world.js';
import { useWorkspace } from '../store/workspace.js';

export function ProjectBrowser(): React.JSX.Element {
  const sprites = useProject((s) => s.sprites);
  const models = useProject((s) => s.models);
  const worlds = useProject((s) => s.worlds);
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
          <FileList names={sprites} empty="sprites/ is empty" onOpen={(n) => void openBundleDoc(n)} />
        ) : (
          <p className="hint">Connect a workspace to browse sprites/</p>
        )}
      </section>

      <section>
        <h3>Models</h3>
        {connected ? (
          <FileList names={models} empty="models/ is empty" onOpen={(n) => void openModelDoc(n)} />
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
          <FileList names={worlds} empty="worlds/ is empty" onOpen={(n) => void openWorldDoc(n)} />
        ) : (
          <p className="hint">Connect a workspace to browse worlds/</p>
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

function FileList(props: {
  names: string[];
  empty: string;
  onOpen: (name: string) => void;
}): React.JSX.Element {
  if (props.names.length === 0) return <p className="hint">{props.empty}</p>;
  return (
    <ul>
      {props.names.map((name) => (
        <li key={name}>
          <button title={name} onClick={() => props.onOpen(name)}>
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}
