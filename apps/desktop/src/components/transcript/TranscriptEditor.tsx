import React, { useState, useEffect, useMemo } from 'react';
import {
  Mic,
  Sparkles,
  Search,
  Key,
  Layers,
  Sliders,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Volume2,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/services/api';

export const TranscriptEditor: React.FC = () => {
  const { currentProject, mediaAssets, setActiveJob } = useProjectStore();
  const { segments, selectedSegmentId, setSelectedSegmentId, updateSegmentText } = useTranscriptStore();
  const { setCurrentTimeMs } = usePlayerStore();
  const { settings, openModal, openGeminiPoolModal } = useSettingsStore();

  const [provider, setProvider] = useState<'gemini' | 'codecraft' | 'sensevoice' | 'paraformer'>(
    (settings.aiProviders.defaultTranscriptionProvider as any) || 'gemini'
  );
  const [geminiModel, setGeminiModel] = useState<string>(
    settings.aiProviders.geminiModel || 'gemini-3.5-flash-lite'
  );

  // Default to project source language, or 'auto' for automatic speech language detection
  const [sourceLang, setSourceLang] = useState<string>(
    currentProject?.sourceLanguage && currentProject.sourceLanguage !== 'en'
      ? currentProject.sourceLanguage
      : 'auto'
  );

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showConfig, setShowConfig] = useState(segments.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('all');

  useEffect(() => {
    if (settings.aiProviders.geminiModel) {
      setGeminiModel(settings.aiProviders.geminiModel);
    }
    if (settings.aiProviders.defaultTranscriptionProvider) {
      setProvider(settings.aiProviders.defaultTranscriptionProvider as any);
    }
  }, [settings.aiProviders.geminiModel, settings.aiProviders.defaultTranscriptionProvider]);

  useEffect(() => {
    if (currentProject?.sourceLanguage) {
      setSourceLang(currentProject.sourceLanguage);
    }
  }, [currentProject?.sourceLanguage]);

  // If segments load for the first time, collapse config drawer to maximize view
  useEffect(() => {
    if (segments.length > 0) {
      setShowConfig(false);
    }
  }, [segments.length > 0]);

  const isLocalProvider = provider === 'sensevoice' || provider === 'paraformer';
  const geminiPoolKeys = settings.aiProviders.geminiApiKeys || [];
  const primaryGeminiKey = geminiPoolKeys.length > 0 ? geminiPoolKeys[0] : settings.aiProviders.geminiApiKey;
  const rawKey = provider === 'gemini' ? primaryGeminiKey : settings.aiProviders.codecraftApiKey;
  const isKeyConfigured =
    isLocalProvider ||
    Boolean(
      rawKey?.trim() &&
      !['dummy_test_key', 'your_api_key_here', 'aizasy...', 'placeholder'].includes(rawKey.trim().toLowerCase())
    );

  const handleStartTranscription = async () => {
    if (!currentProject) {
      alert('Please create or open a project first.');
      return;
    }
    if (mediaAssets.length === 0) {
      alert('Please import a video into your project before starting transcription.');
      return;
    }
    if (!isKeyConfigured) {
      openModal();
      return;
    }

    const chosenModel =
      provider === 'gemini'
        ? geminiModel
        : provider === 'codecraft'
        ? settings.aiProviders.codecraftModel
        : provider === 'sensevoice'
        ? (settings.aiProviders.sensevoiceModel || 'SenseVoice-Small')
        : (settings.aiProviders.paraformerModel || 'Paraformer-zh');

    setIsTranscribing(true);
    try {
      const job = await api.startTranscription(
        currentProject.id,
        mediaAssets[0].id,
        provider,
        chosenModel,
        sourceLang
      );
      setActiveJob(job);
    } catch (e: any) {
      console.error('Transcription error:', e);
      alert(`Transcription error: ${e.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTimestamp = (ms: number) => {
    const totalSec = ms / 1000;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const msRemainder = Math.floor((ms % 1000) / 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${msRemainder}`;
  };

  // Distinct speakers in segments
  const distinctSpeakers = useMemo(() => {
    const set = new Set<string>();
    segments.forEach((s) => {
      if (s.speakerId) set.add(s.speakerId);
    });
    return Array.from(set);
  }, [segments]);

  // Filtered segments
  const filteredSegments = useMemo(() => {
    return segments.filter((s) => {
      if (selectedSpeaker !== 'all' && s.speakerId !== selectedSpeaker) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.text.toLowerCase().includes(q) || s.speakerId.toLowerCase().includes(q);
      }
      return true;
    });
  }, [segments, selectedSpeaker, searchQuery]);

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Compact Top Header */}
      <div className="p-2.5 border-b border-studio-border bg-studio-panel flex flex-col gap-2 shrink-0">
        {/* Row 1: Model status & Toggle button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono border truncate max-w-[170px] ${
                isLocalProvider
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
              }`}
            >
              {provider === 'gemini'
                ? geminiModel.replace('gemini-', '')
                : provider === 'codecraft'
                ? 'Codecraft'
                : provider === 'sensevoice'
                ? 'SenseVoice (Local)'
                : 'Paraformer (Local)'}
            </span>
            {isLocalProvider && (
              <span
                className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shrink-0"
                title="Offline Local Model (No API key required)"
              >
                <Check className="w-2.5 h-2.5" />
                <span>Offline</span>
              </span>
            )}
            {provider === 'gemini' && isKeyConfigured && (
              <button
                type="button"
                onClick={openGeminiPoolModal}
                className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1 shrink-0"
                title="Manage Gemini API Keys Pool"
              >
                <Layers className="w-2.5 h-2.5" />
                <span>{geminiPoolKeys.length} Keys</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-studio-muted hover:text-studio-text hover:bg-studio-surface transition-colors"
            title="Configure Transcription Settings"
          >
            <Sliders className="w-3 h-3 text-studio-accent" />
            <span>Options</span>
            {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Collapsible Options Drawer */}
        {showConfig && (
          <div className="p-2.5 rounded-xl bg-studio-surface/90 border border-studio-border/70 flex flex-col gap-2 animate-in fade-in duration-100">
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="AI Provider"
                options={[
                  { value: 'gemini', label: 'Google Gemini (Cloud AI)' },
                  { value: 'sensevoice', label: 'SenseVoice-Small (Local / ក្នុងម៉ាស៊ីន)' },
                  { value: 'paraformer', label: 'Paraformer-zh (Local Chinese / ក្នុងម៉ាស៊ីន)' },
                  { value: 'codecraft', label: 'Codecraft API (OpenAI Compatible)' },
                ]}
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
              />
              <Select
                label="Spoken Language"
                options={[
                  { value: 'auto', label: 'Auto-Detect (ស្វ័យប្រវត្តិ)' },
                  { value: 'zh', label: 'Chinese / 中文 (ចិន)' },
                  { value: 'en', label: 'English (អង់គ្លេស)' },
                  { value: 'km', label: 'Khmer (ខ្មែរ)' },
                  { value: 'th', label: 'Thai (ไทย)' },
                  { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
                  { value: 'ja', label: 'Japanese (日本語)' },
                  { value: 'ko', label: 'Korean (한국어)' },
                  { value: 'fr', label: 'French (Français)' },
                  { value: 'es', label: 'Spanish (Español)' },
                ]}
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
              />
            </div>

            {provider === 'gemini' && (
              <Select
                label="Gemini Model"
                options={[
                  { value: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite (Recommended - High Quota)' },
                  { value: 'gemini-3.5-flash', label: '3.5 Flash (Flagship Speed & Precision)' },
                  { value: 'gemini-3.6-flash', label: '3.6 Flash (Multimodal Audio)' },
                  { value: 'gemini-3.7-flash', label: '3.7 Flash (Reasoning & Complex Scenes)' },
                  { value: 'gemini-3.8-flash', label: '3.8 Flash (Next-Gen Flagship)' },
                ]}
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
              />
            )}

            {isLocalProvider && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {provider === 'sensevoice' ? 'SenseVoice-Small' : 'Paraformer-zh'} Local Engine Active
                    </span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                    Offline • 0 Quota
                  </span>
                </div>
                <p className="text-[10px] text-emerald-200/70 leading-tight">
                  {provider === 'sensevoice'
                    ? 'ដំណើរការក្នុងកុំព្យូទ័រផ្ទាល់ជាមួយ FunASR (គាំទ្រ zh, en, yue, ja, ko) មិនចាំបាច់មានអ៊ីនធឺណិត ឬ API Key ឡើយ។'
                    : 'ម៉ូដែលបំប្លែងសំឡេងចិនកម្រិតខ្ពស់ រួមបញ្ចូលប្រព័ន្ធ VAD និងសញ្ញាវណ្ណយុត្តិស្វ័យប្រវត្តិ។'}
                </p>
              </div>
            )}

            {!isKeyConfigured && !isLocalProvider && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <Key className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span className="truncate">API Key required</span>
                </div>
                <button
                  type="button"
                  onClick={provider === 'gemini' ? openGeminiPoolModal : openModal}
                  className="text-blue-400 hover:underline font-semibold"
                >
                  Configure
                </button>
              </div>
            )}
          </div>
        )}

        {/* Transcribe Button */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleStartTranscription}
          isLoading={isTranscribing}
          disabled={!currentProject || mediaAssets.length === 0}
          className="w-full shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1" />
          <span>
            {segments.length > 0 ? 'Re-Transcribe Video Speech' : 'Transcribe Video Speech'}
          </span>
        </Button>
      </div>

      {/* Filter / Search Bar (when segments exist) */}
      {segments.length > 0 && (
        <div className="px-2.5 py-1.5 border-b border-studio-border bg-studio-surface/50 flex items-center gap-2 shrink-0">
          <div className="relative flex-1 flex items-center">
            <Search className="w-3 h-3 text-studio-muted absolute left-2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-studio-panel border border-studio-border/70 rounded-lg pl-7 pr-2 py-1 text-[11px] text-studio-text placeholder:text-studio-muted focus:outline-none focus:border-studio-accent"
            />
          </div>

          {distinctSpeakers.length > 1 && (
            <select
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
              className="bg-studio-panel border border-studio-border/70 rounded-lg px-2 py-1 text-[11px] text-studio-text focus:outline-none focus:border-studio-accent cursor-pointer shrink-0"
            >
              <option value="all">All Speakers</option>
              {distinctSpeakers.map((sp) => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Segments List */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-studio-muted text-xs">
            <Mic className="w-8 h-8 mb-2 opacity-40 text-studio-accent" />
            <span className="font-semibold text-studio-text">No transcript segments yet</span>
            <span className="text-[11px] mt-1 max-w-[240px]">
              Click <strong>"Transcribe Video Speech"</strong> above to extract dialogue with timestamps.
            </span>
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-studio-muted text-xs">
            <Search className="w-6 h-6 mb-1.5 opacity-40" />
            <span>No segments matching "{searchQuery}"</span>
          </div>
        ) : (
          filteredSegments.map((seg, idx) => {
            const isSelected = selectedSegmentId === seg.id;
            const durationSec = ((seg.endMs - seg.startMs) / 1000).toFixed(1);

            return (
              <div
                key={seg.id}
                onClick={() => {
                  setSelectedSegmentId(seg.id);
                  setCurrentTimeMs(seg.startMs);
                }}
                className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-studio-surface border-studio-accent shadow-sm ring-1 ring-studio-accent'
                    : 'bg-studio-subbg/90 border-studio-border/80 hover:border-studio-hover'
                }`}
              >
                {/* Segment Meta */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 font-mono text-studio-muted">
                    <span className="text-[10px] text-studio-muted/70 font-semibold">#{idx + 1}</span>
                    <span className="text-studio-text font-medium">{formatTimestamp(seg.startMs)}</span>
                    <span>→</span>
                    <span>{formatTimestamp(seg.endMs)}</span>
                    <span className="text-zinc-500 text-[10px]">({durationSec}s)</span>
                  </div>

                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-studio-panel text-studio-accent border border-studio-accent/30 font-medium">
                    {seg.speakerId}
                  </span>
                </div>

                {/* Editable Transcript Text */}
                <textarea
                  value={seg.text}
                  onChange={(e) => updateSegmentText(seg.id, e.target.value)}
                  rows={2}
                  className="w-full bg-studio-surface/40 hover:bg-studio-surface/70 border border-transparent focus:border-studio-accent/60 rounded-lg p-1.5 text-xs text-studio-text focus:outline-none resize-none leading-relaxed transition-colors"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
