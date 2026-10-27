import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Magnet,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Split,
  Trash2,
  Film,
  Mic,
  Music,
  Type,
  Maximize2,
  Minimize2,
  Subtitles,
  Sparkles,
} from 'lucide-react';
import { useTimelineStore } from '@/stores/timelineStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { useTranslationStore } from '@/stores/translationStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { TimelineRuler } from './TimelineRuler';
import { TimelineClipView } from './TimelineClipView';
import { Playhead } from './Playhead';
import { Button } from '@/components/ui/Button';

// De-overlap helper strictly ensuring subtitle clips on the timeline never collide
export const resolveNonOverlappingClips = (rawClips: any[]) => {
  if (!rawClips || rawClips.length <= 1) return rawClips || [];
  const sorted = [...rawClips]
    .filter((c) => c && c.label && String(c.label).trim())
    .sort((a, b) => a.startMs - b.startMs || (a.durationMs || 0) - (b.durationMs || 0));

  const result: any[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const clip = { ...sorted[i] };
    if (result.length === 0) {
      result.push(clip);
      continue;
    }

    const prev = result[result.length - 1];

    // Case 1: Duplicate start or near duplicate within 250ms
    if (
      Math.abs(clip.startMs - prev.startMs) <= 250 &&
      (clip.label === prev.label || clip.label.includes(prev.label) || prev.label.includes(clip.label))
    ) {
      if (clip.label.length > prev.label.length) {
        result[result.length - 1] = clip;
      }
      continue;
    }

    // Case 2: Identical start time (within 40ms)
    if (clip.startMs <= prev.startMs + 40) {
      if (clip.label.length >= prev.label.length) {
        result[result.length - 1] = clip;
      }
      continue;
    }

    // Case 3: Overlapping duration
    if (prev.startMs + prev.durationMs > clip.startMs) {
      prev.durationMs = Math.max(120, clip.startMs - prev.startMs - 35);
    }

    // Ensure valid duration
    clip.durationMs = Math.max(120, clip.durationMs);
    result.push(clip);
  }

  return result;
};

const DEFAULT_PREVIEW_TRACKS = [
  { id: 'v1', name: 'Video Track (V1)', type: 'video', color: '#2563EB', muted: false, solo: false, clips: [] },
  { id: 'a1', name: 'Original Audio (A1)', type: 'original_audio', color: '#059669', muted: false, solo: false, clips: [] },
  { id: 'a2', name: 'Dubbed Voice (A2)', type: 'dubbed_voice', color: '#3B82F6', muted: false, solo: false, clips: [] },
  { id: 'a3', name: 'Background Audio (A3)', type: 'background_audio', color: '#D97706', muted: false, solo: false, clips: [] },
  { id: 'cc', name: 'Subtitles (CC)', type: 'subtitles', color: '#8B5CF6', muted: false, solo: false, clips: [] },
];

const getTrackIcon = (type: string) => {
  switch (type) {
    case 'video':
      return <Film className="w-3.5 h-3.5 text-blue-400" />;
    case 'original_audio':
      return <Volume2 className="w-3.5 h-3.5 text-emerald-400" />;
    case 'dubbed_voice':
      return <Mic className="w-3.5 h-3.5 text-blue-400" />;
    case 'background_audio':
    case 'background':
      return <Music className="w-3.5 h-3.5 text-amber-400" />;
    case 'subtitles':
      return <Type className="w-3.5 h-3.5 text-purple-400" />;
    default:
      return null;
  }
};

