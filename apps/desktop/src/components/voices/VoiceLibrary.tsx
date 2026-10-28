import React, { useEffect, useState } from 'react';
import { Volume2, Play, Loader2, User, Mic } from 'lucide-react';
import type { VoiceProfile } from '@dubstudio/shared-types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/services/api';

export const VoiceLibrary: React.FC = () => {
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [selectedLocale, setSelectedLocale] = useState('all');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadVoices();
  }, [selectedLocale]);

  const loadVoices = async () => {
    setIsLoading(true);
    try {
      const locale = selectedLocale === 'all' ? undefined : selectedLocale;
      const list = await api.listVoices(locale);
      setVoices(list);
    } catch (e) {
      console.error('Failed to load voices:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewVoice = async (voice: VoiceProfile) => {
    if (currentAudio) {
      currentAudio.pause();
    }
    setPlayingVoiceId(voice.id);
    try {
      const previewText = voice.locale.toLowerCase().startsWith('km')
        ? 'សួស្តី! នេះគឺជាការសាកល្បងសំឡេងរបស់ DubStudio AI។'
        : 'Hello! This is a preview of the selected voice for DubStudio AI.';

      const audioUrl = await api.previewVoice(voice.id, previewText);
      const audio = new Audio(audioUrl);
      setCurrentAudio(audio);
      audio.onended = () => setPlayingVoiceId(null);
      audio.play().catch((err) => {
        if (err.name !== 'AbortError') console.warn('Preview play error:', err);
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        alert(`Voice preview failed: ${e.message}`);
      }
      setPlayingVoiceId(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden">
      {/* Locale filter */}
      <Select
        label="Filter by Language / Region"
        options={[
          { value: 'all', label: 'All Natural Voices' },
          { value: 'km', label: 'Khmer (km-KH)' },
          { value: 'en', label: 'English (en-US, en-GB)' },
          { value: 'vi', label: 'Vietnamese (vi-VN)' },
          { value: 'zh', label: 'Chinese (zh-CN)' },
          { value: 'ja', label: 'Japanese (ja-JP)' },
          { value: 'fr', label: 'French (fr-FR)' },
          { value: 'es', label: 'Spanish (es-ES)' },
        ]}
        value={selectedLocale}
        onChange={(e) => setSelectedLocale(e.target.value)}
      />

      {/* Voice List */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-studio-muted">
            <Loader2 className="w-6 h-6 animate-spin text-studio-accent" />
          </div>
        ) : voices.length === 0 ? (
          <div className="text-xs text-studio-muted text-center py-12">No voices found for this filter.</div>
        ) : (
          voices.map((v) => {
            const isPlaying = playingVoiceId === v.id;
            return (
              <div
                key={v.id}
                className="p-2.5 rounded bg-studio-subbg border border-studio-border flex items-center justify-between hover:border-studio-accent/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-studio-surface border border-studio-border flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-studio-muted" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-studio-text truncate">{v.name}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-studio-muted mt-0.5">
                      <span className="font-mono">{v.locale}</span>
                      <span>•</span>
                      <span className={v.gender === 'Female' ? 'text-pink-400' : 'text-blue-400'}>{v.gender}</span>
                    </div>
                  </div>
                </div>

                <Button
                  variant={isPlaying ? 'primary' : 'secondary'}
                  size="icon"
                  onClick={() => handlePreviewVoice(v)}
                  title="Audition Voice"
                  className="shrink-0"
                >
                  {isPlaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
