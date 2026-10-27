import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Languages,
  Sparkles,
  CheckCircle,
  Volume2,
  Key,
  Layers,
  Play,
  Square,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  AlertTriangle,
  FileText,
  Search,
  CheckCheck,
} from 'lucide-react';
import { useTranslationStore } from '@/stores/translationStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/services/api';
import type { VoiceProfile } from '@dubstudio/shared-types';

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
    approveAll,
  } = useTranslationStore();
  const { setCurrentTimeMs } = usePlayerStore();

  const [isTranslating, setIsTranslating] = useState(false);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  const [geminiModel, setGeminiModel] = useState(
    settings.aiProviders.geminiModel || 'gemini-3.5-flash-lite'
  );
  const [codecraftModel, setCodecraftModel] = useState(
    settings.aiProviders.codecraftModel || 'deepseek-chat'
  );

  // Filter tab state
  const [filterTab, setFilterTab] = useState<'all' | 'needs_review' | 'approved' | 'stale'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFields, setExpandedFields] = useState<Record<string, 'spoken' | 'translation' | 'pronunciation'>>({});

  // Collapsible settings drawer
  const [showDubbingSettings, setShowDubbingSettings] = useState(false);

  // TTS Parameters
  const [selectedVoice, setSelectedVoice] = useState('km-KH-PisethNeural');
  const [selectedSyncMode, setSelectedSyncMode] = useState<'balanced' | 'natural' | 'strict'>('balanced');
  const [selectedRate, setSelectedRate] = useState('+0%');
  const [selectedPitch, setSelectedPitch] = useState('+0Hz');
  const [selectedVolume, setSelectedVolume] = useState('+0%');
  const [availableVoices, setAvailableVoices] = useState<VoiceProfile[]>([]);
  const [playingSegId, setPlayingSegId] = useState<string | null>(null);
  const [regeneratingSegId, setRegeneratingSegId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync models and default provider with settings
  useEffect(() => {
    if (settings.aiProviders.geminiModel) {
      setGeminiModel(settings.aiProviders.geminiModel);
    }
    if (settings.aiProviders.codecraftModel) {
      setCodecraftModel(settings.aiProviders.codecraftModel);
    }
    if (settings.aiProviders.defaultTranslationProvider === 'gemini' || settings.aiProviders.defaultTranslationProvider === 'codecraft') {
      setProvider(settings.aiProviders.defaultTranslationProvider);
    }
  }, [settings.aiProviders.geminiModel, settings.aiProviders.codecraftModel, settings.aiProviders.defaultTranslationProvider, setProvider]);

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
        currentProject.sourceLanguage || 'auto',
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

  const handleApproveAll = async () => {
    if (!currentProject || translations.length === 0) return;
    setIsApprovingAll(true);
    try {
      await approveAll(currentProject.id);
    } finally {
      setIsApprovingAll(false);
    }
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

  const filteredTranslations = useMemo(() => {
    return translations.filter((tr) => {
      if (filterTab === 'needs_review') {
        const isNR = tr.approvalStatus === 'needs_review' || (tr.reviewReasons && tr.reviewReasons.length > 0 && tr.approvalStatus !== 'approved');
        if (!isNR) return false;
      } else if (filterTab === 'approved') {
        if (tr.approvalStatus !== 'approved') return false;
      } else if (filterTab === 'stale') {
        const gen = generatedAudios.find((g) => g.segmentId === tr.segmentId);
        if (!gen?.stale) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          tr.sourceText.toLowerCase().includes(q) ||
          tr.translatedText.toLowerCase().includes(q) ||
          (tr.spokenScript && tr.spokenScript.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [translations, generatedAudios, filterTab, searchQuery]);

  const getReasonBadge = (reason: string) => {
    if (reason === 'timing_overrun' || reason === 'timing_overrun_risk') {
      return { text: '⚠️ លើសពេល (Overrun)', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    }
    if (reason === 'timing_underrun' || reason === 'timing_underrun_risk') {
      return { text: '⚠️ ខ្លីជាងពេល (Underrun)', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    }
    if (reason === 'potential_negation_flip_missing') {
      return { text: '⚠️ ពិនិត្យបដិសេធ (Negation)', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
    }
    if (reason.startsWith('quantity_check')) {
      return { text: '⚠️ ពិនិត្យចំនួនលេខ', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    }
    if (reason.startsWith('glossary_deviation')) {
      return { text: '⚠️ ពាក្យបច្ចេកទេស', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
    }
    if (reason.startsWith('preferred_address_check')) {
      return { text: '⚠️ សព្វនាម (Pronoun)', color: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
    }
    return { text: reason, color: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' };
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Compact Top Header */}
      <div className="p-2.5 border-b border-studio-border bg-studio-panel flex flex-col gap-2 shrink-0">
        {/* Status Pills & Settings Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 truncate max-w-[150px]">
              {provider === 'gemini' ? geminiModel.replace('gemini-', '') : 'Codecraft'}
            </span>

            {provider === 'gemini' && isKeyConfigured && (
              <button
                type="button"
                onClick={openGeminiPoolModal}
                className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1 shrink-0"
                title="Gemini Keys Pool Active"
              >
                <Layers className="w-2.5 h-2.5" />
                <span>{geminiPoolKeys.length} Keys</span>
              </button>
            )}

            <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-studio-surface text-studio-muted border border-studio-border truncate max-w-[100px]">
              {selectedVoice.replace('km-KH-', '').replace('Neural', '')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowDubbingSettings(!showDubbingSettings)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-studio-muted hover:text-studio-text hover:bg-studio-surface transition-colors shrink-0"
            title="Configure Dubbing & Timing Settings"
          >
            <Sliders className="w-3 h-3 text-studio-accent" />
            <span>Settings</span>
            {showDubbingSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Collapsible Dubbing & Timing Settings Drawer */}
        {showDubbingSettings && (
          <div className="p-2.5 rounded-xl bg-studio-surface/90 border border-studio-border/70 flex flex-col gap-2 animate-in fade-in duration-100">
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
                  { value: 'zh', label: 'Chinese (中文)' },
                  { value: 'th', label: 'Thai (ไทย)' },
                  { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
                  { value: 'ja', label: 'Japanese (日本語)' },
                ]}
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
              />
            </div>

            {provider === 'gemini' && (
              <Select
                label="Gemini Model"
                options={[
                  { value: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite (High Quota & Ultra Fast)' },
                  { value: 'gemini-3.5-flash', label: '3.5 Flash (Flagship Speed & Precision)' },
                  { value: 'gemini-3.6-flash', label: '3.6 Flash (Multimodal Audio)' },
                  { value: 'gemini-3.7-flash', label: '3.7 Flash (Reasoning & Complex Phrasing)' },
                  { value: 'gemini-3.8-flash', label: '3.8 Flash (Next-Gen Flagship Flash)' },
                ]}
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
              />
            )}

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
                  { value: '-10%', label: '-10%' },
                  { value: '-5%', label: '-5%' },
                  { value: '+0%', label: 'Normal' },
                  { value: '+5%', label: '+5%' },
                  { value: '+10%', label: '+10%' },
                ]}
                value={selectedRate}
                onChange={(e) => setSelectedRate(e.target.value)}
              />
              <Select
                label="Pitch"
                options={[
                  { value: '-5Hz', label: 'Deep' },
                  { value: '+0Hz', label: 'Normal' },
                  { value: '+5Hz', label: 'High' },
                ]}
                value={selectedPitch}
                onChange={(e) => setSelectedPitch(e.target.value)}
              />
              <Select
                label="Gain Boost"
                options={[
                  { value: '+0%', label: 'Default' },
                  { value: '+10%', label: '+10%' },
                  { value: '+20%', label: '+20%' },
                ]}
                value={selectedVolume}
                onChange={(e) => setSelectedVolume(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartTranslation}
            isLoading={isTranslating}
            disabled={!currentProject || segments.length === 0}
            className="w-full text-xs"
          >
            <Languages className="w-3.5 h-3.5 mr-1" />
            <span>{translations.length > 0 ? 'Re-Translate' : 'Translate & Adapt'}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateAllSpeech}
            isLoading={isGeneratingTTS}
            disabled={!currentProject || translations.length === 0}
            className="w-full text-xs"
            title="Generate and align dubbed audio for all dialogue lines"
          >
            <Volume2 className="w-3.5 h-3.5 mr-1 text-studio-accent" />
            <span>Generate Dubbing</span>
          </Button>
        </div>
      </div>

      {/* Review Filter Tabs & Approve All Header */}
      <div className="px-2.5 py-1.5 border-b border-studio-border bg-studio-surface/60 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
              filterTab === 'all'
                ? 'bg-studio-accent text-white shadow-xs'
                : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
            }`}
          >
            All ({translations.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('needs_review')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors flex items-center gap-1 ${
              filterTab === 'needs_review'
                ? 'bg-amber-500 text-black shadow-xs'
                : needsReviewCount > 0
                ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20'
                : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Review ({needsReviewCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('approved')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors flex items-center gap-1 ${
              filterTab === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
            }`}
          >
            <Check className="w-2.5 h-2.5" />
            <span>Approved ({approvedCount})</span>
          </button>

          {staleCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterTab('stale')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                filterTab === 'stale'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
              }`}
            >
              Stale ({staleCount})
            </button>
          )}
        </div>

        {/* Batch Approve All Button */}
        {needsReviewCount > 0 && (
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={isApprovingAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-colors shrink-0"
            title="Approve all dialogue translations"
          >
            <CheckCheck className="w-3 h-3" />
            <span>Approve All</span>
          </button>
        )}
      </div>

      {/* Translations List */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {filteredTranslations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-studio-muted text-xs">
            <Languages className="w-8 h-8 mb-2 opacity-40 text-studio-accent" />
            <span className="font-semibold text-studio-text">No translations found</span>
            <span className="text-[11px] mt-1 max-w-[240px]">
              {filterTab === 'needs_review'
                ? 'All dialogue lines are approved and ready!'
                : 'Import video, transcribe speech, then click "Translate & Adapt".'}
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
            const activeText = currentField === 'spoken' ? (tr.spokenScript || tr.translatedText) : currentField === 'translation' ? tr.translatedText : (tr.pronunciationText || tr.spokenScript || tr.translatedText);
            const charCount = activeText.replace(/\s+/g, '').length;
            const estSeconds = tSeg ? (charCount / 16).toFixed(1) : null;

            return (
              <div
                key={tr.id}
                onClick={() => {
                  setSelectedTranslationId(tr.id);
                  if (tSeg) {
                    setCurrentTimeMs(tSeg.startMs);
                  }
                }}
                className={`p-2.5 rounded-xl border flex flex-col gap-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-studio-surface border-studio-accent shadow-sm ring-1 ring-studio-accent'
                    : 'bg-studio-subbg/90 border-studio-border/80 hover:border-studio-hover'
                }`}
              >
                {/* Header: Timestamp, Speaker, Review Badge & Voice Controls */}
                <div className="flex items-center justify-between text-[11px] gap-1">
                  <div className="flex items-center gap-1.5 overflow-hidden text-studio-muted">
                    {tSeg && (
                      <span className="font-mono bg-studio-panel px-1.5 py-0.5 rounded border border-studio-border/50 text-[10px] text-studio-text">
                        {Math.floor(tSeg.startMs / 1000)}s - {Math.floor(tSeg.endMs / 1000)}s ({origDurSec}s)
                      </span>
                    )}
                    {tSeg?.speakerId && (
                      <span className="text-studio-accent font-medium bg-studio-accent/10 px-1.5 py-0.5 rounded border border-studio-accent/20 text-[10px]">
                        {tSeg.speakerId}
                      </span>
                    )}
                    {tr.formOfAddress && (
                      <span className="text-[10px] text-studio-muted italic font-khmer truncate max-w-[80px]">
                        ({tr.formOfAddress})
                      </span>
                    )}
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Audition Voice Button */}
                    {genAudio && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePlayAudio(tr.segmentId, genAudio.alignedAudioPath, tSeg?.startMs);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-colors ${
                          isPlaying
                            ? 'bg-amber-500 text-black font-bold'
                            : 'bg-studio-accent/20 text-studio-accent hover:bg-studio-accent hover:text-white'
                        }`}
                        title={isPlaying ? 'Stop Audio' : `Play Dubbed Speech (${dubbedDurSec}s)`}
                      >
                        {isPlaying ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                        <span>{dubbedDurSec}s</span>
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
                      title="Regenerate speech take"
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
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'text-studio-muted hover:text-emerald-400 hover:bg-studio-panel'
                      }`}
                      title={isApproved ? 'Click to mark Needs Review' : 'Click to Approve this translation'}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Review Advisory Badges (if flagged) */}
                {tr.reviewReasons && tr.reviewReasons.length > 0 && !isApproved && (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {tr.reviewReasons.map((r, i) => {
                      const badge = getReasonBadge(r);
                      return (
                        <span
                          key={i}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-khmer border ${badge.color}`}
                        >
                          {badge.text}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Source Original Text */}
                <div className="text-[11px] text-studio-muted italic border-l-2 border-studio-accent/40 pl-2 leading-relaxed">
                  "{tr.sourceText}"
                </div>

                {/* Representation Tabs: Spoken vs Meaning vs Pronunciation */}
                <div className="flex flex-col gap-1 bg-studio-panel/50 p-1.5 rounded-lg border border-studio-border/50">
                  <div className="flex items-center justify-between text-[10px] pb-1 border-b border-studio-border/30">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedFields({ ...expandedFields, [tr.id]: 'spoken' });
                        }}
                        className={`px-2 py-0.5 rounded transition-all font-khmer ${
                          currentField === 'spoken'
                            ? 'bg-studio-accent text-white font-bold shadow-xs'
                            : 'text-studio-muted hover:text-studio-text'
                        }`}
                      >
                        អត្ថបទនិយាយ (Spoken)
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedFields({ ...expandedFields, [tr.id]: 'translation' });
                        }}
                        className={`px-2 py-0.5 rounded transition-all font-khmer ${
                          currentField === 'translation'
                            ? 'bg-studio-accent text-white font-bold shadow-xs'
                            : 'text-studio-muted hover:text-studio-text'
                        }`}
                      >
                        បកប្រែ (Meaning)
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedFields({ ...expandedFields, [tr.id]: 'pronunciation' });
                        }}
                        className={`px-2 py-0.5 rounded transition-all font-khmer ${
                          currentField === 'pronunciation'
                            ? 'bg-studio-accent text-white font-bold shadow-xs'
                            : 'text-studio-muted hover:text-studio-text'
                        }`}
                      >
                        សូរសព្ទ (Phonetic)
                      </button>
                    </div>

                    {origDurSec && (
                      <span className="text-[10px] font-mono text-studio-muted">
                        ~{charCount}c ≈ {estSeconds}s / {origDurSec}s
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
                      className="w-full bg-studio-surface/60 hover:bg-studio-surface/90 border border-transparent focus:border-studio-accent/70 rounded p-1.5 text-xs text-studio-text focus:outline-none font-khmer leading-relaxed transition-colors"
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
                      className="w-full bg-studio-surface/60 hover:bg-studio-surface/90 border border-transparent focus:border-studio-accent/70 rounded p-1.5 text-xs text-studio-text focus:outline-none font-khmer leading-relaxed transition-colors"
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
                      className="w-full bg-studio-surface/60 hover:bg-studio-surface/90 border border-transparent focus:border-studio-accent/70 rounded p-1.5 text-xs text-studio-text focus:outline-none font-khmer leading-relaxed font-mono transition-colors"
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
