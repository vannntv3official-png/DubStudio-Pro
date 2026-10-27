import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Key, X, ExternalLink } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';

export const JobStatusToast: React.FC = () => {
  const { activeJob, setActiveJob } = useProjectStore();
  const { openModal } = useSettingsStore();

  // Auto-dismiss completed jobs after 5 seconds
  useEffect(() => {
    if (activeJob && activeJob.status === 'completed') {
      const timer = setTimeout(() => {
        setActiveJob(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeJob?.status, activeJob?.id]);

  if (!activeJob) return null;

  const handleCancel = async () => {
    if (!activeJob) return;
    try {
      await api.cancelJob(activeJob.id);
    } catch (e) {
      console.error('Failed to cancel job:', e);
    }
  };

  const isAuthError =
    activeJob.status === 'failed' &&
    ((activeJob.error && /auth|api[\s_-]?key|gemini|codecraft|401|403/i.test(activeJob.error)) ||
      (activeJob.message && /auth|api[\s_-]?key|gemini|codecraft|401|403/i.test(activeJob.message)));

  const jobTypeTitle: Record<string, string> = {
    transcription: 'Speech Transcription',
    translation: 'AI Translation',
    tts: 'Speech Synthesis (Edge TTS)',
    speech_generation: 'Speech Synthesis (Edge TTS)',
    audio_extraction: 'Audio Extraction',
    waveform_generation: 'Waveform Processing',
    export: 'Video Export',
    video_export: 'Video Export',
  };
  const title = jobTypeTitle[activeJob.type] || activeJob.type;

  return (
    <div className="fixed bottom-14 right-4 z-50 max-w-md w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div
        className={`p-3.5 rounded-lg shadow-2xl border backdrop-blur-md flex flex-col gap-2.5 text-xs ${
          activeJob.status === 'failed'
            ? 'bg-red-950/90 border-red-500/40 text-red-100 shadow-red-950/50'
            : activeJob.status === 'completed'
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100 shadow-emerald-950/50'
            : 'bg-studio-panel/95 border-studio-accent/40 text-studio-text shadow-black/60'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            {activeJob.status === 'running' || activeJob.status === 'queued' ? (
              <Loader2 className="w-4 h-4 text-studio-accent animate-spin" />
            ) : activeJob.status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            <span className="font-semibold">{title}</span>
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
                activeJob.status === 'running'
                  ? 'bg-blue-500/20 text-blue-300'
                  : activeJob.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : activeJob.status === 'failed'
                  ? 'bg-red-500/20 text-red-300'
                  : 'bg-studio-subbg text-studio-muted'
              }`}
            >
              {activeJob.status}
            </span>
          </div>

          <button
            onClick={() => setActiveJob(null)}
            className="text-studio-muted hover:text-studio-text transition-colors p-0.5 rounded"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Message / Error Details */}
        <div className="text-[11px] leading-relaxed break-words opacity-90">
          {activeJob.status === 'failed' ? (
            activeJob.error || activeJob.message || 'Operation failed.'
          ) : (
            activeJob.message || 'Processing in background...'
          )}
        </div>

        {/* Progress Bar (when running) */}
        {(activeJob.status === 'running' || activeJob.status === 'queued') && (
          <div className="flex flex-col gap-1 mt-0.5">
            <div className="flex justify-between text-[10px] text-studio-muted">
              <span>Progress</span>
              <span>{Math.round(activeJob.progress)}%</span>
            </div>
            <div className="w-full bg-studio-subbg h-1.5 rounded-full overflow-hidden border border-studio-border">
              <div
                className="bg-studio-accent h-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(5, activeJob.progress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
          {isAuthError && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                openModal();
              }}
              className="bg-red-600 hover:bg-red-500 text-white h-7 text-xs px-2.5"
            >
              <Key className="w-3 h-3 mr-1" />
              <span>Configure API Key</span>
            </Button>
          )}

          {(activeJob.status === 'running' || activeJob.status === 'queued') && (
            <Button size="sm" variant="outline" onClick={handleCancel} className="h-7 text-xs px-2.5">
              Cancel
            </Button>
          )}

          {activeJob.status === 'failed' && !isAuthError && (
            <Button size="sm" variant="secondary" onClick={() => setActiveJob(null)} className="h-7 text-xs px-2.5">
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
