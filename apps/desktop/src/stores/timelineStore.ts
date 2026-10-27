import { create } from 'zustand';
import type { TimelineTrack, TimelineClip } from '@dubstudio/shared-types';
import { api } from '@/services/api';

interface TimelineHistoryState {
  past: TimelineTrack[][];
  future: TimelineTrack[][];
}

interface TimelineState {
  tracks: TimelineTrack[];
  zoomLevel: number; // Pixels per second (e.g. 100px/s)
  scrollLeft: number;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  isSnapping: boolean;
  history: TimelineHistoryState;

  setTracks: (tracks: TimelineTrack[]) => void;
  loadTimeline: (projectId: string) => Promise<void>;
  saveTimeline: (projectId: string) => Promise<void>;
  setZoomLevel: (zoom: number) => void;
  setScrollLeft: (pos: number) => void;
  setSelectedClipId: (id: string | null) => void;
  setSelectedTrackId: (id: string | null) => void;
  toggleSnapping: () => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<TimelineClip>) => void;
  deleteClip: (clipId: string) => void;
  splitClipAt: (clipId: string, splitTimeMs: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  setTrackVolume: (trackId: string, vol: number) => void;
  undo: () => void;
  redo: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  tracks: [],
  zoomLevel: 100, // 100px = 1 second
  scrollLeft: 0,
  selectedClipId: null,
  selectedTrackId: null,
  isSnapping: true,
  history: { past: [], future: [] },

  setTracks: (tracks) => set({ tracks }),

  loadTimeline: async (projectId: string) => {
    try {
      const res = await api.getTimeline(projectId);
      set({ tracks: res.tracks || [] });
    } catch (e) {
      console.error('Failed to load timeline:', e);
    }
  },

  saveTimeline: async (projectId: string) => {
    try {
      await api.saveTimeline(projectId, get().tracks);
    } catch (e) {
      console.error('Failed to save timeline:', e);
    }
  },

  setZoomLevel: (zoom) => set({ zoomLevel: Math.max(20, Math.min(600, zoom)) }),
  setScrollLeft: (pos) => set({ scrollLeft: Math.max(0, pos) }),
  setSelectedClipId: (id) => set({ selectedClipId: id }),
  setSelectedTrackId: (id) => set({ selectedTrackId: id }),
  toggleSnapping: () => set((s) => ({ isSnapping: !s.isSnapping })),

  updateClip: (trackId, clipId, updates) => {
    const { tracks, history } = get();
    // Record history
    const past = [...history.past, JSON.parse(JSON.stringify(tracks))];

    const newTracks = tracks.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
      };
    });
    set({ tracks: newTracks, history: { past, future: [] } });
  },

  deleteClip: (clipId) => {
    const { tracks, history } = get();
    const past = [...history.past, JSON.parse(JSON.stringify(tracks))];
    const newTracks = tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => c.id !== clipId),
    }));
    set({ tracks: newTracks, selectedClipId: null, history: { past, future: [] } });
  },

  splitClipAt: (clipId, splitTimeMs) => {
    const { tracks, history } = get();
    const past = [...history.past, JSON.parse(JSON.stringify(tracks))];

    const newTracks = tracks.map((t) => {
      const clip = t.clips.find((c) => c.id === clipId);
      if (!clip) return t;

      if (splitTimeMs <= clip.startMs || splitTimeMs >= clip.startMs + clip.durationMs) {
        return t;
      }

      const firstDur = splitTimeMs - clip.startMs;
      const secondDur = clip.durationMs - firstDur;

      const firstClip: TimelineClip = { ...clip, durationMs: firstDur };
      const secondClip: TimelineClip = {
        ...clip,
        id: crypto.randomUUID(),
        startMs: splitTimeMs,
        durationMs: secondDur,
        sourceOffsetMs: clip.sourceOffsetMs + firstDur,
      };

      return {
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? firstClip : c)).concat(secondClip),
      };
    });

    set({ tracks: newTracks, history: { past, future: [] } });
  },

  toggleTrackMute: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
    }));
  },

  toggleTrackSolo: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, solo: !t.solo } : t)),
    }));
  },

  setTrackVolume: (trackId, vol) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, volume: vol } : t)),
    }));
  },

  undo: () => {
    const { history, tracks } = get();
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);
    const newFuture = [tracks, ...history.future];
    set({ tracks: previous, history: { past: newPast, future: newFuture } });
  },

  redo: () => {
    const { history, tracks } = get();
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    const newPast = [...history.past, tracks];
    set({ tracks: next, history: { past: newPast, future: newFuture } });
  },
}));
