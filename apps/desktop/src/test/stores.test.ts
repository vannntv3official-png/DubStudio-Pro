import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../stores/playerStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useSubtitleStore } from '../stores/subtitleStore';

describe('PlayerStore', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentTimeMs: 0,
      durationMs: 10000,
      isPlaying: false,
      volume: 1.0,
      playbackRate: 1.0,
    });
  });

  it('toggles play/pause correctly', () => {
    const store = usePlayerStore.getState();
    expect(store.isPlaying).toBe(false);
    store.togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    store.togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('clamps current time within valid duration bounds', () => {
    const store = usePlayerStore.getState();
    store.setCurrentTimeMs(5000);
    expect(usePlayerStore.getState().currentTimeMs).toBe(5000);

    store.setCurrentTimeMs(15000); // Exceeds durationMs (10000)
    expect(usePlayerStore.getState().currentTimeMs).toBe(10000);

    store.setCurrentTimeMs(-500); // Negative
    expect(usePlayerStore.getState().currentTimeMs).toBe(0);
  });

  it('steps frames accurately based on 30 fps', () => {
    const store = usePlayerStore.getState();
    store.setCurrentTimeMs(1000);
    store.stepFrames(1, 30); // ~33.33ms forward
    expect(usePlayerStore.getState().currentTimeMs).toBeCloseTo(1033.33, 1);
  });
});

describe('TimelineStore', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          projectId: 'proj-1',
          type: 'dubbed_voice',
          name: 'Dubbed Voice',
          index: 0,
          muted: false,
          solo: false,
          locked: false,
          volume: 1.0,
          clips: [
            {
              id: 'clip-1',
              trackId: 'track-1',
              projectId: 'proj-1',
              sourceId: 'src-1',
              label: 'Sample Dialogue',
              startMs: 1000,
              durationMs: 4000,
              sourceOffsetMs: 0,
              playbackRate: 1.0,
              volume: 1.0,
              muted: false,
              locked: false,
            },
          ],
        },
      ],
      zoomLevel: 100,
      selectedClipId: null,
      history: { past: [], future: [] },
    });
  });

  it('updates clip start time and preserves undo history', () => {
    const store = useTimelineStore.getState();
    store.updateClip('track-1', 'clip-1', { startMs: 2500 });

    const updatedTracks = useTimelineStore.getState().tracks;
    expect(updatedTracks[0].clips[0].startMs).toBe(2500);
    expect(useTimelineStore.getState().history.past.length).toBe(1);

    // Test undo
    store.undo();
    expect(useTimelineStore.getState().tracks[0].clips[0].startMs).toBe(1000);
  });

  it('splits clip accurately into two consecutive clips', () => {
    const store = useTimelineStore.getState();
    store.splitClipAt('clip-1', 2500);

    const updatedClips = useTimelineStore.getState().tracks[0].clips;
    expect(updatedClips.length).toBe(2);
    expect(updatedClips[0].startMs).toBe(1000);
    expect(updatedClips[0].durationMs).toBe(1500);
    expect(updatedClips[1].startMs).toBe(2500);
    expect(updatedClips[1].durationMs).toBe(2500);
  });
});

describe('SubtitleStore', () => {
  it('updates subtitle style properties', () => {
    const store = useSubtitleStore.getState();
    store.updateStyle({ fontSize: 32, textColor: '#FFFF00' });
    expect(useSubtitleStore.getState().style.fontSize).toBe(32);
    expect(useSubtitleStore.getState().style.textColor).toBe('#FFFF00');
  });
});
