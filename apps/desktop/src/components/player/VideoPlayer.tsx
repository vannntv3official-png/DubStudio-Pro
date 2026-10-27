import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
  Film,
  FolderOpen,
  Volume1,
  Layers,
  Subtitles,
  Mic,
  Music,
  Sparkles,
} from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { useTranslationStore } from '@/stores/translationStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { SubtitleOverlay } from './SubtitleOverlay';
import { Button } from '@/components/ui/Button';
import { getBackendUrl, getAuthToken, api } from '@/services/api';

type AspectRatioMode = 'fit' | '16:9' | '9:16' | '1:1';

export const VideoPlayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastVideoReportedTimeMs = useRef<number>(0);
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentPlayingClipId = useRef<string | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  const { mediaAssets, importMediaFile, currentProject } = useProjectStore();
  const {
    currentTimeMs,
    durationMs,
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    originalAudioEnabled,
    dubbedAudioEnabled,
    setCurrentTimeMs,
    setDurationMs,
    togglePlay,
    setVolume,
    toggleMute,
    setPlaybackRate,
    setOriginalAudioEnabled,
    setDubbedAudioEnabled,
    stepFrames,
  } = usePlayerStore();

  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('fit');
  const [useBackendFallback, setUseBackendFallback] = useState(false);
  const [scrubberHoverTime, setScrubberHoverTime] = useState<number | null>(null);
  const [scrubberHoverX, setScrubberHoverX] = useState<number | null>(null);
  const [isDuckingActive, setIsDuckingActive] = useState(false);

  const { isVisible: showSubtitles, toggleVisibility: toggleSubtitles } = useSubtitleStore();
  const generatedAudios = useTranslationStore((s) => s.generatedAudios);
  const segments = useTranscriptStore((s) => s.segments);

  const primaryAsset = mediaAssets[0];

  const isElectron = typeof window !== 'undefined' && Boolean((window as any).dubstudio);
  const localProtocolUrl = primaryAsset?.filePath
    ? `media://local/${encodeURIComponent(primaryAsset.filePath.replace(/\\/g, '/'))}`
    : '';
  const backendStreamUrl = primaryAsset
    ? `${getBackendUrl()}/media/stream/${primaryAsset.id}?token=${getAuthToken()}`
    : '';

  // In Electron desktop environment, use direct high-performance local protocol first, fall back to backend stream on error
  const videoSrc =
    isElectron && localProtocolUrl && !useBackendFallback
      ? localProtocolUrl
      : backendStreamUrl || localProtocolUrl;

  const handleImportClick = async () => {
    if (typeof window !== 'undefined' && window.dubstudio) {
      const selected = await window.dubstudio.selectVideoFile();
      if (selected) {
        await importMediaFile(selected);
      }
    }
  };

  // Pre-calculate mapped dubbed audio clips
  const dubbedClips = useMemo(() => {
    if (!generatedAudios || generatedAudios.length === 0 || !segments || segments.length === 0) {
      return [];
    }
    const segMap = new Map(segments.map((s) => [s.id, s]));
    return generatedAudios
      .map((g) => {
        const tSeg = segMap.get(g.segmentId);
        if (!tSeg || !g.alignedAudioPath) return null;
        return {
          id: g.id,
          segmentId: g.segmentId,
          startMs: tSeg.startMs,
          durationMs: g.alignedDurationMs,
          endMs: tSeg.startMs + g.alignedDurationMs,
          audioPath: g.alignedAudioPath,
        };
      })
      .filter(Boolean) as {
        id: string;
        segmentId: string;
        startMs: number;
        durationMs: number;
        endMs: number;
        audioPath: string;
      }[];
  }, [generatedAudios, segments]);

  const getAudioUrl = (filePath: string): string => {
    if (isElectron && filePath) {
      return `media://local/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
    }
    return api.getMediaStreamUrl(filePath);
  };

  // Synchronize playback state
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch((err) => {
        if (err.name !== 'AbortError') console.warn('[VideoPlayer] Video play error:', err);
      });
      if (activeAudioRef.current && activeAudioRef.current.paused) {
        activeAudioRef.current.play().catch((err) => {
          if (err.name !== 'AbortError') console.warn('[AudioPlayer] Audio play error:', err);
        });
      }
    } else {
      videoRef.current.pause();
      if (activeAudioRef.current && !activeAudioRef.current.paused) {
        activeAudioRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Synchronize seek position without interrupting natural playback buffer
  useEffect(() => {
    if (!videoRef.current) return;
    // Only seek video if the time change was external (scrubber, timeline click, frame step)
    // and not from the video element's own timeupdate event!
    if (Math.abs(currentTimeMs - lastVideoReportedTimeMs.current) > 250) {
      lastVideoReportedTimeMs.current = currentTimeMs;
      videoRef.current.currentTime = currentTimeMs / 1000;
    }
  }, [currentTimeMs]);

  // Real-time Multitrack Audio Engine (Synchronizes Dubbed Voice & Auto-Ducking)
  useEffect(() => {
    if (!dubbedAudioEnabled || dubbedClips.length === 0) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        currentPlayingClipId.current = null;
      }
      setIsDuckingActive(false);
      return;
    }

    const activeClip = dubbedClips.find(
      (c) => currentTimeMs >= c.startMs && currentTimeMs < c.endMs
    );

    if (activeClip) {
      setIsDuckingActive(Boolean(currentProject?.audioSettings?.duckingEnabled !== false));

      const targetOffsetSec = Math.max(0, (currentTimeMs - activeClip.startMs) / 1000);
      const dubbedMasterVol = currentProject?.audioSettings?.dubbedVolume ?? 1.0;
      const targetVol = isMuted ? 0 : Math.min(1.0, dubbedMasterVol * volume);

      if (currentPlayingClipId.current !== activeClip.id) {
        // Pause previous audio clip smoothly
        if (activeAudioRef.current && !activeAudioRef.current.paused) {
          activeAudioRef.current.pause();
        }

        let audio = audioCache.current.get(activeClip.id);
        if (!audio) {
          audio = new Audio(getAudioUrl(activeClip.audioPath));
          audio.preload = 'auto';
          audioCache.current.set(activeClip.id, audio);
        }

        activeAudioRef.current = audio;
        currentPlayingClipId.current = activeClip.id;

        audio.playbackRate = playbackRate;
        audio.volume = targetVol;

        const startPlayback = () => {
          if (audio.readyState >= 1) {
            audio.currentTime = targetOffsetSec;
          }
          if (isPlaying) {
            audio.play().catch((err) => {
              if (err.name !== 'AbortError') console.warn('[AudioPlayer] Play error:', err);
            });
          }
        };

        if (audio.readyState >= 1) {
          startPlayback();
        } else {
          audio.addEventListener('loadedmetadata', startPlayback, { once: true });
        }

        // Lookahead: Preload upcoming clip into memory
        const nextClip = dubbedClips.find((c) => c.startMs > activeClip.startMs);
        if (nextClip && !audioCache.current.has(nextClip.id)) {
          const preAudio = new Audio(getAudioUrl(nextClip.audioPath));
          preAudio.preload = 'auto';
          audioCache.current.set(nextClip.id, preAudio);
        }

        // Cache eviction to keep memory lightweight in long videos
        if (audioCache.current.size > 30) {
          for (const [key, cachedAudio] of audioCache.current.entries()) {
            if (key !== activeClip.id && cachedAudio !== activeAudioRef.current) {
              cachedAudio.pause();
              cachedAudio.src = '';
              audioCache.current.delete(key);
              if (audioCache.current.size <= 20) break;
            }
          }
        }
      } else if (activeAudioRef.current) {
        // Currently playing clip: maintain parameters
        activeAudioRef.current.playbackRate = playbackRate;
        activeAudioRef.current.volume = targetVol;

        if (isPlaying && activeAudioRef.current.paused) {
          activeAudioRef.current.play().catch((err) => {
            if (err.name !== 'AbortError') console.warn('[AudioPlayer] Play error:', err);
          });
        }

        // Rate-limited drift correction (at most once every 800ms)
        const now = Date.now();
        if (now - lastSyncTimeRef.current > 800 && activeAudioRef.current.readyState >= 2) {
          const drift = Math.abs(activeAudioRef.current.currentTime - targetOffsetSec);
          if (drift > 0.35) {
            activeAudioRef.current.currentTime = targetOffsetSec;
            lastSyncTimeRef.current = now;
          }
        }
      }
    } else {
      // In silent inter-segment pause
      setIsDuckingActive(false);
      if (activeAudioRef.current && !activeAudioRef.current.paused) {
        activeAudioRef.current.pause();
      }
      currentPlayingClipId.current = null;

      // Lookahead: Preload upcoming clip if within 4 seconds
      const upcomingClip = dubbedClips.find(
        (c) => c.startMs >= currentTimeMs && c.startMs <= currentTimeMs + 4000
      );
      if (upcomingClip && !audioCache.current.has(upcomingClip.id)) {
        const preAudio = new Audio(getAudioUrl(upcomingClip.audioPath));
        preAudio.preload = 'auto';
        audioCache.current.set(upcomingClip.id, preAudio);
      }
    }
  }, [
    currentTimeMs,
    isPlaying,
    dubbedClips,
    dubbedAudioEnabled,
    isMuted,
    volume,
    playbackRate,
    currentProject?.audioSettings,
  ]);

  // Volume & rate for primary video audio (with auto-ducking)
  useEffect(() => {
    if (!videoRef.current) return;
    const baseOrigVol = currentProject?.audioSettings?.originalVolume ?? 0.8;
    const isDucked = isDuckingActive && currentProject?.audioSettings?.duckingEnabled !== false;
    const effectiveOrigVol = isDucked ? baseOrigVol * 0.25 : baseOrigVol;

    videoRef.current.volume = originalAudioEnabled && !isMuted ? Math.min(1.0, effectiveOrigVol * volume) : 0;
    videoRef.current.playbackRate = playbackRate;
  }, [volume, isMuted, playbackRate, originalAudioEnabled, isDuckingActive, currentProject?.audioSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      audioCache.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioCache.current.clear();
    };
  }, []);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const vTime = videoRef.current.currentTime * 1000;
    lastVideoReportedTimeMs.current = vTime;
    setCurrentTimeMs(vTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDurationMs(videoRef.current.duration * 1000);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const milli = Math.floor(ms % 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${milli.toString().padStart(3, '0')}`;
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs || durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetMs = percent * durationMs;
    setCurrentTimeMs(targetMs);
    if (videoRef.current) {
      videoRef.current.currentTime = targetMs / 1000;
    }
  };

  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs || durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    setScrubberHoverTime(percent * durationMs);
    setScrubberHoverX(clickX);
  };

  const handleScrubberMouseLeave = () => {
    setScrubberHoverTime(null);
    setScrubberHoverX(null);
  };

  const aspectClass =
    aspectRatio === '16:9'
      ? 'aspect-[16/9] max-h-full max-w-full'
      : aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-full max-w-full'
      : aspectRatio === '1:1'
      ? 'aspect-square max-h-full max-w-full'
      : 'w-full h-full';

  return (
    <div className="flex-1 flex flex-col bg-studio-bg overflow-hidden relative">
      {/* Video Viewport */}
      <div
        ref={containerRef}
        onDoubleClick={toggleFullscreen}
        className="flex-1 bg-black flex items-center justify-center relative overflow-hidden group select-none"
      >
        {primaryAsset ? (
          <div className={`relative flex items-center justify-center ${aspectClass}`}>
            <video
              ref={videoRef}
              src={videoSrc}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onClick={togglePlay}
              onError={() => {
                // If primary direct local protocol fails, fall back to backend byte-range stream
                if (!useBackendFallback && backendStreamUrl) {
                  setUseBackendFallback(true);
                }
              }}
              className="w-full h-full object-contain cursor-pointer"
            />

            {/* Top Left Info Overlay Chip */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-[11px] text-white/90 flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg">
              <span className="truncate max-w-[200px] font-medium">{primaryAsset.filename}</span>
              {primaryAsset.metadata?.video && (
                <span className="text-white/60">
                  · {primaryAsset.metadata.video.width}x{primaryAsset.metadata.video.height}
                  {primaryAsset.metadata.video.fps ? ` (${Math.round(primaryAsset.metadata.video.fps)} fps)` : ''}
                </span>
              )}
            </div>

            {/* Top Right Framing & Aspect Ratio Selector */}
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/75 backdrop-blur-md border border-white/10 rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg">
              <button
                onClick={() => setAspectRatio('fit')}
                title="Fit Original Aspect Ratio"
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  aspectRatio === 'fit' ? 'bg-studio-accent text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                Fit
              </button>
              <button
                onClick={() => setAspectRatio('16:9')}
                title="16:9 Landscape"
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  aspectRatio === '16:9' ? 'bg-studio-accent text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                16:9
              </button>
              <button
                onClick={() => setAspectRatio('9:16')}
                title="9:16 Vertical (TikTok / Shorts / Reels)"
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  aspectRatio === '9:16' ? 'bg-studio-accent text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                9:16 (TikTok)
              </button>
              <button
                onClick={() => setAspectRatio('1:1')}
                title="1:1 Square"
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  aspectRatio === '1:1' ? 'bg-studio-accent text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                1:1
              </button>
            </div>

            {/* Subtitle Overlay placed directly inside the framed viewport */}
            <SubtitleOverlay />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-studio-surface border border-studio-border flex items-center justify-center text-studio-accent mb-3 shadow-md">
              <Film className="w-7 h-7" />
            </div>
            <span className="font-semibold text-xs text-studio-text">No Video Loaded In Project</span>
            <span className="text-[11px] text-studio-muted mt-1 leading-relaxed">
              Import an MP4, MOV, MKV, or WebM video to preview dialogue and dubbing sync.
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={handleImportClick}
              className="mt-3.5 gap-1.5 shadow-sm shadow-blue-500/20"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Import Video</span>
            </Button>
          </div>
        )}
      </div>

      {/* Interactive Scrubber Bar with Hover Tooltip */}
      <div
        onClick={handleScrubberClick}
        onMouseMove={handleScrubberMouseMove}
        onMouseLeave={handleScrubberMouseLeave}
        className="h-1.5 w-full bg-studio-border/50 hover:h-2.5 transition-all cursor-pointer relative group/scrubber select-none"
      >
        <div
          className="h-full bg-studio-accent transition-all relative"
          style={{ width: `${durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0}%` }}
        >
          <div className="w-3 h-3 rounded-full bg-white shadow-md absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/scrubber:opacity-100 transition-opacity" />
        </div>

        {/* Hover Time Tooltip */}
        {scrubberHoverTime !== null && scrubberHoverX !== null && (
          <div
            style={{ left: `${scrubberHoverX}px` }}
            className="absolute -top-7 -translate-x-1/2 bg-black/90 text-white font-mono text-[10px] px-1.5 py-0.5 rounded shadow-lg border border-white/20 pointer-events-none z-30"
          >
            {formatTimecode(scrubberHoverTime)}
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="h-11 bg-studio-panel border-t border-studio-border px-4 flex items-center justify-between select-none">
        {/* Left: Timecode & Active Status Badges */}
        <div className="flex items-center gap-2.5 font-mono text-xs">
          <span className="text-studio-accent font-semibold">{formatTimecode(currentTimeMs)}</span>
          <span className="text-studio-muted">/</span>
          <span className="text-studio-muted">{formatTimecode(durationMs)}</span>

          {/* Ducking Active Indicator */}
          {isDuckingActive && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Ducking Active
            </span>
          )}
        </div>

        {/* Center: Playback buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => stepFrames(-1)}
            title="Step Backward 1 Frame (Arrow Left)"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button
            variant="primary"
            size="icon"
            onClick={togglePlay}
            title="Play / Pause (Space)"
            className="rounded-full w-8 h-8 shadow-md"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => stepFrames(1)}
            title="Step Forward 1 Frame (Arrow Right)"
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setCurrentTimeMs(0);
              if (videoRef.current) videoRef.current.currentTime = 0;
            }}
            title="Jump to Start (Home)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Right: Controls (Dubbed Audio, Original Audio, CC, Rate, Volume, Fullscreen) */}
        <div className="flex items-center gap-2">
          {/* Dubbed Audio Live Toggle */}
          <button
            onClick={() => setDubbedAudioEnabled(!dubbedAudioEnabled)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              dubbedAudioEnabled
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm'
                : 'text-studio-muted/70 hover:text-studio-text hover:bg-studio-hover border border-transparent'
            }`}
            title={dubbedAudioEnabled ? 'Dubbed Voice: ON (Click to Mute)' : 'Dubbed Voice: OFF (Click to Enable)'}
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">Dubbed</span>
          </button>

          {/* Original Audio Live Toggle */}
          <button
            onClick={() => setOriginalAudioEnabled(!originalAudioEnabled)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              originalAudioEnabled
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                : 'text-studio-muted/70 hover:text-studio-text hover:bg-studio-hover border border-transparent'
            }`}
            title={originalAudioEnabled ? 'Original Audio: ON' : 'Original Audio: OFF'}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">Orig</span>
          </button>

          {/* Subtitle Visibility Toggle Button */}
          <button
            onClick={toggleSubtitles}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              showSubtitles
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-sm'
                : 'text-studio-muted/70 hover:text-studio-text hover:bg-studio-hover border border-transparent'
            }`}
            title={showSubtitles ? 'Hide Subtitle Overlay (CC: On)' : 'Show Subtitle Overlay (CC: Off)'}
          >
            <Subtitles className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">CC</span>
          </button>

          {/* Rate selector */}
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            className="bg-studio-surface border border-studio-border text-xs rounded-lg px-2 py-0.5 text-studio-text focus:outline-none cursor-pointer"
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>

          {/* Master Volume toggle & slider */}
          <div className="flex items-center gap-1.5 ml-1">
            <button
              onClick={toggleMute}
              className="text-studio-muted hover:text-studio-text transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 accent-studio-accent bg-studio-surface rounded appearance-none cursor-pointer"
            />
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-hover transition-colors ml-1"
            title="Toggle Fullscreen (F)"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
