import { useEffect } from 'react';
import { APP_VERSION } from '../version.js';
import { useEditor } from './store/editor.js';
import { useProject } from './store/project.js';
import { useWorkspace } from './store/workspace.js';
import { ProjectBrowser } from './components/ProjectBrowser.js';
import { PropertiesPanel } from './components/PropertiesPanel.js';
import { SpriteEditor } from './components/SpriteEditor.js';
import { StatusBar } from './components/StatusBar.js';
import { TabBar } from './components/TabBar.js';
import { TopBar } from './components/TopBar.js';
import { WorldEditor } from './components/WorldEditor.js';

export function App(): React.JSX.Element {
  const activeDocId = useEditor((s) => s.activeDocId);
  const doc = useEditor((s) => (s.activeDocId ? s.docs[s.activeDocId] : null));

  // Reflect workspace connection changes into the project listings.
  const wsKind = useWorkspace((s) => s.state.kind);
  useEffect(() => {
    void useProject.getState().refresh();
  }, [wsKind]);

  // A fresh session has nothing to show until a document opens.
  useEffect(() => {
    if (!activeDocId) {
      useEditor.getState().setStatus('Open a sprite or world from the project browser');
    }
  }, [activeDocId]);

  return (
    <div className="app">
      <header className="topbar">
        <TopBar version={APP_VERSION} />
      </header>
      <div className="tabbar">
        <TabBar />
      </div>
      <aside className="left">
        <ProjectBrowser />
      </aside>
      <main className="center">
        {doc?.kind === 'bake' ? <SpriteEditor key={doc.docId} doc={doc} /> : null}
        {doc?.kind === 'world' ? <WorldEditor key={doc.docId} doc={doc} /> : null}
        {!doc ? (
          <div className="empty-hint">
            <p>Nothing open.</p>
            <p>
              Open a built-in primitive, a model, a sprite bundle, or a world
              from the project browser — or create a new world.
            </p>
          </div>
        ) : null}
      </main>
      <aside className="right">
        <PropertiesPanel doc={doc} />
      </aside>
      <footer className="statusbar">
        <StatusBar />
      </footer>
    </div>
  );
}
