import React, { useState, useEffect } from 'react';
import { Download, Type, Sparkles, Play, Pause, Check, Sliders, Film, Mic, Scissors, Loader2 } from 'lucide-react';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { api } from '@/services/api';
import { CAPTION_PRESETS, type CaptionPreset } from './presets';
import type { CaptionAnimationType, KaraokeStyleType } from '@dubstudio/shared-types';

export const SubtitleEditor: React.FC = () => {
  const { currentProject } = useProjectStore();
  const { style, updateStyle, items, splitAllByBreath } = useSubtitleStore();

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [previewKey, setPreviewKey] = useState<number>(0);
  const [isSplitting, setIsSplitting] = useState<boolean>(false);

  const handleSplitByBreath = async () => {
    if (!currentProject) return;
    setIsSplitting(true);
    try {
      await splitAllByBreath(currentProject.id);
    } catch (e: any) {
      alert(`Split error: ${e.message}`);
    } finally {
      setIsSplitting(false);
    }
  };

  // Live Karaoke Interactive Demo Simulation
  const sampleWords = ['សួស្តី', 'អ្នកទាំងអស់គ្នា!', 'Welcome', 'to', 'DubStudio', 'AI!'];
  const [karaokeActiveIdx, setKaraokeActiveIdx] = useState<number>(1);
  const [isPlayingKaraoke, setIsPlayingKaraoke] = useState<boolean>(true);

  useEffect(() => {
    if (!isPlayingKaraoke || !style.karaokeEnabled) return;
    const interval = setInterval(() => {
      setKaraokeActiveIdx((prev) => (prev + 1) % sampleWords.length);
    }, 550);
    return () => clearInterval(interval);
  }, [isPlayingKaraoke, style.karaokeEnabled, sampleWords.length]);

  const categories = ['All', 'TikTok', 'CapCut', 'Social', 'Cinema', 'Creative'];

  const filteredPresets =
    activeCategory === 'All'
      ? CAPTION_PRESETS
      : CAPTION_PRESETS.filter((p) => p.category === activeCategory);

  const handleApplyPreset = (preset: CaptionPreset) => {
    updateStyle({
      ...preset.style,
      presetId: preset.id,
      animation: preset.style.animation || 'pop',
    });
    setPreviewKey((k) => k + 1);
  };

  const handleAnimationChange = (anim: CaptionAnimationType) => {
    updateStyle({ animation: anim });
    setPreviewKey((k) => k + 1);
  };

  const handleExportSrt = async () => {
    if (!currentProject) return;
    try {
      const srtText = await api.exportSrt(currentProject.id);
      const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name || 'subtitles'}.srt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
  };

  const handleExportVtt = async () => {
    if (!currentProject) return;
    try {
      const vttText = await api.exportVtt(currentProject.id);
      const blob = new Blob([vttText], { type: 'text/vtt;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name || 'subtitles'}.vtt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
  };

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
  const activeBg = style.karaokeActiveBg || '#2563EB';

  return (
    <div className="flex flex-col h-full p-3 gap-4 overflow-y-auto select-none">
      {/* Export / Import Toolbar */}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handleExportSrt} className="flex-1">
          <Download className="w-3.5 h-3.5" />
          <span>Export SRT</span>
        </Button>
        <Button variant="secondary" size="sm" onClick={handleExportVtt} className="flex-1">
          <Download className="w-3.5 h-3.5" />
          <span>Export VTT</span>
        </Button>
      </div>

      {/* Breath Splitter Quick Action */}
      <button
        type="button"
        onClick={handleSplitByBreath}
        disabled={isSplitting || items.length === 0}
        title="បែងចែកកថាខណ្ឌវែងៗជាឃ្លាខ្លីៗតាមដង្ហើម និង Pauses"
        className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 transition-all text-xs group disabled:opacity-50"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            {isSplitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
          </div>
          <div className="flex flex-col text-left">
            <span className="font-semibold text-indigo-200 text-xs">កាត់ខ្លីតាមដង្ហើម (Split by Breath)</span>
            <span className="text-[10px] text-indigo-400/80">បែងចែកជាឃ្លាខ្លីៗ (3-6 ពាក្យ) តាមដង្ហើម & Timestamp ជាក់លាក់</span>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold">
          {items.length} items
        </span>
      </button>

      {/* Preset Caption Styles (CapCut / TikTok Templates) */}
      <div className="flex flex-col gap-2.5 p-3 bg-studio-subbg border border-studio-border rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-xs text-studio-text">
            <Sparkles className="w-4 h-4 text-studio-accent" />
            <span>Preset Caption Templates</span>
          </div>
          <span className="text-[10px] text-studio-muted">CapCut & TikTok Styles</span>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'bg-studio-accent text-white font-medium shadow-sm'
                  : 'bg-studio-panel text-studio-muted hover:text-studio-text hover:bg-studio-hover'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Preset Cards Grid */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          {filteredPresets.map((preset) => {
            const isSelected = style.presetId === preset.id;
            const pStyle = preset.style;
            const hasBg = pStyle.backgroundColor && pStyle.backgroundColor !== 'transparent';

            return (
              <div
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between gap-2 text-left relative overflow-hidden group ${
                  isSelected
                    ? 'border-studio-accent bg-studio-panel shadow-md ring-1 ring-studio-accent'
                    : 'border-studio-border bg-studio-panel/70 hover:bg-studio-panel hover:border-studio-accent/50'
                }`}
              >
                {/* Header: Name & Badge */}
                <div className="flex items-start justify-between gap-1">
                  <span className="font-semibold text-[11px] text-studio-text truncate">
                    {preset.name}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-studio-elevated text-studio-accent border border-studio-border shrink-0">
                    {preset.badge}
                  </span>
                </div>

                {/* Visual Typography Thumbnail */}
                <div className="h-12 rounded bg-black/90 flex items-center justify-center p-1.5 overflow-hidden">
                  <span
                    style={{
                      fontFamily: pStyle.fontFamily || 'Kantumruy Pro, sans-serif',
                      fontSize: '12px',
                      fontWeight: pStyle.fontWeight || 'bold',
                      color: pStyle.textColor || '#FFFFFF',
                      backgroundColor: hasBg ? pStyle.backgroundColor : 'transparent',
                      padding: hasBg ? '2px 6px' : undefined,
                      borderRadius: hasBg ? '4px' : undefined,
                      WebkitTextStroke:
                        (pStyle.outlineThickness || 0) > 0
                          ? `1px ${pStyle.outlineColor}`
                          : undefined,
                      paintOrder: 'stroke fill',
                      textShadow:
                        (pStyle.shadowBlur || 0) > 0
                          ? `${pStyle.shadowColor} 0px 1px 3px`
                          : undefined,
                    }}
                    className="font-khmer font-bold text-center truncate max-w-full"
                  >
                    {preset.sampleText}
                  </span>
                </div>

                {/* Footer status */}
                <div className="flex items-center justify-between text-[10px] text-studio-muted">
                  <span className="truncate max-w-[100px]">{preset.category}</span>
                  {isSelected && (
                    <span className="flex items-center text-studio-accent font-medium">
                      <Check className="w-3 h-3 mr-0.5" />
                      Active
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Word-by-Word Karaoke Section */}
      <div className="flex flex-col gap-3 p-3 bg-studio-subbg border border-studio-border rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-xs text-studio-text">
            <Mic className="w-4 h-4 text-studio-accent" />
            <span>Word-by-Word Highlight (Karaoke)</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer bg-studio-panel px-2.5 py-1 rounded-md border border-studio-border hover:border-studio-accent/50 transition-colors">
            <input
              type="checkbox"
              checked={isKaraoke}
              onChange={(e) => updateStyle({ karaokeEnabled: e.target.checked })}
              className="accent-studio-accent rounded w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-[11px] text-studio-text font-medium">
              {isKaraoke ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {isKaraoke && (
          <div className="flex flex-col gap-3 pt-1 animate-in fade-in duration-150">
            {/* Karaoke Style Selector */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'bounce-pop', label: 'Bounce Pop', desc: 'TikTok Pop' },
                { id: 'color-fill', label: 'Color Fill', desc: 'Karaoke Wipe' },
                { id: 'box', label: 'Pill Box', desc: 'CapCut Box' },
                { id: 'highlight', label: 'Neon Glow', desc: 'Cyber Aura' },
              ].map((kStyle) => {
                const isSelected = karaokeStyle === kStyle.id;
                return (
                  <button
                    key={kStyle.id}
                    onClick={() => updateStyle({ karaokeStyle: kStyle.id as KaraokeStyleType })}
                    className={`p-1.5 rounded-lg border text-center flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'border-studio-accent bg-studio-panel text-studio-accent font-semibold shadow-sm'
                        : 'border-studio-border bg-studio-panel/50 text-studio-muted hover:text-studio-text hover:bg-studio-panel'
                    }`}
                  >
                    <span className="text-[10px] font-medium leading-none">{kStyle.label}</span>
                    <span className="text-[8px] text-studio-muted mt-1 leading-none">{kStyle.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Color & Scale Controls */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-studio-muted">Active Word Color</span>
                <input
                  type="color"
                  value={activeColor.startsWith('#') ? activeColor : '#FFE600'}
                  onChange={(e) => updateStyle({ karaokeActiveColor: e.target.value })}
                  className="h-8 w-full bg-studio-panel border border-studio-border rounded cursor-pointer"
                />
              </div>

              {karaokeStyle === 'box' ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-studio-muted">Pill Box Background</span>
                  <input
                    type="color"
                    value={activeBg.startsWith('#') ? activeBg : '#2563EB'}
                    onChange={(e) => updateStyle({ karaokeActiveBg: e.target.value })}
                    className="h-8 w-full bg-studio-panel border border-studio-border rounded cursor-pointer"
                  />
                </div>
              ) : (
                <Slider
                  label="Word Scale Effect"
                  min={1.0}
                  max={1.3}
                  step={0.05}
                  value={activeScale}
                  valueDisplay={`${Math.round(activeScale * 100)}%`}
                  onChange={(e) => updateStyle({ karaokeActiveScale: parseFloat(e.target.value) })}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Animation Template Selector */}
      <div className="flex flex-col gap-2 p-3 bg-studio-subbg border border-studio-border rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-xs text-studio-text">
            <Film className="w-4 h-4 text-studio-accent" />
            <span>Caption Entrance Animation</span>
          </div>
          <button
            onClick={() => setPreviewKey((k) => k + 1)}
            title="Replay animation in preview"
            className="text-[11px] text-studio-accent hover:underline flex items-center gap-1 font-medium"
          >
            <Play className="w-3 h-3" />
            Replay
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {[
            { id: 'pop', label: 'Pop Bounce', desc: 'TikTok energetic' },
            { id: 'fade-up', label: 'Fade Up', desc: 'Smooth cinema' },
            { id: 'zoom-in', label: 'Zoom In', desc: 'Punchy scaling' },
            { id: 'highlight', label: 'Glow Pulse', desc: 'Neon highlight' },
            { id: 'none', label: 'None', desc: 'Static cut' },
          ].map((anim) => {
            const isSelected = (style.animation || 'pop') === anim.id;
            return (
              <button
                key={anim.id}
                onClick={() => handleAnimationChange(anim.id as CaptionAnimationType)}
                className={`py-2 px-1.5 rounded-lg border text-center flex flex-col items-center justify-center transition-all ${
                  isSelected
                    ? 'border-studio-accent bg-studio-panel text-studio-accent font-semibold shadow-sm'
                    : 'border-studio-border bg-studio-panel/50 text-studio-muted hover:text-studio-text hover:bg-studio-panel'
                }`}
              >
                <span className="text-[11px] font-medium leading-none">{anim.label}</span>
                <span className="text-[9px] text-studio-muted mt-1 leading-none">{anim.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Preview Box */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-studio-muted">
          <span>Live Template Preview</span>
          {isKaraoke ? (
            <button
              onClick={() => setIsPlayingKaraoke(!isPlayingKaraoke)}
              className="text-[11px] text-studio-accent hover:underline flex items-center gap-1"
            >
              {isPlayingKaraoke ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isPlayingKaraoke ? 'Pause Karaoke Demo' : 'Play Karaoke Demo'}</span>
            </button>
          ) : (
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="text-[11px] text-studio-accent hover:underline"
            >
              Click to re-animate
            </button>
          )}
        </div>

        <div
          onClick={() => {
            setPreviewKey((k) => k + 1);
            if (isKaraoke) {
              setKaraokeActiveIdx((prev) => (prev + 1) % sampleWords.length);
            }
          }}
          className="h-28 rounded-xl bg-black/95 border border-studio-border flex items-center justify-center p-4 cursor-pointer overflow-hidden relative group"
        >
          <div
            key={previewKey}
            style={{
              fontFamily: style.fontFamily,
              fontSize: `${style.fontSize}px`,
              fontWeight: style.fontWeight || 'bold',
              color: style.textColor,
              backgroundColor: hasBackground ? style.backgroundColor : 'transparent',
              padding: hasBackground ? `${paddingPx}px ${paddingPx * 1.5}px` : undefined,
              borderRadius: hasBackground ? `${radiusPx}px` : undefined,
              WebkitTextStroke:
                style.outlineThickness > 0 && style.outlineColor !== 'transparent'
                  ? `${style.outlineThickness}px ${style.outlineColor}`
                  : undefined,
              paintOrder: 'stroke fill',
              textShadow:
                style.shadowBlur > 0 && style.shadowColor !== 'transparent'
                  ? `${style.shadowColor} 0px 2px ${style.shadowBlur}px`
                  : undefined,
              lineHeight: style.lineHeight,
            }}
            className={`text-center font-bold font-khmer select-none max-w-[90%] break-words whitespace-pre-wrap ${animationClass}`}
          >
            {isKaraoke ? (
              <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {sampleWords.map((word, idx) => {
                  const isActive = idx === karaokeActiveIdx;
                  const isPast = idx < karaokeActiveIdx;

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
                      key={`${word}-${idx}`}
                      style={{
                        color: wordColor,
                        transform: wordScale !== 1 ? `scale(${wordScale})` : undefined,
                        backgroundColor: wordBg !== 'transparent' ? wordBg : undefined,
                        padding: wordBg !== 'transparent' ? '1px 6px' : undefined,
                        borderRadius: wordBg !== 'transparent' ? '4px' : undefined,
                        textShadow: wordShadow,
                        opacity: wordOpacity,
                        transition: 'all 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      className="inline-block transform-gpu"
                    >
                      {word}
                    </span>
                  );
                })}
              </span>
            ) : (
              'សួស្តីអ្នកទាំងអស់គ្នា! Hello World!'
            )}
          </div>

          <div className="absolute bottom-1 right-2 text-[10px] text-white/40 opacity-0 group-hover:opacity-100 transition-opacity">
            {isKaraoke ? 'Click to advance word' : 'Click to re-animate'}
          </div>
        </div>
      </div>

      {/* Manual Fine-Tuning Controls */}
      <div className="flex flex-col gap-3 p-3 bg-studio-subbg border border-studio-border rounded-xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-studio-text">
          <Sliders className="w-4 h-4 text-studio-accent" />
          <span>Custom Fine-Tuning</span>
        </div>

        <Select
          label="Font Family"
          options={[
            {
              value: "'Kantumruy Pro', 'Khmer OS Siemreap', 'Khmer OS', 'Segoe UI', sans-serif",
              label: 'Kantumruy Pro (Khmer & English Default)',
            },
            {
              value: "'Khmer OS Siemreap', 'Kantumruy Pro', sans-serif",
              label: 'Khmer OS Siemreap (Classic Clean)',
            },
            {
              value: "'Khmer OS Battambang', 'Kantumruy Pro', sans-serif",
              label: 'Khmer OS Battambang',
            },
            {
              value: "'Khmer OS Muol Light', 'Kantumruy Pro', serif",
              label: 'Khmer OS Muol (Headline Style)',
            },
            { value: 'Inter, sans-serif', label: 'Inter (English)' },
            { value: 'Arial, sans-serif', label: 'Arial' },
          ]}
          value={style.fontFamily}
          onChange={(e) => updateStyle({ fontFamily: e.target.value })}
        />

        <Slider
          label="Font Size (px)"
          min={16}
          max={48}
          value={style.fontSize}
          valueDisplay={`${style.fontSize}px`}
          onChange={(e) => updateStyle({ fontSize: parseInt(e.target.value, 10) })}
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-studio-muted">Text Color</span>
            <input
              type="color"
              value={style.textColor.startsWith('#') ? style.textColor : '#FFFFFF'}
              onChange={(e) => updateStyle({ textColor: e.target.value, presetId: undefined })}
              className="h-8 w-full bg-studio-panel border border-studio-border rounded cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-studio-muted">Outline Color</span>
            <input
              type="color"
              value={style.outlineColor.startsWith('#') ? style.outlineColor : '#000000'}
              onChange={(e) => updateStyle({ outlineColor: e.target.value, presetId: undefined })}
              className="h-8 w-full bg-studio-panel border border-studio-border rounded cursor-pointer"
            />
          </div>
        </div>

        <Slider
          label="Outline Thickness"
          min={0}
          max={4}
          step={0.5}
          value={style.outlineThickness}
          valueDisplay={`${style.outlineThickness}px`}
          onChange={(e) => updateStyle({ outlineThickness: parseFloat(e.target.value) })}
        />

        <Select
          label="Vertical Alignment"
          options={[
            { value: 'bottom', label: 'Bottom (Default)' },
            { value: 'middle', label: 'Center / Middle' },
            { value: 'top', label: 'Top' },
          ]}
          value={style.alignment}
          onChange={(e) => updateStyle({ alignment: e.target.value as any })}
        />
      </div>
    </div>
  );
};
