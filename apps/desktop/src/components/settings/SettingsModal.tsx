import React, { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
  Cpu,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Layers,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { maskApiKey } from './GeminiKeyPoolModal';

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
    setLocalSettings({
      ...localSettings,
      aiProviders: {
        ...localSettings.aiProviders,
        geminiApiKey: parsed[0] || '',
        geminiApiKeys: parsed,
      },
    });
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
    setTimeout(() => setSavedFeedback(false), 2500);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#18181B] text-slate-900 dark:text-zinc-100 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 p-6 flex flex-col relative overflow-hidden max-h-[92vh]">
        {/* Close Button */}
        <button
          onClick={closeModal}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-studio-surface border border-studio-border flex items-center justify-center shrink-0 mt-0.5 shadow-sm p-1.5">
            <img src="/icon.png" alt="DubStudio Pro" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 dark:text-zinc-100 tracking-tight">
                DubStudio <span className="text-studio-accent">Pro</span> Settings
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100/80 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                Preferences
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-khmer mt-0.5">
              កំណត់រចនាសម្ព័ន្ធ AI Models, API Keys & ប្រព័ន្ធដំណើរការ (AI Configuration & System Preferences)
            </p>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="mt-5 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Card 1: Google Gemini API Keys Pool */}
          <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
            {/* Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                  Google Gemini API Keys Pool
                </span>

                {parsedKeys.length > 1 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {parsedKeys.length} Keys Pool (Active)
                  </span>
                ) : parsedKeys.length === 1 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
                    1 Key Configured
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                    No Key
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

            {/* Keys Textarea Input */}
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
                rows={3}
                placeholder={`Paste your Gemini API keys here (one key per line)...\nAIzaSy...\nAIzaSy...`}
                value={keysText}
                onChange={handleKeysTextChange}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs resize-y"
              />

              {/* Chips preview */}
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

              {/* Load Balancing & Failover Info Card */}
              <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/80 dark:border-indigo-900/40 flex items-start gap-2.5 text-xs text-slate-600 dark:text-zinc-300 mt-1">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
                  <span>
                    <strong>Automatic Load-Balancing & Failover:</strong> Requests rotate across keys to avoid hitting the 15 RPM / 429 quota limit. If any key runs out of quota, DubStudio instantly fails over to the next key.
                  </span>
                  <span>
                    Create free keys at{' '}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      onClick={openGoogleAIStudio}
                      className="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-semibold"
                    >
                      Google AI Studio
                    </a>{' '}
                    (keys start with <code className="bg-indigo-100 dark:bg-indigo-900/50 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-700 dark:text-indigo-300">AIzaSy...</code>).
                  </span>
                </div>
              </div>
            </div>

            {/* Gemini Model Selector */}
            <div className="flex flex-col gap-1.5 mt-1">
              <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                Gemini Model
              </label>
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
                <option value="gemini-3.5-flash">gemini-3.5-flash (Recommended - Fast & Highly Accurate)</option>
                <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra-Lightweight & Higher Daily Quota)</option>
                <option value="gemini-3.6-flash">gemini-3.6-flash (Balanced Multimodal Performance)</option>
                <option value="gemini-3.7-flash">gemini-3.7-flash (Advanced Reasoning & Transcription)</option>
                <option value="gemini-3.8-flash">gemini-3.8-flash (Next-Gen Flagship Flash)</option>
              </select>
            </div>
          </div>

          {/* Card 2: Codecraft API (OpenAI Compatible) */}
          <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-3 shadow-xs">
            <div className="flex items-center justify-between">
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

          {/* Card 3: Editor Preferences */}
          <div className="rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 p-4 flex flex-col gap-2.5 shadow-xs">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-500" />
              <span className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-zinc-300 uppercase">
                Editor Preferences
              </span>
            </div>

            <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Enable GPU Hardware Acceleration
                </span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Accelerate timeline rendering, video decoding and UI responsiveness
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
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          {savedFeedback ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-fade-in flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </span>
          ) : (
            <span />
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
