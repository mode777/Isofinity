import type { EditorDocument } from '../document.js';
import { SpriteProperties } from './SpriteProperties.js';
import { WorldProperties } from './WorldProperties.js';

export function PropertiesPanel(props: { doc: EditorDocument | null }): React.JSX.Element {
  const { doc } = props;
  if (!doc) {
    return <p className="hint">Properties appear when a tab is active.</p>;
  }
  return doc.kind === 'bake' ? <SpriteProperties doc={doc} /> : <WorldProperties doc={doc} />;
}
