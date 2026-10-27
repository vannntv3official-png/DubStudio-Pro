import { create } from 'zustand';
import type { SubtitleItem, SubtitleStyle } from '@dubstudio/shared-types';
import { api } from '@/services/api';
import { splitIntoBreathPhrases } from '@/utils/khmerWords';

function formatSrtTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const milli = Math.floor(ms % 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${milli.toString().padStart(3, '0')}`;
}

const defaultStyle: SubtitleStyle = {
  fontFamily: "'Kantumruy Pro', 'Khmer OS Siemreap', 'Khmer OS', 'Segoe UI', sans-serif",
  fontSize: 26,
  fontWeight: '700',
  textColor: '#FFE600',
  outlineColor: '#000000',
  outlineThickness: 2.5,
  shadowColor: 'rgba(0, 0, 0, 0.85)',
  shadowBlur: 4,
  backgroundColor: 'transparent',
  backgroundPadding: 0,
  borderRadius: 0,
  alignment: 'bottom',
  verticalMargin: 48,
  horizontalMargin: 32,
  lineHeight: 1.4,
  presetId: 'tiktok-yellow',
  animation: 'pop',
};

export function deoverlapSubtitleItems(items: SubtitleItem[]): SubtitleItem[] {
  if (!items || items.length === 0) return [];

  const sorted = [...items]
    .filter((item) => item.text && item.text.trim())
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const cleaned: SubtitleItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = { ...sorted[i] };
    if (cleaned.length === 0) {
      cleaned.push(item);
      continue;
    }

    const prev = cleaned[cleaned.length - 1];

    // Case 1: Duplicate within 250ms
    if (
      Math.abs(item.startMs - prev.startMs) <= 250 &&
      (item.text === prev.text || item.text.includes(prev.text) || prev.text.includes(item.text))
    ) {
      if (item.text.length > prev.text.length) {
        cleaned[cleaned.length - 1] = item;
      }
      continue;
    }

    // Case 2: Identical start time
    if (item.startMs <= prev.startMs + 40) {
      if (item.text.length >= prev.text.length) {
        cleaned[cleaned.length - 1] = item;
      }
      continue;
    }

    // Case 3: Overlapping timestamps
    if (prev.endMs > item.startMs) {
      prev.endMs = Math.max(prev.startMs + 150, item.startMs - 35);
    }

    // Ensure valid duration
    if (item.endMs <= item.startMs) {
      item.endMs = item.startMs + 300;
    }

    cleaned.push(item);
  }

  return cleaned;
}

interface SubtitleState {
  items: SubtitleItem[];
  style: SubtitleStyle;
  selectedItemId: string | null;
  isVisible: boolean;

  loadSubtitles: (projectId: string) => Promise<void>;
  updateStyle: (newStyle: Partial<SubtitleStyle>) => void;
  setSelectedItemId: (id: string | null) => void;
  updateItemText: (id: string, text: string) => void;
  importSrt: (projectId: string, srtText: string) => Promise<void>;
  splitAllByBreath: (projectId: string) => Promise<void>;
  fixOverlaps: (projectId: string) => Promise<void>;
  toggleVisibility: () => void;
  setIsVisible: (visible: boolean) => void;
}

export const useSubtitleStore = create<SubtitleState>((set, get) => ({
  items: [],
  style: defaultStyle,
  selectedItemId: null,
  isVisible: true,

  toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
  setIsVisible: (visible) => set({ isVisible: visible }),

  loadSubtitles: async (projectId: string) => {
    try {
      const data = await api.getSubtitles(projectId);
      set({ items: deoverlapSubtitleItems(data.items || []), style: data.style || defaultStyle });
    } catch (e) {
      console.error('Failed to load subtitles:', e);
    }
  },

  updateStyle: (newStyle) => {
    set((state) => ({ style: { ...state.style, ...newStyle } }));
  },

  setSelectedItemId: (id) => set({ selectedItemId: id }),

  updateItemText: (id, text) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, text } : i)),
    }));
  },

  fixOverlaps: async (projectId: string) => {
    try {
      const data = await api.fixSubtitleOverlaps(projectId);
      set({ items: deoverlapSubtitleItems(data.items || []) });
    } catch (e) {
      console.warn('Fallback to local de-overlap:', e);
      const cleaned = deoverlapSubtitleItems(get().items);
      set({ items: cleaned });
    }
  },

  importSrt: async (projectId, srtText) => {
    try {
      const data = await api.importSubtitles(projectId, srtText);
      set({ items: deoverlapSubtitleItems(data.items || []) });
    } catch (e) {
      console.error('Failed to import SRT:', e);
    }
  },

  splitAllByBreath: async (projectId: string) => {
    const current = get().items;
    if (current.length === 0) return;

    const newItems: SubtitleItem[] = [];
    current.forEach((item) => {
      const phrases = splitIntoBreathPhrases(item);
      phrases.forEach((p, idx) => {
        newItems.push({
          id: `${item.id}-b${idx}`,
          projectId: item.projectId || projectId,
          startMs: p.startMs,
          endMs: p.endMs,
          text: p.text,
          speakerId: item.speakerId,
          words: p.words,
        });
      });
    });

    const deoverlapped = deoverlapSubtitleItems(newItems);

    let srt = '';
    deoverlapped.forEach((sub, i) => {
      const start = formatSrtTimestamp(sub.startMs);
      const end = formatSrtTimestamp(sub.endMs);
      srt += `${i + 1}\n${start} --> ${end}\n${sub.text}\n\n`;
    });

    try {
      const data = await api.importSubtitles(projectId, srt);
      set({ items: deoverlapSubtitleItems(data.items || deoverlapped) });
    } catch (e) {
      console.warn('Fallback to local state after breath split:', e);
      set({ items: deoverlapped });
    }
  },
}));
