import { create } from 'zustand';
import {
  BUNDLE_EXT,
  listWorkspaceTree,
  type WorkspaceFolder,
} from '../../shared/workspace.js';
import { useWorkspace } from './workspace.js';
import { useEditor } from './editor.js';

export const MODEL_EXTS = ['.glb', '.gltf'];
export const HDRI_EXTS = ['.hdr', '.exr'];
export const WORLD_EXTS = ['.json'];
export const SPRITE_EXTS = [BUNDLE_EXT, '.zip'];
export const PRESET_EXTS = ['.json'];
export const MATERIAL_EXTS = ['.material', '.zip'];

export interface ProjectListings {
  sprites: string[];
  models: string[];
  worlds: string[];
  hdris: string[];
  presets: string[];
  materials: string[];
}

const EMPTY: ProjectListings = {
  sprites: [],
  models: [],
  worlds: [],
  hdris: [],
  presets: [],
  materials: [],
};

export interface ProjectStore extends ProjectListings {
  /** Re-read every convention folder; clears listings when disconnected. */
  refresh(): Promise<void>;
  list(folder: WorkspaceFolder): Promise<string[]>;
}

/** Accepted extensions per convention folder, in WORKSPACE_FOLDERS order. */
export function folderExts(folder: WorkspaceFolder): string[] {
  switch (folder) {
    case 'sprites':
      return SPRITE_EXTS;
    case 'models':
      return MODEL_EXTS;
    case 'worlds':
      return WORLD_EXTS;
    case 'presets':
      return PRESET_EXTS;
    case 'materials':
      return MATERIAL_EXTS;
    default:
      return HDRI_EXTS;
  }
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
      const [sprites, models, worlds, hdris, presets, materials] = await Promise.all([
        listWorkspaceTree('sprites', SPRITE_EXTS),
        listWorkspaceTree('models', MODEL_EXTS),
        listWorkspaceTree('worlds', WORLD_EXTS),
        listWorkspaceTree('hdri', HDRI_EXTS),
        listWorkspaceTree('presets', PRESET_EXTS),
        listWorkspaceTree('materials', MATERIAL_EXTS),
      ]);
      set({ sprites, models, worlds, hdris, presets, materials });
    } catch (err) {
      useEditor.getState().setStatus(`Workspace: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  list: async (folder) => listWorkspaceTree(folder, folderExts(folder)),
}));

// Re-read listings whenever the workspace connection changes.
useWorkspace.subscribe((state) => {
  if (state.state.kind === 'connected') {
    void useProject.getState().refresh();
  } else {
    useProject.setState({ ...EMPTY });
  }
});