export const TimelineEditor: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const trackHeadersBodyRef = useRef<HTMLDivElement>(null);

  // Dynamic Timeline Resizing (Default 336px to comfortably show all 5 tracks + ruler without clipping)
  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    const saved = localStorage.getItem('dubstudio_timeline_h');
    return saved ? Math.max(260, Math.min(650, parseInt(saved, 10))) : 336;
  });
  const isResizingRef = useRef(false);

  const { currentProject } = useProjectStore();
  const { durationMs, currentTimeMs, setCurrentTimeMs, isPlaying } = usePlayerStore();
  const {
    tracks,
    loadTimeline,
    zoomLevel,
    setZoomLevel,
    setScrollLeft,
    toggleTrackMute,
    toggleTrackSolo,
    isSnapping,
    toggleSnapping,
    selectedClipId,
    setSelectedClipId,
    deleteClip,
    splitClipAt,
  } = useTimelineStore();

  const {
    isVisible: showSubtitles,
    toggleVisibility: toggleSubtitles,
    items: subtitleItems,
    fixOverlaps,
  } = useSubtitleStore();
  const translations = useTranslationStore((s) => s.translations);
  const segments = useTranscriptStore((s) => s.segments);

  useEffect(() => {
    if (currentProject) {
      loadTimeline(currentProject.id);
    }
  }, [currentProject?.id]);

  // Drag resizer handler
  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startY = e.clientY;
    const startH = timelineHeight;

    const handlePointerMove = (ev: PointerEvent) => {
      if (!isResizingRef.current) return;
      const delta = startY - ev.clientY;
      const newH = Math.max(240, Math.min(650, startH + delta));
      setTimelineHeight(newH);
      localStorage.setItem('dubstudio_timeline_h', String(newH));
    };

    const handlePointerUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleFixSubtitles = async () => {
    if (currentProject) {
      await fixOverlaps(currentProject.id);
    }
  };

  // Keyboard Shortcuts for Timeline (Delete, Split, Deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        deleteClip(selectedClipId);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'b' && selectedClipId) {
        e.preventDefault();
        splitClipAt(selectedClipId, currentTimeMs);
      } else if (e.key === 'Escape' && selectedClipId) {
        setSelectedClipId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, currentTimeMs, deleteClip, splitClipAt, setSelectedClipId]);

  // Auto-scroll timeline to follow playhead during playback
  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current) return;
    const playheadPx = (currentTimeMs / 1000) * zoomLevel;
    const container = scrollContainerRef.current;
    const viewWidth = container.clientWidth;
    const currentScroll = container.scrollLeft;

    if (playheadPx > currentScroll + viewWidth - 80) {
      container.scrollLeft = playheadPx - 80;
    } else if (playheadPx < currentScroll) {
      container.scrollLeft = Math.max(0, playheadPx - 40);
    }
  }, [currentTimeMs, isPlaying, zoomLevel]);

  // Derived subtitle clips strictly de-overlapped
  const activeSubClips = useMemo(() => {
    let raw: any[] = [];
    if (subtitleItems && subtitleItems.length > 0) {
      raw = subtitleItems.map((item) => ({
        id: item.id,
        trackId: 'subtitles',
        projectId: item.projectId,
        sourceId: item.id,
        label: item.text,
        startMs: item.startMs,
        durationMs: Math.max(150, item.endMs - item.startMs),
        sourceOffsetMs: 0,
        playbackRate: 1.0,
        volume: 1.0,
        color: '#8B5CF6',
      }));
    } else if (translations && translations.length > 0 && segments && segments.length > 0) {
      const segMap = new Map(segments.map((s) => [s.id, s]));
      raw = translations
        .map((tr) => {
          const seg = segMap.get(tr.segmentId);
          if (!seg || !tr.translatedText) return null;
          return {
            id: tr.id,
            trackId: 'subtitles',
            projectId: tr.projectId,
            sourceId: tr.id,
            label: tr.translatedText,
            startMs: seg.startMs,
            durationMs: Math.max(150, seg.endMs - seg.startMs),
            sourceOffsetMs: 0,
            playbackRate: 1.0,
            volume: 1.0,
            color: '#8B5CF6',
          };
        })
        .filter(Boolean) as any[];
    }
    return resolveNonOverlappingClips(raw);
  }, [subtitleItems, translations, segments]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
    if (trackHeadersBodyRef.current) {
      trackHeadersBodyRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleSplitSelected = () => {
    if (selectedClipId) {
      splitClipAt(selectedClipId, currentTimeMs);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedClipId) {
      deleteClip(selectedClipId);
    }
  };

  // Click & scrub directly on tracks area
  const handleTracksPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-timeline-clip]')) {
      return;
    }
    const container = tracksContainerRef.current;
    if (!container) return;

    const updatePlayhead = (ev: PointerEvent | React.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const targetTimeMs = Math.max(0, Math.min(durationMs || 10000, (x / zoomLevel) * 1000));
      setCurrentTimeMs(targetTimeMs);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    const handleMove = (ev: PointerEvent) => {
      updatePlayhead(ev);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    updatePlayhead(e);
  };

  const handleFitToScreen = () => {
    if (!scrollContainerRef.current || !durationMs) return;
    const availableWidth = scrollContainerRef.current.clientWidth - 40;
    const newZoom = availableWidth / (durationMs / 1000);
    setZoomLevel(Math.max(20, Math.min(600, newZoom)));
  };

  const hasActiveTracks = tracks.length > 0;
  const displayTracks = hasActiveTracks ? tracks : (DEFAULT_PREVIEW_TRACKS as any[]);
  const totalWidthPx = Math.max(1000, ((durationMs || 10000) / 1000) * zoomLevel + 400);

  return (
    <div
      style={{ height: `${timelineHeight}px` }}
      className="bg-studio-panel border-t border-studio-border flex flex-col select-none shrink-0 relative transition-[height] duration-75"
    >
      {/* Top Resizer Handle (Allows dragging to expand or shrink timeline) */}
      <div
        onPointerDown={handleResizeStart}
        className="h-1.5 w-full bg-studio-border/30 hover:bg-studio-accent cursor-ns-resize transition-colors flex items-center justify-center group shrink-0"
        title="Drag up or down to resize timeline height"
      >
        <div className="w-12 h-1 rounded-full bg-studio-muted/30 group-hover:bg-white transition-colors" />
      </div>

      {/* Timeline Controls Header */}
      <div className="h-9 bg-studio-surface/60 border-b border-studio-border px-3 flex items-center justify-between shrink-0">
        {/* Left: Tools (Split, Delete, Snap, Fix Subtitles) */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSplitSelected}
            disabled={!selectedClipId}
            title="Split Selected Clip at Playhead (Ctrl+B)"
            className="gap-1 h-7 text-xs"
          >
            <Split className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Split</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={!selectedClipId}
            title="Delete Selected Clip (Delete / Backspace)"
            className="gap-1 h-7 text-xs text-studio-error hover:text-studio-error hover:bg-studio-error/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Delete</span>
          </Button>

          <div className="h-3.5 w-px bg-studio-border mx-1" />

          <Button
            variant={isSnapping ? 'primary' : 'ghost'}
            size="sm"
            onClick={toggleSnapping}
            title={isSnapping ? 'Magnetic Snapping: Active (S)' : 'Magnetic Snapping: Off (S)'}
            className="gap-1 h-7 text-xs"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Snap</span>
          </Button>

          <div className="h-3.5 w-px bg-studio-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleFixSubtitles}
            title="Auto-fix & De-overlap all Subtitles"
            className="gap-1 h-7 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-950/40"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Fix Subtitles</span>
          </Button>
        </div>

        {/* Right: Zoom controls & Fit to screen & Height toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoomLevel(zoomLevel - 20)}
            className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-hover transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono text-studio-muted w-12 text-center">
            {Math.round(zoomLevel)}%
          </span>

          <button
            onClick={() => setZoomLevel(zoomLevel + 20)}
            className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-hover transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleFitToScreen}
            className="px-2 py-0.5 rounded text-[10px] font-medium text-studio-muted hover:text-studio-text hover:bg-studio-hover border border-studio-border/60 transition-colors ml-1"
            title="Fit Entire Timeline to Window"
          >
            Fit
          </button>

          <div className="h-3.5 w-px bg-studio-border mx-1" />

          <button
            onClick={() => {
              const nextH = timelineHeight > 360 ? 336 : 460;
              setTimelineHeight(nextH);
              localStorage.setItem('dubstudio_timeline_h', String(nextH));
            }}
            className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-hover transition-colors"
            title={timelineHeight > 360 ? 'Collapse Timeline Height' : 'Expand Timeline Height'}
          >
            {timelineHeight > 360 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Track Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers (Left sidebar) */}
        <div className="w-52 bg-studio-subbg border-r border-studio-border flex flex-col shrink-0 z-20 shadow-sm">
          <div className="h-7 border-b border-studio-border bg-studio-panel px-3 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">Tracks ({displayTracks.length})</span>
            {!hasActiveTracks && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-studio-surface text-studio-muted">Preview</span>
            )}
          </div>

          <div ref={trackHeadersBodyRef} className="flex-1 flex flex-col overflow-y-hidden pb-6">
            {displayTracks.map((track) => {
              const isAudio = track.type === 'original_audio' || track.type === 'dubbed_voice' || track.type === 'background_audio' || track.type === 'background';
              const isSub = track.type === 'subtitles';

              return (
                <div
                  key={track.id}
                  className={`h-12 border-b border-studio-border/60 px-3 flex items-center justify-between text-xs font-medium transition-colors shrink-0 ${
                    hasActiveTracks ? 'bg-studio-panel/40' : 'opacity-60 bg-studio-subbg/30'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getTrackIcon(track.type)}
                    <span className="truncate text-studio-text text-xs font-medium">{track.name}</span>
                  </div>

                  {hasActiveTracks && (
                    <div className="flex items-center gap-1 shrink-0">
                      {isAudio ? (
                        <>
                          <button
                            onClick={() => toggleTrackMute(track.id)}
                            className={`p-1 rounded text-[10px] transition-colors ${
                              track.muted
                                ? 'bg-studio-error/20 text-studio-error'
                                : 'text-studio-muted hover:text-studio-text hover:bg-studio-surface'
                            }`}
                            title={track.muted ? 'Unmute Track' : 'Mute Track'}
                          >
                            {track.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => toggleTrackSolo(track.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                              track.solo
                                ? 'bg-studio-warning/20 text-studio-warning'
                                : 'text-studio-muted hover:text-studio-text hover:bg-studio-surface'
                            }`}
                            title="Solo Track"
                          >
                            S
                          </button>
                        </>
                      ) : isSub ? (
                        <button
                          onClick={toggleSubtitles}
                          className={`p-1 rounded text-[10px] transition-colors ${
                            showSubtitles
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'text-studio-muted hover:text-studio-text hover:bg-studio-surface'
                          }`}
                          title={showSubtitles ? 'Hide Subtitles' : 'Show Subtitles'}
                        >
                          <Subtitles className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          className="p-1 rounded text-[10px] text-studio-muted hover:text-studio-text hover:bg-studio-surface transition-colors"
                          title="Video Track"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Track Body & Ruler */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-studio-bg"
        >
          {/* Ruler */}
          <TimelineRuler totalDurationMs={durationMs || 10000} />

          {/* Tracks Area */}
          <div
            ref={tracksContainerRef}
            onPointerDown={handleTracksPointerDown}
            style={{ width: `${totalWidthPx}px` }}
            className="relative cursor-pointer pb-6"
          >
            {displayTracks.map((track) => {
              const isSubtitleTrack = track.type === 'subtitles';
              const rawClips = isSubtitleTrack && (!track.clips || track.clips.length === 0)
                ? activeSubClips
                : (track.clips || []);
              const clipsToRender = isSubtitleTrack ? resolveNonOverlappingClips(rawClips) : rawClips;

              return (
                <div
                  key={track.id}
                  className="h-12 border-b border-studio-border/40 relative bg-studio-subbg/20 hover:bg-studio-subbg/40 transition-colors"
                >
                  {clipsToRender.map((clip: any) => (
                    <TimelineClipView key={clip.id} clip={clip} trackType={track.type} />
                  ))}
                </div>
              );
            })}

            {!hasActiveTracks && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-studio-muted/50 pointer-events-none">
                Timeline tracks will activate once media is imported
              </div>
            )}

            {/* Playhead Needle extending across Ruler & Tracks */}
            <Playhead />
          </div>
        </div>
      </div>
    </div>
  );
};
