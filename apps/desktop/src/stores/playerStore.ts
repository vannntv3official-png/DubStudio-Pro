import { create } from 'zustand';

interface PlayerState {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  playbackRate: number;
  activeSubtitleText: string | null;
  originalAudioEnabled: boolean;
  dubbedAudioEnabled: boolean;
  isLooping: boolean;

  setCurrentTimeMs: (ms: number) => void;
  setDurationMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  setActiveSubtitleText: (text: string | null) => void;
  setOriginalAudioEnabled: (enabled: boolean) => void;
  setDubbedAudioEnabled: (enabled: boolean) => void;
  toggleLooping: () => void;
  stepFrames: (frames: number, fps?: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  volume: 1.0,
  isMuted: false,
  playbackRate: 1.0,
  activeSubtitleText: null,
  originalAudioEnabled: true,
  dubbedAudioEnabled: true,
  isLooping: false,

  setCurrentTimeMs: (ms) => {
    const duration = get().durationMs;
    const clamped = duration > 0 ? Math.max(0, Math.min(ms, duration)) : 0;
    set({ currentTimeMs: clamped });
  },

  setDurationMs: (ms) => set({ durationMs: ms }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setActiveSubtitleText: (text) => set({ activeSubtitleText: text }),
  setOriginalAudioEnabled: (enabled) => set({ originalAudioEnabled: enabled }),
  setDubbedAudioEnabled: (enabled) => set({ dubbedAudioEnabled: enabled }),
  toggleLooping: () => set((state) => ({ isLooping: !state.isLooping })),

  stepFrames: (frames, fps = 30) => {
    const frameDurationMs = 1000 / fps;
    const nextTime = get().currentTimeMs + frames * frameDurationMs;
    get().setCurrentTimeMs(nextTime);
  },
}));
