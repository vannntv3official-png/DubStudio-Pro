import React, { useState, useEffect } from 'react';
import { Mic, Sparkles, Split, Combine, Check, Play, Volume2, Key, AlertCircle, Layers } from 'lucide-react';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/services/api';

export const TranscriptEditor: React.FC = () => {
  const { currentProject, mediaAssets, setActiveJob } = useProjectStore();
  const { segments, selectedSegmentId, setSelectedSegmentId, updateSegmentText, splitSegment } = useTranscriptStore();
  const { setCurrentTimeMs } = usePlayerStore();
  const { settings, openModal, openGeminiPoolModal } = useSettingsStore();

  const [provider, setProvider] = useState<'gemini' | 'codecraft'>('gemini');
  const [geminiModel, setGeminiModel] = useState<string>(
    settings.aiProviders.geminiModel || 'gemini-3.5-flash'
  );
  const [sourceLang, setSourceLang] = useState('en');
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    if (settings.aiProviders.geminiModel) {
      setGeminiModel(settings.aiProviders.geminiModel);
    }
  }, [settings.aiProviders.geminiModel]);

  const geminiPoolKeys = settings.aiProviders.geminiApiKeys || [];
  const primaryGeminiKey = geminiPoolKeys.length > 0 ? geminiPoolKeys[0] : settings.aiProviders.geminiApiKey;
  const rawKey = provider === 'gemini' ? primaryGeminiKey : settings.aiProviders.codecraftApiKey;
  const isKeyConfigured = Boolean(
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

    const chosenModel = provider === 'gemini' ? geminiModel : settings.aiProviders.codecraftModel;

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
    const msRemainder = Math.floor(ms % 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${msRemainder.toString().padStart(3, '0')}`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Control Header */}
      <div className="p-3 border-b border-studio-border bg-studio-panel flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="AI Provider"
            options={[
              { value: 'gemini', label: 'Google Gemini' },
              { value: 'codecraft', label: 'Codecraft API' },
            ]}
            value={provider}
            onChange={(e) => setProvider(e.target.value as any)}
          />
          <Select
            label="Spoken Language"
            options={[
              { value: 'en', label: 'English' },
              { value: 'km', label: 'Khmer (ខ្មែរ)' },
              { value: 'th', label: 'Thai (ไทย)' },
              { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
              { value: 'zh', label: 'Chinese (中文)' },
              { value: 'ja', label: 'Japanese (日本語)' },
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
              { value: 'gemini-3.5-flash', label: 'gemini-3.5-flash (Recommended - Fast & Accurate)' },
              { value: 'gemini-3.6-flash', label: 'gemini-3.6-flash (Balanced Performance)' },
              { value: 'gemini-3.7-flash', label: 'gemini-3.7-flash (Advanced Reasoning)' },
              { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Next-Gen Flagship Flash)' },
            ]}
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
          />
        )}

        {!isKeyConfigured && (
          <div className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <Key className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="truncate">
                {provider === 'gemini' ? 'Gemini API key not configured' : 'Codecraft API key not configured'}
              </span>
            </div>
            <button
              type="button"
              onClick={provider === 'gemini' ? openGeminiPoolModal : openModal}
              className="text-xs text-blue-400 hover:text-blue-300 underline font-medium shrink-0 ml-2"
            >
              Configure Key
            </button>
          </div>
        )}

        {provider === 'gemini' && isKeyConfigured && (
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px]">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <Layers className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              <span className="truncate">
                Pool Active: <strong>{geminiPoolKeys.length} API key{geminiPoolKeys.length !== 1 ? 's' : ''}</strong> (Auto-failover)
              </span>
            </div>
            <button
              type="button"
              onClick={openGeminiPoolModal}
              className="text-[10px] text-indigo-400 hover:text-indigo-200 underline font-semibold shrink-0 ml-2"
            >
              Manage Pool
            </button>
          </div>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={handleStartTranscription}
          isLoading={isTranscribing}
          disabled={!currentProject || mediaAssets.length === 0}
          className="w-full"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isKeyConfigured ? 'Transcribe Video Speech' : 'Configure API Key to Transcribe'}</span>
        </Button>
      </div>

      {/* Segments List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-studio-muted">
          <span>Dialogue Segments ({segments.length})</span>
        </div>

        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-studio-muted text-xs">
            <Mic className="w-8 h-8 mb-2 opacity-50" />
            <span>No transcripts generated yet.</span>
            <span className="text-[11px] mt-1">Import a video and click "Transcribe Video Speech" to begin.</span>
          </div>
        ) : (
          segments.map((seg) => {
            const isSelected = selectedSegmentId === seg.id;
            return (
              <div
                key={seg.id}
                onClick={() => {
                  setSelectedSegmentId(seg.id);
                  setCurrentTimeMs(seg.startMs);
                }}
                className={`p-2.5 rounded border flex flex-col gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-studio-surface border-studio-accent shadow-sm ring-1 ring-studio-accent'
                    : 'bg-studio-subbg border-studio-border hover:border-studio-hover'
                }`}
              >
                {/* Segment Meta */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 font-mono text-studio-muted">
                    <span>{formatTimestamp(seg.startMs)}</span>
                    <span>→</span>
                    <span>{formatTimestamp(seg.endMs)}</span>
                    <span className="text-zinc-500">({((seg.endMs - seg.startMs) / 1000).toFixed(1)}s)</span>
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
                  className="w-full bg-transparent text-xs text-studio-text focus:outline-none resize-none leading-relaxed"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
