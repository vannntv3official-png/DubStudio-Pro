import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Sparkles,
  Globe,
  HardDrive,
  Cpu,
  Key,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Layers,
  FolderOpen,
  ShieldCheck,
  ExternalLink,
  Mic,
  Languages,
  Volume2,
  Info,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { maskApiKey } from './GeminiKeyPoolModal';
import type { AIProvider } from '@dubstudio/shared-types';

type SettingsTab = 'general' | 'gemini' | 'local_asr' | 'codecraft' | 'storage';

function parseKeysFromText(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k && !['dummy_test_key', 'your_api_key_here', 'aizasy...', 'placeholder'].includes(k.toLowerCase()));
}

export const SettingsModal: React.FC = () => {
  const {
    settings,
    isModalOpen,
    closeModal,
    openGeminiPoolModal,
    saveSettings,
    testConnection,
    testResult,
    isLoading,
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [localSettings, setLocalSettings] = useState(settings);
  const [keysText, setKeysText] = useState('');
  const [showCodecraftKey, setShowCodecraftKey] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
    const existing = settings.aiProviders.geminiApiKeys?.length
      ? settings.aiProviders.geminiApiKeys.join('\n')
      : settings.aiProviders.geminiApiKey || '';
    setKeysText(existing);
  }, [settings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, closeModal]);

  if (!isModalOpen) return null;

  const parsedKeys = parseKeysFromText(keysText);

  const handleKeysTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setKeysText(val);
    const parsed = parseKeysFromText(val);
    setLocalSettings((prev) => ({
      ...prev,
      aiProviders: {
        ...prev.aiProviders,
        geminiApiKey: parsed[0] || '',
        geminiApiKeys: parsed,
      },
    }));
  };

  const handleSave = async () => {
    const parsed = parseKeysFromText(keysText);
    await saveSettings({
      ...localSettings,
      aiProviders: {
        ...localSettings.aiProviders,
        geminiApiKey: parsed[0] || '',
        geminiApiKeys: parsed,
      },
    });
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
      closeModal();
    }, 1200);
  };

  const handleTestGemini = async () => {
    const parsed = parseKeysFromText(keysText);
    await testConnection(
      'gemini',
      parsed[0] || localSettings.aiProviders.geminiApiKey,
      undefined,
      localSettings.aiProviders.geminiModel,
      parsed
    );
  };

  const handleTestCodecraft = async () => {
    await testConnection(
      'codecraft',
      localSettings.aiProviders.codecraftApiKey,
      localSettings.aiProviders.codecraftBaseUrl,
      localSettings.aiProviders.codecraftModel
    );
  };

  const handleTestSenseVoice = async () => {
    await testConnection(
      'sensevoice',
      '',
      localSettings.aiProviders.sensevoiceLocalUrl,
      localSettings.aiProviders.sensevoiceModel
    );
  };

  const handleTestParaformer = async () => {
    await testConnection(
      'paraformer',
      '',
      localSettings.aiProviders.paraformerLocalUrl,
      localSettings.aiProviders.paraformerModel
    );
  };

  const handleSelectFolder = async (field: 'projectsDir' | 'defaultExportPath' | 'tempDir') => {
    if (typeof window !== 'undefined' && window.dubstudio?.selectFolder) {
      const selected = await window.dubstudio.selectFolder();
      if (selected) {
        setLocalSettings((prev) => ({
          ...prev,
          [field]: selected,
        }));
      }
    }
  };

  const openGoogleAIStudio = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined' && window.dubstudio) {
      window.dubstudio.openExternal('https://aistudio.google.com/apikey');
    } else {
      window.open('https://aistudio.google.com/apikey', '_blank');
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in select-none"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#181a20] text-slate-900 dark:text-zinc-100 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 p-6 flex flex-col relative overflow-hidden max-h-[92vh]">
        {/* Close Button */}
        <button
          onClick={closeModal}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-studio-surface border border-studio-border flex items-center justify-center shrink-0 mt-0.5 shadow-sm p-1.5">
            <img src="/icon.png" alt="DubStudio Pro" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 dark:text-zinc-100 tracking-tight">
                DubStudio <span className="text-studio-accent">Pro</span> Settings
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100/80 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/40 dark:border-indigo-800/40">
                Preferences
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-khmer mt-0.5">
              គ្រប់គ្រង AI Providers, Gemini Models និងការកំណត់ប្រព័ន្ធទូទៅ (AI Providers & System Preferences)
            </p>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="mt-4 flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800 shrink-0">
          {/* Tab 1: General */}
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'general'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800/40'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>General (ទូទៅ)</span>
          </button>

          {/* Tab 2: Gemini API */}
          <button
            type="button"
            onClick={() => setActiveTab('gemini')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'gemini'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Google Gemini</span>
            {parsedKeys.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200/50 dark:border-emerald-800/50">
                {parsedKeys.length}
              </span>
            )}
          </button>

          {/* Tab 3: Local ASR */}
          <button
            type="button"
            onClick={() => setActiveTab('local_asr')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'local_asr'
                ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800/40'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Local ASR</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200/50 dark:border-emerald-800/50">
              Offline
            </span>
          </button>

          {/* Tab 4: Codecraft */}
          <button
            type="button"
            onClick={() => setActiveTab('codecraft')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'codecraft'
                ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800/40'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Codecraft AI</span>
          </button>

          {/* Tab 4: System & Storage */}
          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'storage'
                ? 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800/40'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage & Paths</span>
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1 flex flex-col gap-4 min-h-[360px]">
          {/* ============================================================== */}
          {/* TAB 1: GENERAL (AI PROVIDERS & CORE SETTINGS)                  */}
          {/* ============================================================== */}
          {activeTab === 'general' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              {/* Card 1: Default AI Providers Routing */}
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                      គ្រប់គ្រង AI Providers (Default AI Engines)
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    កំណត់ប្រព័ន្ធដំណើរការតាមតួនាទី
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                  {/* Transcription Engine */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Speech Transcription (បំប្លែងសំឡេង)</span>
                    </label>
                    <select
                      value={localSettings.aiProviders.defaultTranscriptionProvider}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: {
                            ...localSettings.aiProviders,
                            defaultTranscriptionProvider: e.target.value as AIProvider,
                          },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer"
                    >
                      <option value="gemini">Google Gemini (Recommended - Native Audio & Timestamps)</option>
                      <option value="sensevoice">SenseVoice-Small (Local / Offline - ក្នុងម៉ាស៊ីន Fast)</option>
                      <option value="paraformer">Paraformer-zh (Local Chinese / ក្នុងម៉ាស៊ីន VAD + Punc)</option>
                      <option value="codecraft">Codecraft API (OpenAI Compatible Endpoint)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">
                      ប្រើប្រាស់សម្រាប់ស្ដាប់សំឡេងដើម និងកំណត់ម៉ោងតាមពាក្យនីមួយៗ
                    </p>
                  </div>

                  {/* Translation Engine */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Khmer Dubbing Translation (បកប្រែ & សម្រួល)</span>
                    </label>
                    <select
                      value={localSettings.aiProviders.defaultTranslationProvider}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: {
                            ...localSettings.aiProviders,
                            defaultTranslationProvider: e.target.value as 'gemini' | 'codecraft',
                          },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer"
                    >
                      <option value="gemini">Google Gemini (Recommended - Natural Spoken Khmer)</option>
                      <option value="codecraft">Codecraft API (Custom LLM Endpoint)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">
                      បកប្រែពាក្យសំដីសន្ទនាបែបធម្មជាតិ គោរពកាលៈទេសៈ និងកំណត់ពាក្យបញ្ចេញសំឡេង
                    </p>
                  </div>
                </div>

                {/* TTS Provider Information Card */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-zinc-800/80 flex items-center justify-between text-xs mt-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800 dark:text-zinc-200 text-xs">
                        Speech Synthesis Engine (TTS)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Microsoft Edge-TTS (Khmer Neural: km-KH-PisethNeural & km-KH-Sreymom/Daun)
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                    Active & Fast
                  </span>
                </div>
              </div>

              {/* Card 2: Primary Gemini Model Selection */}
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                      Gemini Model សំខាន់សម្រាប់ Dubbing
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('gemini')}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <span>Manage Keys Pool ({parsedKeys.length})</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <select
                    value={localSettings.aiProviders.geminiModel}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        aiProviders: { ...localSettings.aiProviders, geminiModel: e.target.value },
                      })
                    }
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer"
                  >
                    <option value="gemini-3.5-flash-lite">
                      gemini-3.5-flash-lite (⭐ Recommended for Free Tier: Daily Quota ខ្ពស់ & Ultra Fast)
                    </option>
                    <option value="gemini-3.5-flash">
                      gemini-3.5-flash (🎯 Flagship Flash: High Accuracy & Balanced Speed)
                    </option>
                    <option value="gemini-3.6-flash">
                      gemini-3.6-flash (⚖️ Balanced Multimodal Performance)
                    </option>
                    <option value="gemini-3.7-flash">
                      gemini-3.7-flash (🧠 Advanced Reasoning & Phrasing)
                    </option>
                    <option value="gemini-3.8-flash">
                      gemini-3.8-flash (🚀 Next-Gen Flash Flagship)
                    </option>
                  </select>
                </div>

                {/* Key Pool status alert */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100/80 dark:border-indigo-900/40 text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="text-[11px] text-slate-700 dark:text-zinc-300">
                      {parsedKeys.length > 0 ? (
                        <>
                          បានភ្ជាប់កូនសោរចំនួន <strong>{parsedKeys.length} Keys</strong> ក្នុង Key Pool (Auto-Failover ពេលជួប 429 Quota)
                        </>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          មិនទាន់បានបញ្ចូល Gemini API Key នៅឡើយទេ។ សូមចុចបញ្ចូលកូនសោរ។
                        </span>
                      )}
                    </span>
                  </div>
                  {parsedKeys.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('gemini')}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-semibold transition-colors shrink-0"
                    >
                      Add Keys
                    </button>
                  )}
                </div>
              </div>

              {/* Card 3: System Performance & Editor Preferences */}
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-zinc-800 pb-2.5">
                  <Cpu className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                    ការកំណត់ដំណើរការ និងប្រព័ន្ធ (System & Editor Preferences)
                  </span>
                </div>

                {/* GPU Hardware Acceleration */}
                <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                      Enable GPU Hardware Acceleration
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      បង្កើនល្បឿន Render Timeline, Video Decoding និងចាក់ Preview រលូន
                    </span>
                  </div>
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      setLocalSettings({ ...localSettings, hardwareAcceleration: !localSettings.hardwareAcceleration });
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ml-4 ${
                      localSettings.hardwareAcceleration ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${
                        localSettings.hardwareAcceleration ? 'left-6' : 'left-1'
                      }`}
                    />
                  </div>
                </label>

                {/* Auto Save & Timeline Snap Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      Auto-Save Interval (រក្សាទុកស្វ័យប្រវត្តិ)
                    </label>
                    <select
                      value={localSettings.autoSaveIntervalSeconds}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          autoSaveIntervalSeconds: Number(e.target.value),
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer"
                    >
                      <option value={15}>Every 15 seconds (ញឹកញាប់)</option>
                      <option value={30}>Every 30 seconds (Default)</option>
                      <option value={60}>Every 1 minute</option>
                      <option value={300}>Every 5 minutes</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      Timeline Snap Sensitivity (ភាពរំញោចនៃការខ្ទាស់)
                    </label>
                    <select
                      value={localSettings.snapSensitivityPx}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          snapSensitivityPx: Number(e.target.value),
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer"
                    >
                      <option value={5}>5 px (Precise - ម៉ត់ចត់)</option>
                      <option value={10}>10 px (Default - ល្អបំផុត)</option>
                      <option value={15}>15 px (Snappy - ងាយស្រួល)</option>
                      <option value={20}>20 px (Strong snap)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: GOOGLE GEMINI KEYS POOL                                 */}
          {/* ============================================================== */}
          {activeTab === 'gemini' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                      Google Gemini API Keys Pool
                    </span>
                    {parsedKeys.length > 1 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {parsedKeys.length} Keys Active
                      </span>
                    ) : parsedKeys.length === 1 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
                        1 Key
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                        No Keys
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        openGeminiPoolModal();
                      }}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 transition-colors"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Open Pool Manager</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTestGemini}
                      disabled={isLoading || parsedKeys.length === 0}
                      className="text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 transition-colors disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                      )}
                      <span>Test Pool</span>
                    </button>
                  </div>
                </div>

                {/* Textarea */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>API Keys Pool (Paste multiple keys, one per line)</span>
                    </label>
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium">
                      {parsedKeys.length} valid key{parsedKeys.length !== 1 ? 's' : ''} detected
                    </span>
                  </div>

                  <textarea
                    rows={4}
                    placeholder={`Paste your Gemini API keys here (one key per line)...\nAIzaSy...\nAIzaSy...`}
                    value={keysText}
                    onChange={handleKeysTextChange}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs resize-y"
                  />

                  {/* Chips Preview */}
                  {parsedKeys.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                      {parsedKeys.map((k, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 text-[10px] font-mono shadow-xs"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-slate-700 dark:text-zinc-200 font-semibold">
                            Key #{idx + 1}: {maskApiKey(k)}
                          </span>
                          {idx === 0 ? (
                            <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-sans font-bold ml-0.5">
                              (Primary)
                            </span>
                          ) : (
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-sans ml-0.5">
                              (Rotation)
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Info Notice */}
                  <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/80 dark:border-indigo-900/40 flex items-start gap-2.5 text-xs text-slate-600 dark:text-zinc-300 mt-1">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
                      <span>
                        <strong>Automatic Load-Balancing & Failover:</strong> សំណើទាំងអស់ត្រូវបានចែករំលែកឆ្លាស់គ្នារវាងកូនសោរ ដើម្បីកុំឱ្យជាប់ Quota 15 RPM / 429 Rate Limit។ ប្រសិនបើកូនសោរណាមួយជាប់ Quota ប្រព័ន្ធនឹងប្តូរទៅកូនសោរបន្ទាប់ភ្លាមៗ។
                      </span>
                      <span>
                        បង្កើតកូនសោរឥតគិតថ្លៃនៅ{' '}
                        <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noreferrer"
                          onClick={openGoogleAIStudio}
                          className="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-semibold inline-flex items-center gap-1"
                        >
                          <span>Google AI Studio</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>{' '}
                        (កូនសោរចាប់ផ្ដើមដោយ <code className="bg-indigo-100 dark:bg-indigo-900/50 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-700 dark:text-indigo-300">AIzaSy...</code>).
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: LOCAL ASR (SENSEVOICE-SMALL & PARAFORMER-ZH)             */}
          {/* ============================================================== */}
          {activeTab === 'local_asr' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              {/* Engine 1: SenseVoice-Small */}
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                      SenseVoice-Small (Multilingual Local Engine)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                      FunASR • Offline
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSenseVoice}
                    disabled={isLoading}
                    className="text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                    )}
                    <span>Test Engine</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      SenseVoice Model Name
                    </label>
                    <input
                      type="text"
                      value={localSettings.aiProviders.sensevoiceModel || 'SenseVoice-Small'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: { ...localSettings.aiProviders, sensevoiceModel: e.target.value },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      Local HTTP Fallback Endpoint (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:10095"
                      value={localSettings.aiProviders.sensevoiceLocalUrl || ''}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: { ...localSettings.aiProviders, sensevoiceLocalUrl: e.target.value },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  គាំទ្រការបំប្លែងសំឡេងល្បឿនលឿន (Rich Audio Transcription) ជាភាសាចិន អង់គ្លេស កន្តាំង ជប៉ុន និងកូរ៉េ។ ដំណើរការដោយផ្ទាល់ក្នុងម៉ាស៊ីន (In-process PyTorch + FunASR) មិនចាំបាច់មាន API Key ឬ Internet។
                </p>
              </div>

              {/* Engine 2: Paraformer-zh */}
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-sky-500" />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                      Paraformer-zh (High-Accuracy Chinese ASR)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/40">
                      VAD + Punc • Offline
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestParaformer}
                    disabled={isLoading}
                    className="text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                    )}
                    <span>Test Engine</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      Paraformer Model Name
                    </label>
                    <input
                      type="text"
                      value={localSettings.aiProviders.paraformerModel || 'Paraformer-zh'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: { ...localSettings.aiProviders, paraformerModel: e.target.value },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      Local HTTP Fallback Endpoint (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:10095"
                      value={localSettings.aiProviders.paraformerLocalUrl || ''}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: { ...localSettings.aiProviders, paraformerLocalUrl: e.target.value },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  ម៉ូដែល Non-Autoregressive លំដាប់កំពូលសម្រាប់ភាសាចិន (Chinese ASR) រួមបញ្ចូលប្រព័ន្ធ FSMN-VAD (Voice Activity Detection) និង CT-Transformer Punctuation Restoration ដើម្បីកាត់ឃ្លាបានច្បាស់លាស់បំផុត។
                </p>
              </div>

              {/* Hardware Acceleration & Privacy Badge */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-zinc-300">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5 text-[11px]">
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    100% Private, Local & Quota-Free (សុវត្ថិភាពខ្ពស់ គ្មានដែនកំណត់)
                  </span>
                  <span className="text-slate-500 dark:text-zinc-400">
                    ដំណើរការក្នុងម៉ាស៊ីនកុំព្យូទ័ររបស់អ្នកដោយផ្ទាល់ មិនផ្ញើសំឡេងទៅ Cloud ឡើយ។ ប្រព័ន្ធនឹងជ្រើសរើស NVIDIA CUDA GPU ដោយស្វ័យប្រវត្តិ ប្រសិនបើមាន ឬប្រើពហុខ្នង CPU ដោយរលូន។
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: CODECRAFT AI (OPENAI COMPATIBLE)                       */}
          {/* ============================================================== */}
          {activeTab === 'codecraft' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-zinc-100">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    <span>Codecraft API (OpenAI Compatible)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestCodecraft}
                    disabled={isLoading || !localSettings.aiProviders.codecraftApiKey}
                    className="text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                    )}
                    <span>Test Connection</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                    Codecraft API Key
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showCodecraftKey ? 'text' : 'password'}
                      placeholder="cc_..."
                      value={localSettings.aiProviders.codecraftApiKey}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: { ...localSettings.aiProviders, codecraftApiKey: e.target.value },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCodecraftKey(!showCodecraftKey)}
                      className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                    >
                      {showCodecraftKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                    Codecraft Base URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://codecraftapi.com/v1"
                    value={localSettings.aiProviders.codecraftBaseUrl}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        aiProviders: { ...localSettings.aiProviders, codecraftBaseUrl: e.target.value },
                      })
                    }
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                    Codecraft Model
                  </label>
                  <select
                    value={localSettings.aiProviders.codecraftModel}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        aiProviders: { ...localSettings.aiProviders, codecraftModel: e.target.value },
                      })
                    }
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer"
                  >
                    <option value="deepseek-chat">deepseek-chat</option>
                    <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="qwen-2.5-72b">qwen-2.5-72b</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: STORAGE & PATHS                                         */}
          {/* ============================================================== */}
          {activeTab === 'storage' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3.5 shadow-xs">
                <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-zinc-800 pb-2.5">
                  <HardDrive className="w-4 h-4 text-sky-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                    កន្លែងផ្ទុកឯកសារ & ថត (Storage Directories & Paths)
                  </span>
                </div>

                {/* Projects Directory */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                    Projects Directory (ថតផ្ទុកគម្រោង)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Default system path (%APPDATA%\DubStudioAI\Projects)"
                      value={localSettings.projectsDir}
                      onChange={(e) => setLocalSettings({ ...localSettings, projectsDir: e.target.value })}
                      className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectFolder('projectsDir')}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                      <span>Browse</span>
                    </button>
                  </div>
                </div>

                {/* Default Export Path */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                    Default Export Directory (ថតទាញចេញវីដេអូស្រេច)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Default exports path..."
                      value={localSettings.defaultExportPath}
                      onChange={(e) => setLocalSettings({ ...localSettings, defaultExportPath: e.target.value })}
                      className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectFolder('defaultExportPath')}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                      <span>Browse</span>
                    </button>
                  </div>
                </div>

                {/* Network Timeout & Retries */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-zinc-800">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      Request Timeout (Seconds)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={300}
                      value={localSettings.aiProviders.requestTimeoutSeconds}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: {
                            ...localSettings.aiProviders,
                            requestTimeoutSeconds: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                      API Retry Attempts
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={localSettings.aiProviders.retryAttempts}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          aiProviders: {
                            ...localSettings.aiProviders,
                            retryAttempts: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Connection Test Output Banner */}
          {testResult && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                testResult.success
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/50 text-rose-700 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              )}
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">{testResult.message}</span>
                {testResult.models && testResult.models.length > 0 && (
                  <span className="text-[11px] opacity-85">
                    Available models: {testResult.models.slice(0, 5).join(', ')}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          {savedFeedback ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-fade-in flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>បានរក្សាទុកការកំណត់ដោយជោគជ័យ! (Saved)</span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              DubStudio Pro v2.0 • Khmer AI Localization Engine
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold px-6 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
