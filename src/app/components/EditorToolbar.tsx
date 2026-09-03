import type { ReactNode } from 'react';

/** Per-editor toolbar row at the top of an editor's main content. */
export function EditorToolbar(props: { children: ReactNode }): React.JSX.Element {
  return <div className="editor-toolbar">{props.children}</div>;
}
