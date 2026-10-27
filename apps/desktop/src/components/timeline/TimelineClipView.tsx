import React, { useMemo } from 'react';
import type { TimelineClip } from '@dubstudio/shared-types';
import { useTimelineStore } from '@/stores/timelineStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useTranslationStore } from '@/stores/translationStore';
import { useTranscriptStore } from '@/stores/transcriptStore';

interface TimelineClipViewProps {
  clip: TimelineClip;
  trackType: string;
}

export const TimelineClipView: React.FC<TimelineClipViewProps> = ({ clip, trackType }) => {
  const { zoomLevel, selectedClipId, setSelectedClipId, updateClip, isSnapping, tracks } =
    useTimelineStore();
  const { currentTimeMs, setCurrentTimeMs } = usePlayerStore();
  const setSelectedTranslationId = useTranslationStore((s) => s.setSelectedTranslationId);
  const setSelectedSegmentId = useTranscriptStore((s) => s.setSelectedSegmentId);

  const isSelected = selectedClipId === clip.id;
  const isSubtitleTrack = trackType === 'subtitles';
  const isAudioTrack =
    trackType === 'original_audio' ||
    trackType === 'dubbed_voice' ||
    trackType === 'background_audio' ||
    trackType === 'background';

  const leftPx = (clip.startMs / 1000) * zoomLevel;
  const widthPx = Math.max(16, (clip.durationMs / 1000) * zoomLevel);

  // Pre-calculate snap targets (Neighboring clips, playhead, and start)
  const snapTargets = useMemo(() => {
    const targets: number[] = [0, currentTimeMs];
    const currentTrack = tracks.find((t) => t.id === clip.trackId);
    if (currentTrack) {
      for (const other of currentTrack.clips) {
        if (other.id !== clip.id) {
          targets.push(other.startMs);
          targets.push(other.startMs + other.durationMs);
        }
      }
    }
    // Also include video track start/end
    const videoTrack = tracks.find((t) => t.type === 'video');
    if (videoTrack) {
      for (const vClip of videoTrack.clips) {
        targets.push(vClip.startMs);
        targets.push(vClip.startMs + vClip.durationMs);
      }
    }
    return targets;
  }, [tracks, clip.trackId, clip.id, currentTimeMs]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    setCurrentTimeMs(clip.startMs);

    // Sync selected segment in transcript / translation store if this is a dubbed or subtitle clip
    if (clip.sourceId) {
      setSelectedTranslationId(clip.sourceId);
      setSelectedSegmentId(clip.sourceId);
    }

    const startX = e.clientX;
    const initialStartMs = clip.startMs;
    const snapThresholdMs = (14 / zoomLevel) * 1000; // 14px magnetic tolerance

    const handlePointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaMs = (deltaX / zoomLevel) * 1000;
      let newStartMs = Math.max(0, initialStartMs + deltaMs);

      if (isSnapping) {
        // 1. Magnetic snap to adjacent clip boundaries or playhead
        let snapped = false;
        for (const target of snapTargets) {
          if (Math.abs(newStartMs - target) <= snapThresholdMs) {
            newStartMs = target;
            snapped = true;
            break;
          }
          // Also snap clip right edge to target
          if (Math.abs(newStartMs + clip.durationMs - target) <= snapThresholdMs) {
            newStartMs = target - clip.durationMs;
            snapped = true;
            break;
          }
        }
        // 2. Fallback snap to nearest 50ms grid if not magnetically snapped
        if (!snapped) {
          newStartMs = Math.round(newStartMs / 50) * 50;
        }
      }

      updateClip(clip.trackId, clip.id, { startMs: Math.max(0, newStartMs) });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const getTrackColor = () => {
    if (clip.color) return clip.color;
    switch (trackType) {
      case 'video':
        return '#2563EB';
      case 'original_audio':
        return '#059669';
      case 'dubbed_voice':
        return '#3B82F6';
      case 'background_audio':
      case 'background':
        return '#D97706';
      case 'subtitles':
        return '#8B5CF6';
      default:
        return '#4B5563';
    }
  };

  // Generate synthetic audio amplitude waveform bars for audio tracks
  const waveformBars = useMemo(() => {
    if (!isAudioTrack || widthPx < 32) return [];
    const barWidth = 3;
    const gap = 1;
    const count = Math.min(100, Math.floor((widthPx - 16) / (barWidth + gap)));
    if (count <= 0) return [];

    const bars: number[] = [];
    const seed = (clip.id.charCodeAt(0) || 1) * 37;
    for (let i = 0; i < count; i++) {
      const pos = i / count;
      const envelope = Math.sin(pos * Math.PI);
      const rand = Math.abs(Math.sin((seed + i * 19) * 0.45));
      const amp = Math.max(0.12, Math.min(0.95, envelope * (0.35 + 0.65 * rand)));
      bars.push(amp);
    }
    return bars;
  }, [isAudioTrack, widthPx, clip.id]);

  const durSec = (clip.durationMs / 1000).toFixed(1);

  // Distinct Subtitle Clip Styling
  if (isSubtitleTrack) {
    return (
      <div
        data-timeline-clip="true"
        onPointerDown={handlePointerDown}
        style={{
          left: `${leftPx}px`,
          width: `${widthPx}px`,
        }}
        title={`Subtitle: "${clip.label || ''}" (${(clip.startMs / 1000).toFixed(2)}s - ${((clip.startMs + clip.durationMs) / 1000).toFixed(2)}s)`}
        className={`absolute top-1 bottom-1 rounded border overflow-hidden flex items-center px-1.5 cursor-grab active:cursor-grabbing select-none transition-all z-10 ${
          isSelected
            ? 'bg-purple-600/40 border-white ring-2 ring-white/80 shadow-lg'
            : 'bg-purple-500/20 border-purple-500/50 hover:bg-purple-500/30 hover:border-purple-400'
        }`}
      >
        {widthPx >= 45 && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300 bg-purple-950/70 border border-purple-400/30 px-1 py-0.2 rounded mr-1.5 shrink-0 pointer-events-none">
            CC
          </span>
        )}
        <span className="text-xs font-medium text-white truncate font-khmer leading-relaxed drop-shadow-md pointer-events-none min-w-0 flex-1">
          {clip.label || 'Subtitle'}
        </span>
      </div>
    );
  }

  return (
    <div
      data-timeline-clip="true"
      onPointerDown={handlePointerDown}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        backgroundColor: `${getTrackColor()}33`,
        borderColor: isSelected ? '#FFFFFF' : getTrackColor(),
      }}
      title={`${clip.label || 'Clip'} (${(clip.startMs / 1000).toFixed(2)}s - ${((clip.startMs + clip.durationMs) / 1000).toFixed(2)}s)`}
      className={`absolute top-1 bottom-1 rounded border overflow-hidden flex items-center px-2 cursor-grab active:cursor-grabbing select-none transition-shadow group/clip ${
        isSelected ? 'ring-2 ring-white shadow-lg z-20' : 'hover:brightness-110'
      }`}
    >
      {/* Left Accent Bar */}
      <div
        style={{ backgroundColor: getTrackColor() }}
        className="w-1 h-full absolute left-0 top-0 bottom-0 pointer-events-none"
      />

      {/* Audio Waveform Background Layer */}
      {isAudioTrack && waveformBars.length > 0 && (
        <div className="absolute inset-0 pl-3 pr-3 flex items-center gap-[1px] pointer-events-none opacity-30 group-hover/clip:opacity-50 transition-opacity">
          {waveformBars.map((amp, idx) => (
            <div
              key={idx}
              style={{
                height: `${Math.round(amp * 85)}%`,
                backgroundColor: getTrackColor(),
              }}
              className="w-[2px] rounded-full shrink-0"
            />
          ))}
        </div>
      )}

      {/* Left Trim Handle */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          const startX = e.clientX;
          const initialStartMs = clip.startMs;
          const initialDurMs = clip.durationMs;

          const handleLeftTrim = (ev: PointerEvent) => {
            const deltaX = ev.clientX - startX;
            const deltaMs = (deltaX / zoomLevel) * 1000;
            const maxTrim = initialDurMs - 150;
            const appliedDelta = Math.min(maxTrim, deltaMs);
            const newStart = Math.max(0, initialStartMs + appliedDelta);
            const newDur = initialDurMs - appliedDelta;

            updateClip(clip.trackId, clip.id, {
              startMs: Math.round(newStart),
              durationMs: Math.round(newDur),
            });
          };

          const handleUp = () => {
            window.removeEventListener('pointermove', handleLeftTrim);
            window.removeEventListener('pointerup', handleUp);
          };

          window.addEventListener('pointermove', handleLeftTrim);
          window.addEventListener('pointerup', handleUp);
        }}
        className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 transition-colors z-20"
        title="Trim Start"
      />

      {/* Content Label & Duration */}
      <div className="flex items-center justify-between w-full min-w-0 z-10 pointer-events-none py-1">
        <span className="text-xs font-medium text-studio-text truncate ml-1 font-khmer drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] leading-relaxed">
          {clip.label || 'Clip'}
        </span>
        {/* Only show duration badge if clip is wide enough to prevent clashing with Khmer text */}
        {widthPx >= 110 && (
          <span className="text-[9px] font-mono text-white/90 bg-black/60 px-1.5 py-0.5 rounded ml-2 shrink-0 border border-white/10 shadow-sm">
            {durSec}s
          </span>
        )}
      </div>

      {/* Right Trim Handle */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          const startX = e.clientX;
          const initialDurMs = clip.durationMs;

          const handleRightTrim = (ev: PointerEvent) => {
            const deltaX = ev.clientX - startX;
            const deltaMs = (deltaX / zoomLevel) * 1000;
            const newDur = Math.max(150, initialDurMs + deltaMs);
            updateClip(clip.trackId, clip.id, { durationMs: Math.round(newDur) });
          };

          const handleUp = () => {
            window.removeEventListener('pointermove', handleRightTrim);
            window.removeEventListener('pointerup', handleUp);
          };

          window.addEventListener('pointermove', handleRightTrim);
          window.addEventListener('pointerup', handleUp);
        }}
        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 transition-colors z-20"
        title="Trim End"
      />
    </div>
  );
};
