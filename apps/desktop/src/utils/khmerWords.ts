import type { SubtitleItem, WordTiming } from '@dubstudio/shared-types';

export interface BreathPhrase {
  text: string;
  startMs: number;
  endMs: number;
  words: WordTiming[];
}

/**
 * Splits Khmer and multilingual text into natural words/tokens for Karaoke animation.
 * Handles spaces, zero-width spaces (\u200b), Khmer punctuation, and words.
 */
export function splitWords(text: string): string[] {
  if (!text) return [];
  const trimmed = String(text).trim();
  if (!trimmed) return [];

  // Check if string contains spaces or zero-width spaces
  if (trimmed.includes(' ') || trimmed.includes('\u200b')) {
    return trimmed
      .split(/[\s\u200b]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  }

  // Use native V8 / Chromium ICU Khmer dictionary segmenter when available
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter('km', { granularity: 'word' });
      const segs = Array.from(segmenter.segment(trimmed))
        .filter((s: any) => s.isWordLike)
        .map((s: any) => s.segment.trim())
        .filter(Boolean);
      if (segs.length > 0) return segs;
    } catch {
      // Fallback to regex below
    }
  }

  // If Khmer text without explicit spaces, split by phrase punctuation or tokens
  const tokens = trimmed.match(/[\u1780-\u17D3\u17DD]+|[A-Za-z0-9_]+|[^\s]+/g);
  if (tokens && tokens.length > 0) {
    return tokens;
  }

  return [trimmed];
}

/**
 * Returns accurate or dynamically interpolated word timings for a subtitle segment.
 * If the STT provider produced word-level timestamps, those are preserved;
 * otherwise, timestamps are smoothly distributed across the segment's duration.
 */
export function getSegmentWordTimings(item: {
  text?: string;
  startMs?: number;
  endMs?: number;
  start_ms?: number;
  end_ms?: number;
  words?: WordTiming[];
}): WordTiming[] {
  const text = item.text ? String(item.text).trim() : '';
  const startMs = Number(item.startMs ?? item.start_ms ?? 0);
  const endMs = Number(item.endMs ?? item.end_ms ?? (startMs + 1000));

  if (item.words && item.words.length > 0) {
    return item.words.map((w: any) => ({
      word: w.word || '',
      startMs: Number(w.startMs ?? w.start_ms ?? startMs),
      endMs: Number(w.endMs ?? w.end_ms ?? endMs),
      confidence: w.confidence ?? 1.0,
    }));
  }

  const words = splitWords(text);
  if (words.length === 0) return [];

  const totalDuration = Math.max(100, endMs - startMs);
  const durationPerWord = totalDuration / words.length;

  return words.map((word, i) => ({
    word,
    startMs: Math.round(startMs + i * durationPerWord),
    endMs: Math.round(startMs + (i + 1) * durationPerWord),
    confidence: 1.0,
  }));
}

/**
 * Splits a long subtitle item or transcript into short, natural breath phrases (កាត់ខ្លីតាមដង្ហើម)
 * with precise timestamps matching the audio.
 */
export function splitIntoBreathPhrases(item: {
  text?: string;
  startMs?: number;
  endMs?: number;
  start_ms?: number;
  end_ms?: number;
  words?: WordTiming[];
}): BreathPhrase[] {
  const text = item.text ? String(item.text).trim() : '';
  const startMs = Number(item.startMs ?? item.start_ms ?? 0);
  const endMs = Number(item.endMs ?? item.end_ms ?? (startMs + 1000));

  const allWordTimings = getSegmentWordTimings({ ...item, text, startMs, endMs });
  if (allWordTimings.length <= 5 && !/[។\.\?!]/.test(text)) {
    return [
      {
        text,
        startMs,
        endMs,
        words: allWordTimings,
      },
    ];
  }

  const phrases: BreathPhrase[] = [];
  let cur: WordTiming[] = [];

  for (let i = 0; i < allWordTimings.length; i++) {
    const w = allWordTimings[i];
    cur.push(w);

    const hasPunctuation = /[។\.\?!,;]$/.test(w.word.trim());
    const isBreathConjunction = /^(ហើយ|ដែល|ពេល|នៅពេល|ប៉ុន្តែ|តែ|ព្រោះ|ពីព្រោះ|ថា)$/.test(w.word.trim());
    const isHardLimit = cur.length >= 5;
    const isSoftLimit = cur.length >= 3 && isBreathConjunction;

    const shouldSplit = hasPunctuation || isHardLimit || isSoftLimit || i === allWordTimings.length - 1;

    if (shouldSplit && cur.length > 0) {
      phrases.push({
        text: cur.map((cw) => cw.word).join(' '),
        startMs: cur[0].startMs,
        endMs: cur[cur.length - 1].endMs,
        words: cur,
      });
      cur = [];
    }
  }

  return phrases.length > 0
    ? phrases
    : [
        {
          text,
          startMs,
          endMs,
          words: allWordTimings,
        },
      ];
}
