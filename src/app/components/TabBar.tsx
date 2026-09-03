import { useEditor } from '../store/editor.js';
import { disposeDocument } from '../store/dispose.js';

export function TabBar(): React.JSX.Element {
  const tabs = useEditor((s) => s.tabs);
  const docs = useEditor((s) => s.docs);
  const activeDocId = useEditor((s) => s.activeDocId);
  const focusDoc = useEditor((s) => s.focusDoc);
  const closeDoc = useEditor((s) => s.closeDoc);

  const close = (docId: string): void => {
    const doc = docs[docId];
    if (doc?.dirty && !window.confirm(`"${doc.title}" has unsaved changes — close anyway?`)) {
      return;
    }
    disposeDocument(docId);
    closeDoc(docId);
  };

  return (
    <>
      {tabs.map((tab) => {
        const doc = docs[tab.docId];
        if (!doc) return null;
        return (
          <div
            key={tab.docId}
            className={`tab${tab.docId === activeDocId ? ' active' : ''}`}
            onClick={() => focusDoc(tab.docId)}
          >
            <span className="tab-kind">{tab.kind === 'bake' ? 'sprite' : 'world'}</span>
            <span className="tab-title">
              {doc.title}
              {doc.dirty ? ' *' : ''}
            </span>
            <button
              className="tab-close"
              title={`Close ${doc.title}`}
              onClick={(e) => {
                e.stopPropagation();
                close(tab.docId);
              }}
            >
              x
            </button>
          </div>
        );
      })}
    </>
  );
}
