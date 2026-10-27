import { create } from 'zustand';
import type { TranscriptSegment } from '@dubstudio/shared-types';
import { api } from '@/services/api';

interface TranscriptState {
  segments: TranscriptSegment[];
  selectedSegmentId: string | null;
  isTranscribing: boolean;
  filterSpeaker: string | null;

  loadTranscript: (projectId: string) => Promise<void>;
  setSelectedSegmentId: (id: string | null) => void;
  setFilterSpeaker: (speaker: string | null) => void;
  updateSegmentText: (segmentId: string, text: string) => void;
  updateSegmentTiming: (segmentId: string, startMs: number, endMs: number) => void;
  updateSegmentSpeaker: (segmentId: string, speakerId: string) => void;
  splitSegment: (projectId: string, segmentId: string, splitTimeMs: number) => Promise<void>;
  mergeSegments: (projectId: string, segmentIds: string[]) => Promise<void>;
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  segments: [],
  selectedSegmentId: null,
  isTranscribing: false,
  filterSpeaker: null,

  loadTranscript: async (projectId: string) => {
    try {
      const items = await api.getTranscript(projectId);
      set({ segments: items });
    } catch (e) {
      console.error('Failed to load transcript:', e);
    }
  },

  setSelectedSegmentId: (id) => set({ selectedSegmentId: id }),
  setFilterSpeaker: (speaker) => set({ filterSpeaker: speaker }),

  updateSegmentText: (segmentId, text) => {
    set((state) => ({
      segments: state.segments.map((s) => (s.id === segmentId ? { ...s, text, status: 'edited' } : s)),
    }));
  },

  updateSegmentTiming: (segmentId, startMs, endMs) => {
    set((state) => ({
      segments: state.segments.map((s) => (s.id === segmentId ? { ...s, startMs, endMs, status: 'edited' } : s)),
    }));
  },

  updateSegmentSpeaker: (segmentId, speakerId) => {
    set((state) => ({
      segments: state.segments.map((s) => (s.id === segmentId ? { ...s, speakerId } : s)),
    }));
  },

  splitSegment: async (projectId, segmentId, splitTimeMs) => {
    try {
      const newSegments = await api.splitSegment(projectId, segmentId, splitTimeMs);
      set({ segments: newSegments });
    } catch (e) {
      console.error('Failed to split segment:', e);
    }
  },

  mergeSegments: async (projectId, segmentIds) => {
    try {
      const newSegments = await api.mergeSegments(projectId, segmentIds);
      set({ segments: newSegments });
    } catch (e) {
      console.error('Failed to merge segments:', e);
    }
  },
}));
