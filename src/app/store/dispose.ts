import type { GltfSource } from '../../bake/gltf.js';
import { disposeBakerForDoc } from '../store/bake.js';
import { useEditor } from '../store/editor.js';

/**
 * Release the engine objects a document owns. Called when its tab closes;
 * the document itself is dropped right after.
 */
export function disposeDocument(docId: string): void {
  const doc = useEditor.getState().docs[docId];
  if (!doc) return;
  if (doc.kind === 'bake' && doc.gltf) {
    const gltf: GltfSource = doc.gltf;
    gltf.dispose();
  }
  disposeBakerForDoc(docId);
}
