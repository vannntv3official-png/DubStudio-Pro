import React, { useMemo } from 'react';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { useTranslationStore } from '@/stores/translationStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { usePlayerStore } from '@/stores/playerStore';
import { splitIntoBreathPhrases } from '@/utils/khmerWords';
import type { SubtitleItem } from '@dubstudio/shared-types';

export const SubtitleOverlay: React.FC = () => {
  const { items, style, isVisible } = useSubtitleStore();
  const translations = useTranslationStore((s) => s.translations);
  const segments = useTranscriptStore((s) => s.segments);
  const { currentTimeMs } = usePlayerStore();

  // Multi-tier Fallback Engine:
  // 1. Explicit Subtitle Store Items (SRT imports, TTS generated)
  // 2. Translations mapped to transcript segment timings (real-time post-translation)
  // 3. Transcript Segments (real-time post-transcription)
  const effectiveItems = useMemo<SubtitleItem[]>(() => {
    if (items && items.length > 0) {
      return items;
    }

    if (translations && translations.length > 0 && segments && segments.length > 0) {
      const segMap = new Map(segments.map((s) => [s.id, s]));
      const derived: SubtitleItem[] = [];
      for (const tr of translations) {
        const seg = segMap.get(tr.segmentId);
        const text = (tr.translatedText || seg?.text || '').trim();
        if (seg && text) {
          derived.push({
            id: tr.id,
            projectId: tr.projectId,
            startMs: seg.startMs,
            endMs: seg.endMs,
            text,
            speakerId: seg.speakerId,
            words: seg.words,
          });
        }
      }
      if (derived.length > 0) return derived;
    }

    if (segments && segments.length > 0) {
      return segments
        .filter((s) => s.text && s.text.trim())
        .map((seg) => ({
          id: seg.id,
          projectId: seg.projectId,
          startMs: seg.startMs,
          endMs: seg.endMs,
          text: seg.text.trim(),
          speakerId: seg.speakerId,
          words: seg.words,
        }));
    }

    return [];
  }, [items, translations, segments]);

  const currentItem = useMemo(() => {
    if (effectiveItems.length === 0) return null;

    // 1. Direct active segment matching first
    const exact = effectiveItems.find(
      (item) => currentTimeMs >= item.startMs && currentTimeMs <= item.endMs
    );
    if (exact) return exact;

    // 2. Buffer tolerance: start 40ms earlier and linger 120ms after
    return (
      effectiveItems.find(
        (item) => currentTimeMs >= item.startMs - 40 && currentTimeMs <= item.endMs + 120
      ) || null
    );
  }, [effectiveItems, currentTimeMs]);

  // Dynamically break long item into short natural breath phrases
  const currentBreathPhrase = useMemo(() => {
    if (!currentItem || !currentItem.text || !currentItem.text.trim()) return null;
    const phrases = splitIntoBreathPhrases(currentItem);
    if (!phrases || phrases.length === 0) {
      return {
        text: currentItem.text,
        startMs: currentItem.startMs,
        endMs: currentItem.endMs,
        words: currentItem.words || [],
      };
    }
    if (phrases.length === 1) return phrases[0];

    // Find the exact active breath phrase corresponding to current playback position
    const active = phrases.find(
      (p) => currentTimeMs >= p.startMs - 40 && currentTimeMs <= p.endMs + 100
    );
    if (active) return active;

    // Nearest fallback if inside a brief breath pause
    return phrases.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.startMs - currentTimeMs);
      const currDiff = Math.abs(curr.startMs - currentTimeMs);
      return currDiff < prevDiff ? curr : prev;
    }, phrases[0]);
  }, [currentItem, currentTimeMs]);

  if (!isVisible || !currentItem || !currentBreathPhrase || !currentBreathPhrase.text.trim()) {
    return null;
  }

  const verticalPositionClasses = {
    top: 'top-8',
    middle: 'top-1/2 -translate-y-1/2',
    bottom: 'bottom-8',
  };

  const posClass = verticalPositionClasses[style.alignment] || 'bottom-8';

  const animationClass =
    style.animation === 'pop'
      ? 'animate-caption-pop'
      : style.animation === 'fade-up'
      ? 'animate-caption-fade-up'
      : style.animation === 'zoom-in'
      ? 'animate-caption-zoom-in'
      : style.animation === 'highlight'
      ? 'animate-caption-highlight'
      : '';

  const hasBackground = style.backgroundColor && style.backgroundColor !== 'transparent';
  const paddingPx = style.backgroundPadding ?? (hasBackground ? 8 : 0);
  const radiusPx = style.borderRadius ?? (hasBackground ? 8 : 0);

  const isKaraoke = Boolean(style.karaokeEnabled);
  const karaokeStyle = style.karaokeStyle || 'bounce-pop';
  const activeColor = style.karaokeActiveColor || '#FFE600';
  const inactiveColor = style.karaokeInactiveColor || '#FFFFFF';
  const activeScale = style.karaokeActiveScale ?? 1.15;
  const activeBg = style.karaokeActiveBg || '#3B82F6';

  return (
    <div
      className={`absolute left-0 right-0 ${posClass} pointer-events-none flex justify-center px-8 z-30`}
    >
      <div
        key={`${currentItem.id}-${currentBreathPhrase.startMs}`}
        style={{
          fontFamily: style.fontFamily || "'Kantumruy Pro', 'Khmer OS Siemreap', sans-serif",
          fontSize: `${style.fontSize || 26}px`,
          fontWeight: style.fontWeight || 'bold',
          color: style.textColor || '#FFE600',
          backgroundColor: hasBackground ? style.backgroundColor : 'transparent',
          padding: hasBackground ? `${paddingPx}px ${paddingPx * 1.5}px` : undefined,
          borderRadius: hasBackground ? `${radiusPx}px` : undefined,
          WebkitTextStroke:
            style.outlineThickness > 0 && style.outlineColor !== 'transparent'
              ? `${style.outlineThickness}px ${style.outlineColor || '#000000'}`
              : undefined,
          paintOrder: 'stroke fill',
          textShadow:
            style.shadowBlur > 0 && style.shadowColor !== 'transparent'
              ? `${style.shadowColor || 'rgba(0,0,0,0.85)'} 0px 2px ${style.shadowBlur}px`
              : undefined,
          lineHeight: style.lineHeight || 1.4,
        }}
        className={`text-center font-bold font-khmer select-none max-w-[85%] break-words whitespace-pre-wrap transition-all ${animationClass}`}
      >
        {isKaraoke && currentBreathPhrase.words.length > 0 ? (
          <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            {currentBreathPhrase.words.map((w, idx) => {
              const isActive = currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
              const isPast = currentTimeMs > w.endMs;

              let wordColor = style.textColor;
              let wordScale = 1;
              let wordBg = 'transparent';
              let wordShadow = undefined;
              let wordOpacity = 1;

              if (karaokeStyle === 'bounce-pop') {
                if (isActive) {
                  wordColor = activeColor;
                  wordScale = activeScale;
                  wordShadow = `0 0 12px ${activeColor}, 0 2px 4px rgba(0,0,0,0.9)`;
                } else if (isPast) {
                  wordColor = activeColor;
                  wordOpacity = 0.95;
                } else {
                  wordColor = inactiveColor;
                  wordOpacity = 0.65;
                }
              } else if (karaokeStyle === 'color-fill') {
                if (isActive || isPast) {
                  wordColor = activeColor;
                  wordOpacity = 1;
                } else {
                  wordColor = inactiveColor;
                  wordOpacity = 0.5;
                }
              } else if (karaokeStyle === 'box') {
                if (isActive) {
                  wordBg = activeBg;
                  wordColor = activeColor;
                  wordScale = 1.05;
                } else {
                  wordColor = inactiveColor;
                  wordOpacity = isPast ? 0.9 : 0.6;
                }
              } else if (karaokeStyle === 'highlight') {
                if (isActive) {
                  wordColor = activeColor;
                  wordScale = 1.1;
                  wordShadow = `0 0 16px ${activeColor}`;
                } else {
                  wordColor = isPast ? activeColor : inactiveColor;
                  wordOpacity = isPast ? 0.9 : 0.6;
                }
              }

              return (
                <span
                  key={`${w.startMs}-${idx}`}
                  style={{
                    color: wordColor,
                    transform: wordScale !== 1 ? `scale(${wordScale})` : undefined,
                    backgroundColor: wordBg !== 'transparent' ? wordBg : undefined,
                    padding: wordBg !== 'transparent' ? '1px 6px' : undefined,
                    borderRadius: wordBg !== 'transparent' ? '4px' : undefined,
                    textShadow: wordShadow,
                    opacity: wordOpacity,
                    transition: 'all 0.1s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  className="inline-block transform-gpu"
                >
                  {w.word}
                </span>
              );
            })}
          </span>
        ) : (
          currentBreathPhrase.text
        )}
      </div>
    </div>
  );
};
