import {
  disconnectWorkspace,
  getWorkspaceState,
  onWorkspaceChange,
  openWorkspace,
  reconnectWorkspace,
  workspaceSupported,
  type WorkspaceState,
} from './workspace.js';

export interface WorkspaceUiHooks {
  /** Status-area sink shared with the rest of the page. */
  onStatus(text: string): void;
  /** Extra reaction to state changes (enabling pickers, save buttons…). */
  onState?(state: WorkspaceState): void;
}

/** Repopulate a picker `<select>`: placeholder first, then the listing,
 * keeping the previous selection when it still exists. */
export function fillSelect(
  select: HTMLSelectElement,
  names: string[],
  placeholder: string,
): void {
  const current = select.value;
  select.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
  if (current && names.includes(current)) select.value = current;
}

/**
 * Workspace header control shared by both tools: "Open workspace…" /
 * "Reconnect workspace…" when a stored handle exists / folder name +
 * "Disconnect" while connected; disabled with the reason when the browser
 * lacks the directory-picker API. Mount into a `.controls` container.
 */
export function mountWorkspaceControl(host: HTMLElement, hooks: WorkspaceUiHooks): void {
  const button = document.createElement('button');
  button.id = 'workspace-toggle';
  const label = document.createElement('span');
  label.style.cssText =
    'align-self:center;color:#8a8f98;font-size:0.85rem;white-space:nowrap;';
  host.append(button, label);

  let busy = false;

  async function act(run: () => Promise<void>, busyText: string): Promise<void> {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await run();
    } catch (err) {
      hooks.onStatus(`Workspace: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      busy = false;
      render(getWorkspaceState());
    }
  }

  button.addEventListener('click', () => {
    const kind = getWorkspaceState().kind;
    if (kind === 'connected') {
      void act(disconnectWorkspace, 'Disconnecting…');
    } else if (kind === 'reconnectable') {
      void act(reconnectWorkspace, 'Reconnecting…');
    } else if (kind === 'disconnected') {
      void act(openWorkspace, 'Opening…');
    }
  });

  function render(s: WorkspaceState): void {
    switch (s.kind) {
      case 'unsupported':
        button.disabled = true;
        button.title = 'This browser has no directory-picker API (needs a Chromium-based browser)';
        button.textContent = 'Workspace unavailable';
        label.textContent = 'needs a Chromium-based browser';
        break;
      case 'disconnected':
        button.disabled = busy;
        button.title = 'Open a local folder to load and save assets in place';
        button.textContent = 'Open workspace…';
        label.textContent = '';
        break;
      case 'reconnectable':
        button.disabled = busy;
        button.title = `Reconnect to the workspace folder "${s.name}" from a previous visit`;
        button.textContent = 'Reconnect workspace…';
        label.textContent = '';
        break;
      case 'connected':
        button.disabled = busy;
        button.title = 'Disconnect the workspace folder';
        button.textContent = 'Disconnect';
        label.textContent = `workspace: ${s.name}`;
        break;
    }
  }

  if (!workspaceSupported()) {
    hooks.onStatus(
      'Workspace folders need a Chromium-based browser — file dialogs and downloads keep working',
    );
  }

  onWorkspaceChange((s) => {
    render(s);
    hooks.onState?.(s);
    if (s.kind === 'connected') {
      hooks.onStatus(`Workspace connected: ${s.name} — hdri/, models/, sprites/, worlds/ ready`);
    } else if (s.kind === 'disconnected') {
      hooks.onStatus('Workspace disconnected');
    }
  });
}
