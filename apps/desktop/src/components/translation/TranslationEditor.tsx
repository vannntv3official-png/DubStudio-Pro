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
  Clock,
  Sliders,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
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
    selectedTranslationId,
    setSelectedTranslationId,
    targetLanguage,
    setTargetLanguage,
    provider,
    setProvider,
    updateTranslationText,
  } = useTranslationStore();
  const { setCurrentTimeMs } = usePlayerStore();

  const [isTranslating, setIsTranslating] = useState(false);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [geminiModel, setGeminiModel] = useState(settings.aiProviders.geminiModel || 'gemini-2.5-flash');
  const [codecraftModel, setCodecraftModel] = useState(settings.aiProviders.codecraftModel || 'claude-3-5-sonnet');

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
      // Auto-pick voice matching target language
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
      const job = await api.startSpeechGeneration(
        currentProject.id,
        selectedVoice,
        selectedRate,
        selectedPitch,
        selectedVolume,
        [segmentId],
        selectedSyncMode
      );
      setActiveJob(job);
    } catch (e: any) {
      alert(`Single TTS error: ${e.message}`);
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

    const streamUrl = api.getMediaStreamUrl(audioPath);
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

  const dubbedCount = translations.filter((tr) =>
    generatedAudios.some((g) => g.segmentId === tr.segmentId)
  ).length;

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
              { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Recommended, Fast & Stable)' },
              { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro (High Reasoning)' },
              { value: 'gemini-flash-latest', label: 'gemini-flash-latest' },
              { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
              { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Preview)' },
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
              <strong>Khmer Voice-Over Pro សកម្ម</strong>៖ បកប្រែសម្របសម្រួលបែបសន្ទនារស់រវើក, ស៊ីចង្វាក់មាត់ (Lip-sync), និងមិនប្រើពាក្យរឹងស្តូក។
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
              <span>Voice Timing & TTS Settings</span>
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
                    { value: 'balanced', label: 'Balanced (Smart Pauses, No Cut-off)' },
                    { value: 'natural', label: 'Natural (1.0x Pace, Zero Rushing)' },
                    { value: 'strict', label: 'Strict (Clamped to Segment)' },
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
                    { value: '+15%', label: '+15% (Fast)' },
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
                    { value: '+30%', label: '+30% (Max)' },
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
            <span>{isKeyConfigured ? 'Translate Dialogue' : 'Configure Key to Translate'}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateAllSpeech}
            isLoading={isGeneratingTTS}
            disabled={!currentProject || translations.length === 0}
            title="Generate Edge TTS dubbed voice for all translated segments"
          >
            <Volume2 className="w-3.5 h-3.5 text-studio-accent" />
            <span>Generate Speech</span>
          </Button>
        </div>
      </div>

      {/* Translations List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs text-studio-muted">
          <div className="flex items-center gap-2">
            <span>Translated Dialogue ({translations.length})</span>
            {translations.length > 0 && (
              <span className="text-[10px] bg-studio-surface border border-studio-border px-2 py-0.5 rounded-full text-studio-muted">
                Dubbed: <strong className="text-studio-accent">{dubbedCount}</strong>/{translations.length}
              </span>
            )}
          </div>
        </div>

        {translations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-studio-muted text-xs">
            <Languages className="w-8 h-8 mb-2 opacity-50" />
            <span>No translations generated yet.</span>
            <span className="text-[11px] mt-1">Transcribe speech first, then translate into your target language.</span>
          </div>
        ) : (
          translations.map((tr) => {
            const isSelected = selectedTranslationId === tr.id;
            const tSeg = segments.find((s) => s.id === tr.segmentId);
            const genAudio = generatedAudios.find((g) => g.segmentId === tr.segmentId);
            const isPlaying = playingSegId === tr.segmentId;
            const isRegenerating = regeneratingSegId === tr.segmentId;

            const origDurSec = tSeg ? ((tSeg.endMs - tSeg.startMs) / 1000).toFixed(1) : null;
            const dubbedDurSec = genAudio ? (genAudio.alignedDurationMs / 1000).toFixed(1) : null;

            return (
              <div
                key={tr.id}
                onClick={() => {
                  setSelectedTranslationId(tr.id);
                  if (tSeg) {
                    setCurrentTimeMs(tSeg.startMs);
                  }
                }}
                className={`p-2.5 rounded border flex flex-col gap-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-studio-surface border-studio-accent shadow-sm ring-1 ring-studio-accent'
                    : 'bg-studio-subbg border-studio-border hover:border-studio-hover'
                }`}
              >
                {/* Header: Timestamp, Speaker, Timing Badges & Voice Controls */}
                <div className="flex items-center justify-between text-[10px] border-b border-studio-border/40 pb-1.5">
                  <div className="flex items-center gap-1.5 text-studio-muted">
                    {tSeg && (
                      <span className="font-mono bg-studio-panel px-1.5 py-0.5 rounded border border-studio-border/50 text-[10px]">
                        {Math.floor(tSeg.startMs / 1000)}s - {Math.floor(tSeg.endMs / 1000)}s
                      </span>
                    )}
                    {tSeg?.speakerId && (
                      <span className="text-studio-text font-medium bg-studio-accent/10 text-studio-accent px-1.5 py-0.5 rounded border border-studio-accent/20 text-[10px]">
                        {tSeg.speakerId}
                      </span>
                    )}
                  </div>

                  {/* Timing & Dubbed Audio Badges */}
                  <div className="flex items-center gap-1.5">
                    {genAudio ? (
                      <>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5" />
                          <span>{dubbedDurSec}s</span>
                          {genAudio.speedFactor !== 1.0 && (
                            <span className="text-[9px] text-emerald-300 opacity-80">({genAudio.speedFactor}x)</span>
                          )}
                        </span>

                        {/* Play Audition Voice Button */}
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
                          title={isPlaying ? 'Stop Audio' : 'Audition Dubbed Speech'}
                        >
                          {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                        </button>

                        {/* Regenerate Single Segment Voice Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegenerateSingle(tr.segmentId);
                          }}
                          disabled={isRegenerating}
                          className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-surface transition-colors"
                          title="Regenerate Dubbed Audio for this segment"
                        >
                          {isRegenerating ? (
                            <Loader2 className="w-3 h-3 animate-spin text-studio-accent" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRegenerateSingle(tr.segmentId);
                        }}
                        disabled={isRegenerating}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-studio-surface border border-studio-border text-studio-muted hover:text-studio-accent hover:border-studio-accent/40 transition-colors flex items-center gap-1"
                        title="Synthesize Dubbed Speech"
                      >
                        {isRegenerating ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Volume2 className="w-2.5 h-2.5" />
                        )}
                        <span>Dub</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Source Original Text */}
                <div className="text-[11px] text-studio-muted italic border-l-2 border-studio-muted/30 pl-2">
                  "{tr.sourceText}"
                </div>

                {/* Translated Text (Editable Khmer / Target Language) */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] text-studio-muted">
                    <span className="font-semibold text-studio-accent uppercase tracking-wider">{tr.targetLanguage} Translation:</span>
                    {tr.isManuallyEdited && (
                      <span className="flex items-center gap-1 text-studio-warning font-medium">
                        <Edit3 className="w-3 h-3" />
                        Edited
                      </span>
                    )}
                  </div>
                  <textarea
                    value={tr.translatedText}
                    onChange={(e) => {
                      if (currentProject) {
                        updateTranslationText(currentProject.id, tr.id, e.target.value);
                      }
                    }}
                    rows={2}
                    className="w-full bg-studio-panel/50 border border-studio-border/50 rounded p-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent font-khmer leading-relaxed"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
