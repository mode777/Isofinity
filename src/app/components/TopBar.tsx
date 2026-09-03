import { useWorkspace } from '../store/workspace.js';

export function TopBar(props: { version: string }): React.JSX.Element {
  const ws = useWorkspace((s) => s.state);
  const busy = useWorkspace((s) => s.busy);
  const open = useWorkspace((s) => s.open);
  const reconnect = useWorkspace((s) => s.reconnect);
  const disconnect = useWorkspace((s) => s.disconnect);

  let button: React.JSX.Element;
  let label = '';
  switch (ws.kind) {
    case 'unsupported':
      button = (
        <button
          disabled
          title="This browser has no directory-picker API (needs a Chromium-based browser)"
        >
          Workspace unavailable
        </button>
      );
      label = 'needs a Chromium-based browser';
      break;
    case 'disconnected':
      button = (
        <button
          disabled={busy}
          title="Open a local folder to load and save assets in place"
          onClick={() => void open()}
        >
          Open workspace…
        </button>
      );
      break;
    case 'reconnectable':
      button = (
        <button
          disabled={busy}
          title={`Reconnect to the workspace folder "${ws.name}" from a previous visit`}
          onClick={() => void reconnect()}
        >
          Reconnect workspace…
        </button>
      );
      break;
    case 'connected':
      button = (
        <button disabled={busy} title="Disconnect the workspace folder" onClick={() => void disconnect()}>
          Disconnect
        </button>
      );
      label = `workspace: ${ws.name}`;
      break;
  }

  return (
    <>
      <span className="app-title">Isofinity</span>
      <span className="version">{props.version}</span>
      {button}
      <span className="ws-label">{label}</span>
    </>
  );
}
