import React, { useState, useEffect, useRef } from 'react';
import {
  Languages,
  Sparkles,
  CheckCircle,
  Edit3,
  Volume2,
  Key,
  AlertCircle,
  Layers,
  Play,
  Square,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Filter,
  AlertTriangle,
  FileText,
  Mic,
  Clock,
} from 'lucide-react';
import { useTranslationStore } from '@/stores/translationStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/services/api';
import type { VoiceProfile, ReviewStatus } from '@dubstudio/shared-types';

export const TranslationEditor: React.FC = () => {
  const { currentProject, setActiveJob } = useProjectStore();
  const { segments } = useTranscriptStore();
  const { settings, openModal, openGeminiPoolModal } = useSettingsStore();
  const {
    translations,
    generatedAudios,
    loadGeneratedAudios,
    loadTranslations,
    selectedTranslationId,
    setSelectedTranslationId,
    targetLanguage,
    setTargetLanguage,
    provider,
    setProvider,
    updateTranslationFields,
    toggleApproval,
  } = useTranslationStore();
  const { setCurrentTimeMs } = usePlayerStore();

  const [isTranslating, setIsTranslating] = useState(false);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [geminiModel, setGeminiModel] = useState(settings.aiProviders.geminiModel || 'gemini-3.5-flash');
  const [codecraftModel, setCodecraftModel] = useState(settings.aiProviders.codecraftModel || 'claude-3-5-sonnet');

  // Filter tab state
  const [filterTab, setFilterTab] = useState<'all' | 'needs_review' | 'approved' | 'stale'>('all');
  const [expandedFields, setExpandedFields] = useState<Record<string, 'spoken' | 'translation' | 'pronunciation'>>({});

  // TTS & Timing Settings
  const [showDubbingSettings, setShowDubbingSettings] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('km-KH-PisethNeural');
  const [selectedSyncMode, setSelectedSyncMode] = useState<'balanced' | 'natural' | 'strict'>('balanced');
  const [selectedRate, setSelectedRate] = useState('+0%');
  const [selectedPitch, setSelectedPitch] = useState('+0Hz');
  const [selectedVolume, setSelectedVolume] = useState('+0%');
  const [availableVoices, setAvailableVoices] = useState<VoiceProfile[]>([]);
  const [playingSegId, setPlayingSegId] = useState<string | null>(null);
  const [regeneratingSegId, setRegeneratingSegId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync models with settings
  useEffect(() => {
    if (settings.aiProviders.geminiModel) {
      setGeminiModel(settings.aiProviders.geminiModel);
    }
    if (settings.aiProviders.codecraftModel) {
      setCodecraftModel(settings.aiProviders.codecraftModel);
    }
  }, [settings.aiProviders.geminiModel, settings.aiProviders.codecraftModel]);

  // Load voices list & generated audios
  useEffect(() => {
    api.listVoices().then((list) => {
      setAvailableVoices(list);
      if (targetLanguage === 'km') {
        setSelectedVoice('km-KH-PisethNeural');
      } else {
        const match = list.find((v) => v.locale.toLowerCase().startsWith(targetLanguage.toLowerCase()));
        if (match) setSelectedVoice(match.id);
      }
    }).catch(console.error);

    if (currentProject) {
      loadGeneratedAudios(currentProject.id);
    }
  }, [currentProject?.id, targetLanguage]);

  // Cleanup playing audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const geminiPoolKeys = settings.aiProviders.geminiApiKeys || [];
  const primaryGeminiKey = geminiPoolKeys.length > 0 ? geminiPoolKeys[0] : settings.aiProviders.geminiApiKey;
  const rawKey = provider === 'gemini' ? primaryGeminiKey : settings.aiProviders.codecraftApiKey;
  const isKeyConfigured = Boolean(
    rawKey?.trim() &&
    !['dummy_test_key', 'your_api_key_here', 'aizasy...', 'placeholder'].includes(rawKey.trim().toLowerCase())
  );

  const handleStartTranslation = async () => {
    if (!currentProject) {
      alert('Please create or open a project first.');
      return;
    }
    if (!isKeyConfigured) {
      openModal();
      return;
    }
    const chosenModel = provider === 'gemini' ? geminiModel : codecraftModel;
    setIsTranslating(true);
    try {
      const job = await api.startTranslation(
        currentProject.id,
        provider,
        chosenModel,
        currentProject.sourceLanguage || 'en',
        targetLanguage
      );
      setActiveJob(job);
    } catch (e: any) {
      alert(`Translation error: ${e.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenerateAllSpeech = async () => {
    if (!currentProject) return;
    setIsGeneratingTTS(true);
    try {
      const job = await api.startSpeechGeneration(
        currentProject.id,
        selectedVoice,
        selectedRate,
        selectedPitch,
        selectedVolume,
        undefined,
        selectedSyncMode
      );
      setActiveJob(job);
    } catch (e: any) {
      alert(`TTS error: ${e.message}`);
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  const handleRegenerateSingle = async (segmentId: string) => {
    if (!currentProject) return;
    setRegeneratingSegId(segmentId);
    try {
      await api.regenerateSingleSegment(
        currentProject.id,
        segmentId,
        selectedVoice,
        selectedRate,
        selectedPitch,
        selectedVolume,
        selectedSyncMode
      );
      await loadGeneratedAudios(currentProject.id);
      await loadTranslations(currentProject.id);
    } catch (e: any) {
      alert(`Single segment Dubbing error: ${e.message}`);
    } finally {
      setRegeneratingSegId(null);
    }
  };

  const handleTogglePlayAudio = (segId: string, audioPath?: string, startMs?: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (playingSegId === segId) {
        setPlayingSegId(null);
        return;
      }
    }

    if (!audioPath) return;

    if (startMs !== undefined) {
      setCurrentTimeMs(startMs);
    }

    const isElectron = typeof window !== 'undefined' && Boolean((window as any).dubstudio);
    const streamUrl = isElectron
      ? `media://local/${encodeURIComponent(audioPath.replace(/\\/g, '/'))}`
      : api.getMediaStreamUrl(audioPath);
    const audio = new Audio(streamUrl);
    audioRef.current = audio;
    setPlayingSegId(segId);

    audio.onended = () => {
      setPlayingSegId(null);
    };
    audio.onerror = () => {
      setPlayingSegId(null);
    };

    audio.play().catch((err) => {
      console.warn('Playback error:', err);
      setPlayingSegId(null);
    });
  };

  // Review status & counts
  const needsReviewCount = translations.filter(
    (t) => t.approvalStatus === 'needs_review' || (t.reviewReasons && t.reviewReasons.length > 0 && t.approvalStatus !== 'approved')
  ).length;

  const approvedCount = translations.filter((t) => t.approvalStatus === 'approved').length;

  const staleCount = translations.filter((t) => {
    const gen = generatedAudios.find((g) => g.segmentId === t.segmentId);
    return Boolean(gen?.stale);
  }).length;

  const filteredTranslations = translations.filter((tr) => {
    if (filterTab === 'needs_review') {
      return tr.approvalStatus === 'needs_review' || (tr.reviewReasons && tr.reviewReasons.length > 0 && tr.approvalStatus !== 'approved');
    }
    if (filterTab === 'approved') {
      return tr.approvalStatus === 'approved';
    }
    if (filterTab === 'stale') {
      const gen = generatedAudios.find((g) => g.segmentId === tr.segmentId);
      return Boolean(gen?.stale);
    }
    return true;
  });

  const dubbedCount = translations.filter((tr) =>
    generatedAudios.some((g) => g.segmentId === tr.segmentId)
  ).length;

  const getReasonLabel = (reason: string): string => {
    if (reason === 'timing_overrun') return 'លើសពេលកំណត់ (Timing Overrun)';
    if (reason === 'timing_underrun') return 'ខ្លីជាងពេលកំណត់ (Timing Underrun)';
    if (reason === 'potential_negation_flip_missing') return 'ផ្ទៀងផ្ទាត់បដិសេធ (Check Negation)';
    if (reason.startsWith('quantity_check')) return 'ពិនិត្យចំនួនលេខ (Check Quantity)';
    if (reason.startsWith('glossary_deviation')) return 'ពាក្យបច្ចេកទេស (Glossary)';
    if (reason.startsWith('unresolved_foreign_words')) return 'ពាក្យបរទេស (Foreign Words)';
    if (reason === 'ambiguous_number_or_date') return 'លេខមិនច្បាស់ (Ambiguous Number)';
    return reason;
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
              { value: 'codecraft', label: 'Codecraft AI' },
            ]}
            value={provider}
            onChange={(e) => setProvider(e.target.value as any)}
          />
          <Select
            label="Target Language"
            options={[
              { value: 'km', label: 'Khmer (ខ្មែរ)' },
              { value: 'en', label: 'English (EN)' },
              { value: 'th', label: 'Thai (ไทย)' },
              { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
              { value: 'zh', label: 'Chinese (中文)' },
              { value: 'ja', label: 'Japanese (日本語)' },
              { value: 'fr', label: 'French (Français)' },
              { value: 'es', label: 'Spanish (Español)' },
            ]}
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
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

        {provider === 'codecraft' && (
          <Select
            label="Codecraft Model"
            options={[
              { value: 'deepseek-chat', label: 'deepseek-chat' },
              { value: 'claude-3-5-sonnet', label: 'claude-3-5-sonnet' },
              { value: 'gpt-4o', label: 'gpt-4o' },
              { value: 'qwen-2.5-72b', label: 'qwen-2.5-72b' },
            ]}
            value={codecraftModel}
            onChange={(e) => setCodecraftModel(e.target.value)}
          />
        )}

        {targetLanguage === 'km' && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-khmer">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="leading-tight">
              <strong>Khmer Localization & Dubbing Engine សកម្ម</strong>៖ បកប្រែសម្របសម្រួលបែបសន្ទនារស់រវើក, ស៊ីចង្វាក់ដង្ហើម, និងមានប្រព័ន្ធត្រួតពិនិត្យគុណភាព (Human Review Workflow)។
            </span>
          </div>
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

        {/* Voice Timing & TTS Settings Collapsible */}
        <div className="rounded-lg border border-studio-border/70 bg-studio-surface/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDubbingSettings(!showDubbingSettings)}
            className="w-full px-2.5 py-1.5 flex items-center justify-between text-[11px] font-medium text-studio-muted hover:text-studio-text transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-studio-accent" />
              <span>Voice Timing & Review Settings</span>
              <span className="text-[10px] bg-studio-accent/20 text-studio-accent px-1.5 py-0.2 rounded font-mono">
                {selectedSyncMode}
              </span>
            </div>
            {showDubbingSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDubbingSettings && (
            <div className="p-2.5 border-t border-studio-border/50 flex flex-col gap-2 bg-studio-surface/90">
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="Default Voice"
                  options={
                    availableVoices.length > 0
                      ? availableVoices.map((v) => ({
                          value: v.id,
                          label: `${v.name} (${v.gender})`,
                        }))
                      : [
                          { value: 'km-KH-PisethNeural', label: 'Piseth (Khmer Male)' },
                          { value: 'km-KH-SreymomNeural', label: 'Sreymom (Khmer Female)' },
                          { value: 'en-US-JennyNeural', label: 'Jenny (English Female)' },
                          { value: 'en-US-GuyNeural', label: 'Guy (English Male)' },
                        ]
                  }
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                />
                <Select
                  label="Sync Mode"
                  options={[
                    { value: 'balanced', label: 'Balanced (Max +500ms, Tempo 1.12x)' },
                    { value: 'natural', label: 'Natural (Max +1000ms, Tempo 1.08x)' },
                    { value: 'strict', label: 'Strict (No pause borrow, Tempo 1.18x)' },
                  ]}
                  value={selectedSyncMode}
                  onChange={(e) => setSelectedSyncMode(e.target.value as any)}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Select
                  label="Speech Rate"
                  options={[
                    { value: '-10%', label: '-10% (Slower)' },
                    { value: '-5%', label: '-5%' },
                    { value: '+0%', label: '+0% (Normal)' },
                    { value: '+5%', label: '+5%' },
                    { value: '+10%', label: '+10% (Brisk)' },
                  ]}
                  value={selectedRate}
                  onChange={(e) => setSelectedRate(e.target.value)}
                />
                <Select
                  label="Pitch"
                  options={[
                    { value: '-10Hz', label: '-10Hz (Deep)' },
                    { value: '-5Hz', label: '-5Hz' },
                    { value: '+0Hz', label: '+0Hz (Normal)' },
                    { value: '+5Hz', label: '+5Hz' },
                    { value: '+10Hz', label: '+10Hz (High)' },
                  ]}
                  value={selectedPitch}
                  onChange={(e) => setSelectedPitch(e.target.value)}
                />
                <Select
                  label="Gain Boost"
                  options={[
                    { value: '+0%', label: '+0% (Default)' },
                    { value: '+10%', label: '+10%' },
                    { value: '+20%', label: '+20% (Loud)' },
                  ]}
                  value={selectedVolume}
                  onChange={(e) => setSelectedVolume(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartTranslation}
            isLoading={isTranslating}
            disabled={!currentProject || segments.length === 0}
            className="flex-1"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{isKeyConfigured ? 'Translate & Adapt Dialogue' : 'Configure Key to Translate'}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateAllSpeech}
            isLoading={isGeneratingTTS}
            disabled={!currentProject || translations.length === 0}
            title="Synthesize and align speech for all segments"
          >
            <Volume2 className="w-3.5 h-3.5 text-studio-accent" />
            <span>Generate Dubbing</span>
          </Button>
        </div>
      </div>

      {/* Review Filter Tabs */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-studio-border bg-studio-surface/60 text-xs">
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
            filterTab === 'all'
              ? 'bg-studio-accent text-white shadow-sm'
              : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
          }`}
        >
          <span>All ({translations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('needs_review')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
            filterTab === 'needs_review'
              ? 'bg-amber-500 text-black font-semibold shadow-sm'
              : needsReviewCount > 0
              ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20'
              : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          <span>Needs Review ({needsReviewCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('approved')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
            filterTab === 'approved'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
          }`}
        >
          <CheckCircle className="w-3 h-3" />
          <span>Approved ({approvedCount})</span>
        </button>

        {staleCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterTab('stale')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
              filterTab === 'stale'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20'
            }`}
          >
            <span>Stale ({staleCount})</span>
          </button>
        )}
      </div>

      {/* Translations List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {filteredTranslations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-studio-muted text-xs">
            <Languages className="w-8 h-8 mb-2 opacity-50" />
            <span>No translations found for this filter.</span>
            <span className="text-[11px] mt-1">
              {filterTab === 'needs_review' ? 'All dialogue lines are approved or verified!' : 'Translate dialogue to see items here.'}
            </span>
          </div>
        ) : (
          filteredTranslations.map((tr) => {
            const isSelected = selectedTranslationId === tr.id;
            const tSeg = segments.find((s) => s.id === tr.segmentId);
            const genAudio = generatedAudios.find((g) => g.segmentId === tr.segmentId);
            const isPlaying = playingSegId === tr.segmentId;
            const isRegenerating = regeneratingSegId === tr.segmentId;

            const isApproved = tr.approvalStatus === 'approved';
            const isNeedsReview = tr.approvalStatus === 'needs_review' || (tr.reviewReasons && tr.reviewReasons.length > 0 && !isApproved);
            const isStale = Boolean(genAudio?.stale);

            const origDurSec = tSeg ? ((tSeg.endMs - tSeg.startMs) / 1000).toFixed(1) : null;
            const dubbedDurSec = genAudio ? (genAudio.alignedDurationMs / 1000).toFixed(1) : null;

            const currentField = expandedFields[tr.id] || 'spoken';

            return (
              <div
                key={tr.id}
                onClick={() => {
                  setSelectedTranslationId(tr.id);
                  if (tSeg) {
                    setCurrentTimeMs(tSeg.startMs);
                  }
                }}
                className={`p-3 rounded-lg border flex flex-col gap-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-studio-surface border-studio-accent shadow-sm ring-1 ring-studio-accent'
                    : 'bg-studio-subbg border-studio-border hover:border-studio-hover'
                }`}
              >
                {/* Header: Timestamp, Speaker, Review Badge & Voice Controls */}
                <div className="flex items-center justify-between text-[11px] border-b border-studio-border/40 pb-2">
                  <div className="flex items-center gap-2 text-studio-muted">
                    {tSeg && (
                      <span className="font-mono bg-studio-panel px-1.5 py-0.5 rounded border border-studio-border/50 text-[10px]">
                        {Math.floor(tSeg.startMs / 1000)}s - {Math.floor(tSeg.endMs / 1000)}s ({origDurSec}s)
                      </span>
                    )}
                    {tSeg?.speakerId && (
                      <span className="text-studio-text font-medium bg-studio-accent/10 text-studio-accent px-1.5 py-0.5 rounded border border-studio-accent/20 text-[10px]">
                        {tSeg.speakerId}
                      </span>
                    )}
                    {tr.formOfAddress && (
                      <span className="text-[10px] text-studio-muted italic font-khmer">
                        ({tr.formOfAddress})
                      </span>
                    )}
                  </div>

                  {/* Badges & Actions */}
                  <div className="flex items-center gap-1.5">
                    {/* Status Badge */}
                    {isApproved ? (
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        Approved
                      </span>
                    ) : isNeedsReview ? (
                      <span className="text-[10px] font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                        Needs Review
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-studio-muted bg-studio-panel border border-studio-border/50 px-2 py-0.5 rounded-full">
                        Generated
                      </span>
                    )}

                    {isStale && (
                      <span className="text-[10px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                        Stale Take
                      </span>
                    )}

                    {/* Audition Voice Button */}
                    {genAudio && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePlayAudio(tr.segmentId, genAudio.alignedAudioPath, tSeg?.startMs);
                        }}
                        className={`p-1 rounded transition-colors ${
                          isPlaying
                            ? 'bg-amber-500 text-black hover:bg-amber-400'
                            : 'bg-studio-accent/20 text-studio-accent hover:bg-studio-accent hover:text-white'
                        }`}
                        title={isPlaying ? 'Stop Audio' : 'Audition Dubbed Speech Take'}
                      >
                        {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                      </button>
                    )}

                    {/* Regenerate Single Take Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRegenerateSingle(tr.segmentId);
                      }}
                      disabled={isRegenerating}
                      className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-surface transition-colors"
                      title="Regenerate speech take for this segment"
                    >
                      {isRegenerating ? (
                        <Loader2 className="w-3 h-3 animate-spin text-studio-accent" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                    </button>

                    {/* Approve Toggle Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (currentProject) {
                          toggleApproval(currentProject.id, tr.id);
                        }
                      }}
                      className={`p-1 rounded transition-colors ${
                        isApproved
                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                          : 'text-studio-muted hover:text-emerald-400 hover:bg-studio-panel'
                      }`}
                      title={isApproved ? 'Click to mark as Needs Review' : 'Click to Approve this segment'}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Review Reasons Banner if flagged */}
                {tr.reviewReasons && tr.reviewReasons.length > 0 && !isApproved && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-medium">ចំណុចត្រួតពិនិត្យ (Review Advisory):</span>
                    {tr.reviewReasons.map((r, i) => (
                      <span key={i} className="bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {getReasonLabel(r)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Source Original Text */}
                <div className="text-[11px] text-studio-muted italic border-l-2 border-studio-muted/30 pl-2">
                  "{tr.sourceText}"
                </div>

                {/* Representation Tabs: Spoken Script vs Translation vs Pronunciation */}
                <div className="flex flex-col gap-1.5 bg-studio-panel/40 p-2 rounded border border-studio-border/40">
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedFields({ ...expandedFields, [tr.id]: 'spoken' });
                        }}
                        className={`font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                          currentField === 'spoken'
                            ? 'bg-studio-accent text-white'
                            : 'text-studio-muted hover:text-studio-text'
                        }`}
                      >
                        Spoken Script (អត្ថបទនិយាយ)
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedFields({ ...expandedFields, [tr.id]: 'translation' });
                        }}
                        className={`font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                          currentField === 'translation'
                            ? 'bg-studio-accent text-white'
                            : 'text-studio-muted hover:text-studio-text'
                        }`}
                      >
                        Meaning Translation (បកប្រែ)
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedFields({ ...expandedFields, [tr.id]: 'pronunciation' });
                        }}
                        className={`font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                          currentField === 'pronunciation'
                            ? 'bg-studio-accent text-white'
                            : 'text-studio-muted hover:text-studio-text'
                        }`}
                      >
                        Pronunciation (សូរសព្ទ)
                      </button>
                    </div>

                    {genAudio && (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                        Dubbed: {dubbedDurSec}s {genAudio.speedFactor !== 1.0 && `(${genAudio.speedFactor}x)`}
                        {genAudio.takeNumber && genAudio.takeNumber > 1 && ` [Take ${genAudio.takeNumber}]`}
                      </span>
                    )}
                  </div>

                  {currentField === 'spoken' && (
                    <textarea
                      value={tr.spokenScript || tr.translatedText}
                      onChange={(e) => {
                        if (currentProject) {
                          updateTranslationFields(currentProject.id, tr.id, {
                            spokenScript: e.target.value,
                            isManuallyEdited: true,
                          });
                        }
                      }}
                      rows={2}
                      className="w-full bg-studio-surface/80 border border-studio-border/60 rounded p-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent font-khmer leading-relaxed"
                      placeholder="Spoken script for dubbing..."
                    />
                  )}

                  {currentField === 'translation' && (
                    <textarea
                      value={tr.translatedText}
                      onChange={(e) => {
                        if (currentProject) {
                          updateTranslationFields(currentProject.id, tr.id, {
                            translatedText: e.target.value,
                            isManuallyEdited: true,
                          });
                        }
                      }}
                      rows={2}
                      className="w-full bg-studio-surface/80 border border-studio-border/60 rounded p-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent font-khmer leading-relaxed"
                      placeholder="Meaning-preserving translation..."
                    />
                  )}

                  {currentField === 'pronunciation' && (
                    <textarea
                      value={tr.pronunciationText || tr.spokenScript || tr.translatedText}
                      onChange={(e) => {
                        if (currentProject) {
                          updateTranslationFields(currentProject.id, tr.id, {
                            pronunciationText: e.target.value,
                            isManuallyEdited: true,
                          });
                        }
                      }}
                      rows={2}
                      className="w-full bg-studio-surface/80 border border-studio-border/60 rounded p-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent font-khmer leading-relaxed font-mono"
                      placeholder="Phonetically prepared pronunciation for Edge-TTS..."
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
