import React from 'react';
import { Sliders, Volume2, Mic, Clock, Sparkles, Film, CheckCircle2 } from 'lucide-react';
import { useTimelineStore } from '@/stores/timelineStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { useTranslationStore } from '@/stores/translationStore';
import { useProjectStore } from '@/stores/projectStore';
import { Slider } from '@/components/ui/Slider';
import { Select } from '@/components/ui/Select';

export const RightInspector: React.FC = () => {
  const { currentProject, updateProject } = useProjectStore();
  const { selectedClipId, tracks, updateClip } = useTimelineStore();
  const { segments, selectedSegmentId } = useTranscriptStore();
  const { translations } = useTranslationStore();

  const selectedClip = tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);
  const selectedTranslation = translations.find((t) => t.segmentId === selectedSegmentId);

  return (
    <div className="w-[300px] bg-studio-panel border-l border-studio-border flex flex-col h-full shrink-0 select-none overflow-y-auto p-3 gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-studio-border text-xs font-semibold text-studio-text">
        <Sliders className="w-4 h-4 text-studio-accent" />
        <span>Inspector Properties</span>
      </div>

      {/* Selected Clip / Segment Timing */}
      {selectedSegment ? (
        <div className="flex flex-col gap-2.5 p-3 rounded bg-studio-subbg border border-studio-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-studio-text">
            <Clock className="w-3.5 h-3.5 text-studio-accent" />
            <span>Dialogue Segment</span>
          </div>

          <div className="flex flex-col gap-1 text-[11px] text-studio-muted">
            <div className="flex justify-between">
              <span>Start Time:</span>
              <span className="font-mono text-studio-text">{(selectedSegment.startMs / 1000).toFixed(2)}s</span>
            </div>
            <div className="flex justify-between">
              <span>End Time:</span>
              <span className="font-mono text-studio-text">{(selectedSegment.endMs / 1000).toFixed(2)}s</span>
            </div>
            <div className="flex justify-between">
              <span>Duration:</span>
              <span className="font-mono text-studio-text">
                {((selectedSegment.endMs - selectedSegment.startMs) / 1000).toFixed(2)}s
              </span>
            </div>
          </div>

          {selectedTranslation && (
            <div className="mt-1 pt-2 border-t border-studio-border/60 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-studio-accent">Dubbed Speech:</span>
              <span className="text-xs text-studio-text font-khmer italic">
                "{selectedTranslation.translatedText}"
              </span>
            </div>
          )}
        </div>
      ) : selectedClip ? (
        <div className="flex flex-col gap-2.5 p-3 rounded bg-studio-subbg border border-studio-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-studio-text">
            <Clock className="w-3.5 h-3.5 text-studio-accent" />
            <span>Clip Properties</span>
          </div>

          <Slider
            label="Clip Volume"
            min={0}
            max={2}
            step={0.05}
            value={selectedClip.volume}
            valueDisplay={`${Math.round(selectedClip.volume * 100)}%`}
            onChange={(e) => updateClip(selectedClip.trackId, selectedClip.id, { volume: parseFloat(e.target.value) })}
          />

          <Slider
            label="Playback Rate"
            min={0.5}
            max={2.0}
            step={0.05}
            value={selectedClip.playbackRate}
            valueDisplay={`${selectedClip.playbackRate.toFixed(2)}x`}
            onChange={(e) => updateClip(selectedClip.trackId, selectedClip.id, { playbackRate: parseFloat(e.target.value) })}
          />
        </div>
      ) : currentProject ? (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-studio-subbg border border-studio-border">
          <div className="flex items-center justify-between pb-2 border-b border-studio-border/60">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-studio-text">
              <Sparkles className="w-3.5 h-3.5 text-studio-accent" />
              <span>Project Summary</span>
            </div>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-studio-accent/15 text-studio-accent border border-studio-accent/30 font-bold">
              {currentProject.syncMode}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex justify-between items-center text-studio-muted">
              <span>Target Language:</span>
              <span className="text-studio-text font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                {(currentProject.targetLanguage || 'km').toUpperCase()} (Khmer)
              </span>
            </div>
            <div className="flex justify-between items-center text-studio-muted">
              <span>Source Speech:</span>
              <span className="text-studio-text font-semibold">
                {(currentProject.sourceLanguage || 'en').toUpperCase()} (English)
              </span>
            </div>
            <div className="flex justify-between items-center text-studio-muted">
              <span>Duration:</span>
              <span className="font-mono text-studio-text">
                {((currentProject.durationMs || 0) / 1000).toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Workflow Status Tracker */}
          <div className="mt-1 pt-2 border-t border-studio-border/60 flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">
              Dubbing Progress
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="p-2 rounded bg-studio-surface border border-studio-border/50 flex flex-col">
                <span className="text-studio-muted">Transcript</span>
                <span className="font-bold text-studio-text text-xs mt-0.5">
                  {segments.length} {segments.length === 1 ? 'line' : 'lines'}
                </span>
              </div>
              <div className="p-2 rounded bg-studio-surface border border-studio-border/50 flex flex-col">
                <span className="text-studio-muted">Translation</span>
                <span className="font-bold text-studio-text text-xs mt-0.5">
                  {translations.length} {translations.length === 1 ? 'line' : 'lines'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-6 rounded-lg bg-studio-subbg/50 border border-dashed border-studio-border text-xs text-studio-muted gap-2.5">
          <Film className="w-8 h-8 text-studio-muted/40" />
          <span className="font-semibold text-studio-text">No Project Active</span>
          <span className="text-[11px] text-studio-muted leading-relaxed">
            Create or open a project to inspect clip timings, fine-tune voice ducking, and adjust subtitle styles.
          </span>
        </div>
      )}

      {/* Audio Mixing & Ducking Settings */}
      {currentProject && (
        <div className="flex flex-col gap-3 p-3 rounded bg-studio-subbg border border-studio-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-studio-text">
            <Volume2 className="w-3.5 h-3.5 text-studio-success" />
            <span>Audio Master Mix & Ducking</span>
          </div>

          <Slider
            label="Original Video Audio"
            min={0}
            max={1}
            step={0.05}
            value={currentProject.audioSettings?.originalVolume ?? 0.2}
            valueDisplay={`${Math.round((currentProject.audioSettings?.originalVolume ?? 0.2) * 100)}%`}
            onChange={(e) =>
              updateProject({
                audioSettings: {
                  ...currentProject.audioSettings,
                  originalVolume: parseFloat(e.target.value),
                },
              })
            }
          />

          <Slider
            label="Dubbed Voice Volume"
            min={0}
            max={1.5}
            step={0.05}
            value={currentProject.audioSettings?.dubbedVolume ?? 1.0}
            valueDisplay={`${Math.round((currentProject.audioSettings?.dubbedVolume ?? 1.0) * 100)}%`}
            onChange={(e) =>
              updateProject({
                audioSettings: {
                  ...currentProject.audioSettings,
                  dubbedVolume: parseFloat(e.target.value),
                },
              })
            }
          />

          <Select
            label="Speech Synchronization Mode"
            options={[
              { value: 'balanced', label: 'Balanced Mode (Default)' },
              { value: 'natural', label: 'Natural Mode (High Quality)' },
              { value: 'strict', label: 'Strict Sync Mode (Exact Timing)' },
            ]}
            value={currentProject.syncMode || 'balanced'}
            onChange={(e) => updateProject({ syncMode: e.target.value as any })}
          />
        </div>
      )}
    </div>
  );
};
