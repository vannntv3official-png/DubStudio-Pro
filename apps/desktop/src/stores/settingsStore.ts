import { create } from 'zustand';
import type { AppSettings } from '@dubstudio/shared-types';
import { api } from '@/services/api';

const defaultSettings: AppSettings = {
  theme: 'dark',
  accentColor: '#3B82F6',
  aiProviders: {
    geminiApiKey: '',
    geminiApiKeys: [],
    geminiModel: 'gemini-3.5-flash',
    codecraftApiKey: '',
    codecraftBaseUrl: 'https://codecraftapi.com/v1',
    codecraftModel: 'deepseek-chat',
    sensevoiceModel: 'SenseVoice-Small',
    sensevoiceLocalUrl: 'http://127.0.0.1:10095',
    paraformerModel: 'Paraformer-zh',
    paraformerLocalUrl: 'http://127.0.0.1:10095',
    defaultTranscriptionProvider: 'gemini',
    defaultTranslationProvider: 'gemini',
    defaultTTSProvider: 'edge_tts',
    requestTimeoutSeconds: 60,
    retryAttempts: 3,
  },
  defaultExportPath: '',
  projectsDir: '',
  tempDir: '',
  hardwareAcceleration: true,
  autoSaveIntervalSeconds: 30,
  snapSensitivityPx: 10,
};

interface SettingsState {
  settings: AppSettings;
  isModalOpen: boolean;
  isGeminiPoolModalOpen: boolean;
  isLoading: boolean;
  testResult: { provider: string; success: boolean; message: string; models: string[] } | null;

  openModal: () => void;
  closeModal: () => void;
  openGeminiPoolModal: () => void;
  closeGeminiPoolModal: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: (newSettings: AppSettings, shouldCloseModal?: boolean) => Promise<void>;
  testConnection: (provider: string, apiKey: string, baseUrl?: string, model?: string, apiKeys?: string[]) => Promise<void>;
  addGeminiKey: (key: string) => Promise<boolean>;
  removeGeminiKey: (index: number) => Promise<void>;
  clearGeminiKeys: () => Promise<void>;
  setGeminiKeys: (keys: string[]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isModalOpen: false,
  isGeminiPoolModalOpen: false,
  isLoading: false,
  testResult: null,

  openModal: () => set({ isModalOpen: true, testResult: null }),
  closeModal: () => set({ isModalOpen: false }),
  openGeminiPoolModal: () => set({ isGeminiPoolModalOpen: true }),
  closeGeminiPoolModal: () => set({ isGeminiPoolModalOpen: false }),

  loadSettings: async () => {
    try {
      const data = await api.getSettings();
      set({ settings: data });
    } catch (e) {
      console.warn('Could not load settings, using defaults:', e);
    }
  },

  saveSettings: async (newSettings, shouldCloseModal = true) => {
    set({ isLoading: true });
    try {
      const saved = await api.updateSettings(newSettings);
      set({ settings: saved, isLoading: false, ...(shouldCloseModal ? { isModalOpen: false } : {}) });
    } catch (e) {
      set({ isLoading: false });
      console.error('Failed to save settings:', e);
    }
  },

  addGeminiKey: async (newKey: string) => {
    const k = newKey.trim();
    if (!k) return false;
    const current = get().settings;
    const existing = current.aiProviders.geminiApiKeys?.length
      ? current.aiProviders.geminiApiKeys
      : (current.aiProviders.geminiApiKey ? [current.aiProviders.geminiApiKey] : []);
    if (existing.includes(k)) return false;
    const updatedKeys = [...existing, k];
    const updatedSettings: AppSettings = {
      ...current,
      aiProviders: {
        ...current.aiProviders,
        geminiApiKey: updatedKeys[0] || '',
        geminiApiKeys: updatedKeys,
      },
    };
    await get().saveSettings(updatedSettings, false);
    return true;
  },

  removeGeminiKey: async (index: number) => {
    const current = get().settings;
    const existing = current.aiProviders.geminiApiKeys?.length
      ? current.aiProviders.geminiApiKeys
      : (current.aiProviders.geminiApiKey ? [current.aiProviders.geminiApiKey] : []);
    const updatedKeys = existing.filter((_, i) => i !== index);
    const updatedSettings: AppSettings = {
      ...current,
      aiProviders: {
        ...current.aiProviders,
        geminiApiKey: updatedKeys[0] || '',
        geminiApiKeys: updatedKeys,
      },
    };
    await get().saveSettings(updatedSettings, false);
  },

  clearGeminiKeys: async () => {
    const current = get().settings;
    const updatedSettings: AppSettings = {
      ...current,
      aiProviders: {
        ...current.aiProviders,
        geminiApiKey: '',
        geminiApiKeys: [],
      },
    };
    await get().saveSettings(updatedSettings, false);
  },

  setGeminiKeys: async (keys: string[]) => {
    const current = get().settings;
    const updatedSettings: AppSettings = {
      ...current,
      aiProviders: {
        ...current.aiProviders,
        geminiApiKey: keys[0] || '',
        geminiApiKeys: keys,
      },
    };
    await get().saveSettings(updatedSettings, false);
  },

  testConnection: async (provider, apiKey, baseUrl, model, apiKeys) => {
    set({ isLoading: true, testResult: null });
    try {
      const res = await api.testConnection(provider, apiKey, baseUrl, model, apiKeys);
      set({
        isLoading: false,
        testResult: {
          provider,
          success: res.success,
          message: res.message,
          models: res.models || [],
        },
      });
    } catch (e: any) {
      set({
        isLoading: false,
        testResult: {
          provider,
          success: false,
          message: e.message,
          models: [],
        },
      });
    }
  },
}));
