import { create } from 'zustand';
import {
  BUNDLE_EXT,
  listWorkspaceFiles,
  type WorkspaceFolder,
} from '../../shared/workspace.js';
import { useWorkspace } from './workspace.js';
import { useEditor } from './editor.js';

export const MODEL_EXTS = ['.glb', '.gltf'];
export const HDRI_EXTS = ['.hdr', '.exr'];
export const WORLD_EXTS = ['.json'];
export const SPRITE_EXTS = [BUNDLE_EXT, '.zip'];

export interface ProjectListings {
  sprites: string[];
  models: string[];
  worlds: string[];
  hdris: string[];
}

const EMPTY: ProjectListings = { sprites: [], models: [], worlds: [], hdris: [] };

export interface ProjectStore extends ProjectListings {
  /** Re-read every convention folder; clears listings when disconnected. */
  refresh(): Promise<void>;
  list(folder: WorkspaceFolder): Promise<string[]>;
}

export const useProject = create<ProjectStore>((set) => ({
  ...EMPTY,

  refresh: async () => {
    const kind = useWorkspace.getState().state.kind;
    if (kind !== 'connected') {
      set({ ...EMPTY });
      return;
    }
    try {
      const [sprites, models, worlds, hdris] = await Promise.all([
        listWorkspaceFiles('sprites', SPRITE_EXTS),
        listWorkspaceFiles('models', MODEL_EXTS),
        listWorkspaceFiles('worlds', WORLD_EXTS),
        listWorkspaceFiles('hdri', HDRI_EXTS),
      ]);
      set({ sprites, models, worlds, hdris });
    } catch (err) {
      useEditor.getState().setStatus(`Workspace: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  list: async (folder) => {
    const exts =
      folder === 'sprites' ? SPRITE_EXTS : folder === 'models' ? MODEL_EXTS : folder === 'worlds' ? WORLD_EXTS : HDRI_EXTS;
    return listWorkspaceFiles(folder, exts);
  },
}));

// Re-read listings whenever the workspace connection changes.
useWorkspace.subscribe((state) => {
  if (state.state.kind === 'connected') {
    void useProject.getState().refresh();
  } else {
    useProject.setState({ ...EMPTY });
  }
});
