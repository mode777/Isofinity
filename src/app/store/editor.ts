import { create } from 'zustand';
import type { EditorDocument, EditorKind, Tab } from '../document.js';

/**
 * A determinate long-running operation shown as a progress bar in the
 * status bar (world loading). `max` is the total unit count; `value` the
 * completed count. Null = nothing in progress.
 */
export interface LoadProgress {
  label: string;
  value: number;
  max: number;
}

export interface EditorState {
  docs: Record<string, EditorDocument>;
  tabs: Tab[];
  activeDocId: string | null;
  status: string;
  progress: LoadProgress | null;
  nextId: number;

  setStatus(text: string): void;
  /** Set or clear the status bar's progress bar (null = hide). */
  setProgress(progress: LoadProgress | null): void;
  /** Register a fresh document (caller owns dedupe) and focus its tab. */
  addDoc(doc: EditorDocument): void;
  focusDoc(docId: string): void;
  /** Remove the tab and drop the document; caller disposes engine objects. */
  closeDoc(docId: string): void;
  /** Shallow-copy the document, apply `mutate`, store it back. */
  update<T extends EditorDocument>(docId: string, mutate: (doc: T) => void): void;
  markDirty(docId: string, dirty?: boolean): void;
}

let uid = 0;
export function nextDocId(kind: EditorKind): string {
  uid += 1;
  return `${kind}-${uid}`;
}

export const useEditor = create<EditorState>((set, get) => ({
  docs: {},
  tabs: [],
  activeDocId: null,
  status: 'Ready',
  progress: null,
  nextId: 0,

  setStatus: (text) => set({ status: text }),

  setProgress: (progress) => set({ progress }),

  addDoc: (doc) =>
    set((s) => ({
      docs: { ...s.docs, [doc.docId]: doc },
      tabs: [...s.tabs, { docId: doc.docId, kind: doc.kind }],
      activeDocId: doc.docId,
    })),

  focusDoc: (docId) => set({ activeDocId: docId }),

  closeDoc: (docId) =>
    set((s) => {
      const docs = { ...s.docs };
      delete docs[docId];
      const index = s.tabs.findIndex((t) => t.docId === docId);
      const tabs = s.tabs.filter((t) => t.docId !== docId);
      let active = s.activeDocId;
      if (active === docId) {
        const fallback = tabs[Math.min(Math.max(index, 0), tabs.length - 1)];
        active = fallback ? fallback.docId : null;
      }
      return { docs, tabs, activeDocId: active };
    }),

  update: (docId, mutate) => {
    const doc = get().docs[docId];
    if (!doc) return;
    const copy = { ...doc } as EditorDocument;
    mutate(copy as never);
    set((s) => ({ docs: { ...s.docs, [docId]: copy } }));
  },

  markDirty: (docId, dirty = true) => {
    const doc = get().docs[docId];
    if (!doc || doc.dirty === dirty) return;
    set((s) => ({
      docs: { ...s.docs, [docId]: { ...doc, dirty } },
    }));
  },
}));

/** Find an open document by its resource dedupe key, if any. */
export function findDocByRef(key: string): EditorDocument | null {
  const { docs } = useEditor.getState();
  for (const doc of Object.values(docs)) {
    if (doc.ref?.key === key) return doc;
  }
  return null;
}
