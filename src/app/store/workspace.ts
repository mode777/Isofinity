import { create } from 'zustand';
import {
  disconnectWorkspace,
  initWorkspace,
  onWorkspaceChange,
  openWorkspace,
  reconnectWorkspace,
  workspaceSupported,
  type WorkspaceState,
} from '../../shared/workspace.js';
import { useEditor } from './editor.js';

export interface WorkspaceStore {
  state: WorkspaceState;
  busy: boolean;
  /**
   * Monotonic connection epoch, bumped on every successful connect. Prefixes
   * the runtime's workspace-scoped file cache keys so reconnecting to a
   * different workspace never serves another workspace's decoded data.
   * In-memory, session-only (ADR 0006).
   */
  epoch: number;
  /** Boot-time restore of a stored handle; never requests permission. */
  init(): Promise<void>;
  open(): Promise<void>;
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
}

const setStatus = (text: string): void => useEditor.getState().setStatus(text);

export const useWorkspace = create<WorkspaceStore>((set) => {
  // Single subscription mirroring the workspace state machine into the
  // store; the underlying module owns the real state. The listener fires
  // immediately (during this initializer), so the epoch is tracked in a
  // closure — an updater `set((s) => …)` would read an uninitialized state.
  let connectionEpoch = 0;
  onWorkspaceChange((state) => {
    if (state.kind === 'connected') connectionEpoch += 1;
    set({ state, epoch: connectionEpoch });
    if (state.kind === 'connected') {
      setStatus(`Workspace connected: ${state.name} — hdri/, models/, sprites/, worlds/ ready`);
    } else if (state.kind === 'disconnected') {
      setStatus('Workspace disconnected');
    }
  });

  const act = async (run: () => Promise<void>): Promise<void> => {
    set({ busy: true });
    try {
      await run();
    } finally {
      set({ busy: false });
    }
  };

  return {
    state: workspaceSupported() ? { kind: 'disconnected' } : { kind: 'unsupported' },
    busy: false,
    epoch: 0,

    init: async () => {
      if (!workspaceSupported()) {
        setStatus(
          'Workspace folders need a Chromium-based browser — file dialogs and downloads keep working',
        );
      }
      await initWorkspace();
    },

    open: () => act(openWorkspace),
    reconnect: () => act(reconnectWorkspace),
    disconnect: () => act(disconnectWorkspace),
  };
});
