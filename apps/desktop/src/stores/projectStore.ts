import { create } from 'zustand';
import type { ProjectManifest, MediaAsset, ProcessingJob } from '@dubstudio/shared-types';
import { api } from '@/services/api';

interface ProjectState {
  currentProject: ProjectManifest | null;
  recentProjects: ProjectManifest[];
  mediaAssets: MediaAsset[];
  activeJob: ProcessingJob | null;
  isLoading: boolean;
  error: string | null;

  loadRecentProjects: () => Promise<void>;
  createProject: (name: string, sourceLang?: string, targetLang?: string, syncMode?: any) => Promise<ProjectManifest>;
  openProject: (projectId: string) => Promise<void>;
  updateProject: (data: Partial<ProjectManifest>) => Promise<void>;
  importMediaFile: (filePath: string) => Promise<MediaAsset>;
  setActiveJob: (job: ProcessingJob | null) => void;
  setError: (err: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  recentProjects: [],
  mediaAssets: [],
  activeJob: null,
  isLoading: false,
  error: null,

  loadRecentProjects: async () => {
    try {
      const list = await api.listRecentProjects();
      set({ recentProjects: list });
    } catch (e: any) {
      console.error('Failed to load recent projects:', e);
    }
  },

  createProject: async (name, sourceLang = 'auto', targetLang = 'km', syncMode = 'balanced') => {
    set({ isLoading: true, error: null });
    try {
      const project = await api.createProject(name, sourceLang, targetLang, syncMode);
      set({ currentProject: project, mediaAssets: [], isLoading: false });
      get().loadRecentProjects();
      return project;
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
      throw e;
    }
  },

  openProject: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const project = await api.getProject(projectId);
      const media = await api.getProjectMedia(projectId);
      set({ currentProject: project, mediaAssets: media, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
      throw e;
    }
  },

  updateProject: async (data: Partial<ProjectManifest>) => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      const updated = await api.updateProject(currentProject.id, data);
      set({ currentProject: updated });
    } catch (e: any) {
      console.error('Failed to update project:', e);
    }
  },

  importMediaFile: async (filePath: string) => {
    const { currentProject } = get();
    if (!currentProject) throw new Error('No project currently open');
    set({ isLoading: true });
    try {
      const asset = await api.importMedia(currentProject.id, filePath);
      const updatedList = await api.getProjectMedia(currentProject.id);
      set({ mediaAssets: updatedList, isLoading: false });
      return asset;
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
      throw e;
    }
  },

  setActiveJob: (job) => set({ activeJob: job }),
  setError: (err) => set({ error: err }),
}));
