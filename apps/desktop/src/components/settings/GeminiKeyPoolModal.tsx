import React, { useState, useEffect } from 'react';
import { Key, Sparkles, RefreshCw, Trash2, ExternalLink, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/services/api';

export function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export const GeminiKeyPoolModal: React.FC = () => {
  const {
    settings,
    isGeminiPoolModalOpen,
    closeGeminiPoolModal,
    addGeminiKey,
    removeGeminiKey,
    clearGeminiKeys,
    setGeminiKeys,
  } = useSettingsStore();

  const [singleKeyInput, setSingleKeyInput] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [keyStatuses, setKeyStatuses] = useState<Record<string, 'ready' | 'testing' | 'error'>>({});
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const keys: string[] = settings.aiProviders.geminiApiKeys?.length
    ? settings.aiProviders.geminiApiKeys
    : settings.aiProviders.geminiApiKey
    ? [settings.aiProviders.geminiApiKey]
    : [];

  // Initialize status for each key as 'ready' if not set
  useEffect(() => {
    setKeyStatuses((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        if (!next[k]) {
          next[k] = 'ready';
        }
      });
      return next;
    });
  }, [keys]);

  if (!isGeminiPoolModalOpen) return null;

  const handleAddSingleKey = async () => {
    const k = singleKeyInput.trim();
    if (!k) return;
    if (keys.includes(k)) {
      alert('Key is already in the pool!');
      return;
    }
    const success = await addGeminiKey(k);
    if (success) {
      setSingleKeyInput('');
      setKeyStatuses((prev) => ({ ...prev, [k]: 'ready' }));
      setStatusMessage(`Added key ...${k.slice(-4)} to pool`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleImportBulkKeys = async () => {
    const lines = bulkInput
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter((k) => k && !['dummy_test_key', 'your_api_key_here', 'aizasy...', 'placeholder'].includes(k.toLowerCase()));

    if (lines.length === 0) {
      alert('Please enter at least one valid API key.');
      return;
    }

    // Merge unique
    const unique = Array.from(new Set([...keys, ...lines]));
    await setGeminiKeys(unique);
    setBulkInput('');
    setBulkMode(false);
    setStatusMessage(`Imported ${lines.length} key(s) to pool!`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleTestSingleKey = async (key: string) => {
    setKeyStatuses((prev) => ({ ...prev, [key]: 'testing' }));
    try {
      const res = await api.testConnection('gemini', key, undefined, settings.aiProviders.geminiModel, [key]);
      if (res.success) {
        setKeyStatuses((prev) => ({ ...prev, [key]: 'ready' }));
      } else {
        setKeyStatuses((prev) => ({ ...prev, [key]: 'error' }));
      }
    } catch {
      setKeyStatuses((prev) => ({ ...prev, [key]: 'error' }));
    }
  };

  const handleTestAll = async () => {
    if (keys.length === 0) return;
    setIsTestingAll(true);
    const initialTesting: Record<string, 'ready' | 'testing' | 'error'> = {};
    keys.forEach((k) => (initialTesting[k] = 'testing'));
    setKeyStatuses(initialTesting);

    await Promise.all(
      keys.map(async (key) => {
        try {
          const res = await api.testConnection('gemini', key, undefined, settings.aiProviders.geminiModel, [key]);
          setKeyStatuses((prev) => ({ ...prev, [key]: res.success ? 'ready' : 'error' }));
        } catch {
          setKeyStatuses((prev) => ({ ...prev, [key]: 'error' }));
        }
      })
    );
    setIsTestingAll(false);
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to remove all API keys from the pool?')) {
      await clearGeminiKeys();
      setKeyStatuses({});
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

  const activeCount = keys.filter((k) => keyStatuses[k] !== 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-lg bg-white dark:bg-[#18181B] text-slate-900 dark:text-zinc-100 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 p-6 flex flex-col relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={closeGeminiPoolModal}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
            <Key className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 dark:text-zinc-100 tracking-tight">
                Gemini API Keys Pool
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100/80 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                No Limit
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-khmer mt-0.5">
              បន្ថែម API Key បានច្រើនឥតកំណត់ (Auto-Rotation & Smart Failover)
            </p>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 border border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
              {activeCount} of {keys.length} Keys Active
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleTestAll}
              disabled={isTestingAll || keys.length === 0}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
              <span>Test All</span>
            </button>
            <button
              onClick={handleClearAll}
              disabled={keys.length === 0}
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          </div>
        </div>

        {/* ADD NEW GEMINI API KEY Section */}
        <div className="mt-5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-zinc-300 uppercase">
              ADD NEW GEMINI API KEY
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBulkMode(!bulkMode)}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {bulkMode ? 'Single Key Mode' : 'Bulk Paste Mode (Multiple)'}
              </button>
              <button
                onClick={openGoogleAIStudio}
                className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 flex items-center gap-0.5"
              >
                <span>Get Free Key</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {bulkMode ? (
            <div className="flex flex-col gap-2 mt-1">
              <textarea
                rows={4}
                placeholder={`Paste multiple Gemini API keys here (one key per line)...\nAIzaSy...\nAIzaSy...`}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs resize-y"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setBulkMode(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-zinc-400 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportBulkKeys}
                  className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-all shadow-xs"
                >
                  + Import Keys
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                placeholder="Paste your Gemini API key (AIzaSy...)"
                value={singleKeyInput}
                onChange={(e) => setSingleKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSingleKey();
                }}
                className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
              />
              <button
                onClick={handleAddSingleKey}
                disabled={!singleKeyInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-all shrink-0 disabled:opacity-50"
              >
                <span>+ Add Key</span>
              </button>
            </div>
          )}
        </div>

        {/* YOUR KEYS POOL Section */}
        <div className="mt-5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-zinc-300 uppercase">
              YOUR KEYS POOL ({keys.length})
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 italic">
              auto-rotates when quota limit is reached
            </span>
          </div>

          <div className="mt-1 flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
            {keys.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400 dark:text-zinc-500">
                No Gemini API keys in pool yet. Add one above to get started.
              </div>
            ) : (
              keys.map((k, index) => {
                const status = keyStatuses[k] || 'ready';
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-2.5 px-3 flex items-center justify-between shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500 w-6 font-mono">
                        #{index + 1}
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-zinc-200 tracking-wider">
                        {maskApiKey(k)}
                      </span>

                      {status === 'ready' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                          <span>Ready</span>
                        </span>
                      )}
                      {status === 'testing' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Testing...</span>
                        </span>
                      )}
                      {status === 'error' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Rate Limited / Error</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTestSingleKey(k)}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                      >
                        Test
                      </button>
                      <button
                        onClick={() => removeGeminiKey(index)}
                        title="Remove key"
                        className="text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Info / Educational Box */}
        <div className="mt-5 p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/80 dark:border-indigo-900/40 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="font-khmer font-bold text-xs text-slate-800 dark:text-zinc-100">
              របៀបដំណើរការ Multi-Key Auto-Rotation & Failover:
            </span>
            <p className="font-khmer text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed">
              អ្នកអាចបញ្ចូល API Key ប៉ុន្មានក៏បាន (១, ៥, ១០ ឬច្រើនជាងនេះ)។ នៅពេល Key មួយជួបកម្រិតកំណត់កូតា (429 Rate Limit) ប្រព័ន្ធនឹងប្តូរទៅប្រើ Key បន្ទាប់ដោយស្វ័យប្រវត្តភ្លាមៗ ដោយមិនធ្វើឱ្យការ Transcribe ឬ Translate របស់អ្នករអាក់រអួលឡើយ!
            </p>
          </div>
        </div>

        {/* Bottom Action */}
        <div className="mt-5 flex items-center justify-between pt-1">
          {statusMessage ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-fade-in">
              ✓ {statusMessage}
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={closeGeminiPoolModal}
            className="bg-slate-900 hover:bg-black dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white px-7 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
