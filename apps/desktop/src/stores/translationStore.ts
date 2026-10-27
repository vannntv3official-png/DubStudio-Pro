import { create } from 'zustand';
import type { TranslationSegment, GeneratedAudio } from '@dubstudio/shared-types';
import { api } from '@/services/api';

interface TranslationState {
  translations: TranslationSegment[];
  generatedAudios: GeneratedAudio[];
  selectedTranslationId: string | null;
  targetLanguage: string;
  provider: 'gemini' | 'codecraft';
  model: string;
  isTranslating: boolean;

  loadTranslations: (projectId: string) => Promise<void>;
  loadGeneratedAudios: (projectId: string) => Promise<void>;
  setSelectedTranslationId: (id: string | null) => void;
  setTargetLanguage: (lang: string) => void;
  setProvider: (p: 'gemini' | 'codecraft') => void;
  setModel: (m: string) => void;
  updateTranslationText: (projectId: string, translationId: string, text: string) => Promise<void>;
  updateTranslationFields: (projectId: string, translationId: string, fields: Partial<TranslationSegment>) => Promise<void>;
  toggleApproval: (projectId: string, translationId: string) => Promise<void>;
}


export const useTranslationStore = create<TranslationState>((set, get) => ({
  translations: [],
  generatedAudios: [],
  selectedTranslationId: null,
  targetLanguage: 'km',
  provider: 'gemini',
  model: 'gemini-3.5-flash',
  isTranslating: false,

  loadTranslations: async (projectId: string) => {
    try {
      const [items, audios] = await Promise.all([
        api.getTranslations(projectId),
        api.getGeneratedAudios(projectId).catch(() => []),
      ]);
      set({ translations: items, generatedAudios: audios });
    } catch (e) {
      console.error('Failed to load translations:', e);
    }
  },

  loadGeneratedAudios: async (projectId: string) => {
    try {
      const audios = await api.getGeneratedAudios(projectId);
      set({ generatedAudios: audios });
    } catch (e) {
      console.error('Failed to load generated audios:', e);
    }
  },

  setSelectedTranslationId: (id) => set({ selectedTranslationId: id }),
  setTargetLanguage: (lang) => set({ targetLanguage: lang }),
  setProvider: (p) => set({ provider: p }),
  setModel: (m) => set({ model: m }),

  updateTranslationText: async (projectId: string, translationId: string, text: string) => {
    // Optimistic update
    set((state) => ({
      translations: state.translations.map((t) =>
        t.id === translationId ? { ...t, translatedText: text, isManuallyEdited: true } : t
      ),
    }));
    try {
      await api.updateTranslation(projectId, translationId, text);
    } catch (e) {
      console.error('Failed to update translation on backend:', e);
    }
  },

  updateTranslationFields: async (projectId: string, translationId: string, fields: Partial<TranslationSegment>) => {
    set((state) => ({
      translations: state.translations.map((t) =>
        t.id === translationId ? { ...t, ...fields, isManuallyEdited: true } : t
      ),
    }));
    try {
      await api.updateTranslation(projectId, translationId, fields);
    } catch (e) {
      console.error('Failed to update translation fields on backend:', e);
    }
  },

  toggleApproval: async (projectId: string, translationId: string) => {
    const current = get().translations.find((t) => t.id === translationId);
    if (!current) return;
    const newStatus = current.approvalStatus === 'approved' ? 'needs_review' : 'approved';
    set((state) => ({
      translations: state.translations.map((t) =>
        t.id === translationId ? { ...t, approvalStatus: newStatus } : t
      ),
    }));
    try {
      await api.updateTranslation(projectId, translationId, { approvalStatus: newStatus });
    } catch (e) {
      console.error('Failed to toggle approval status:', e);
    }
  },
}));

