import React, { useRef, useState } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { usePlayerStore } from '@/stores/playerStore';

interface TimelineRulerProps {
  totalDurationMs: number;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({ totalDurationMs }) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const { zoomLevel } = useTimelineStore();
  const { setCurrentTimeMs, currentTimeMs } = usePlayerStore();
  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const totalWidthPx = Math.max(1000, (totalDurationMs / 1000) * zoomLevel + 400);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handleMove = (ev: PointerEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const timeMs = Math.max(0, Math.min(totalDurationMs, (x / zoomLevel) * 1000));
      setCurrentTimeMs(timeMs);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    handleMove(e.nativeEvent);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeMs = Math.max(0, Math.min(totalDurationMs, (x / zoomLevel) * 1000));
    setHoverTimeMs(timeMs);
    setHoverX(x);
  };

  const handlePointerLeave = () => {
    setHoverTimeMs(null);
    setHoverX(null);
  };

  // Determine tick interval in seconds based on zoom
  let tickIntervalSec = 1;
  let minorTicksPerInterval = 5;

  if (zoomLevel < 35) {
    tickIntervalSec = 10;
    minorTicksPerInterval = 2;
  } else if (zoomLevel < 70) {
    tickIntervalSec = 5;
    minorTicksPerInterval = 5;
  } else if (zoomLevel < 140) {
    tickIntervalSec = 1;
    minorTicksPerInterval = 4;
  } else if (zoomLevel < 280) {
    tickIntervalSec = 0.5;
    minorTicksPerInterval = 5;
  } else {
    tickIntervalSec = 0.2;
    minorTicksPerInterval = 4;
  }

  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (tickIntervalSec < 1) {
      return `${m}:${s.toFixed(1).padStart(4, '0')}`;
    }
    return `${m}:${Math.floor(s).toString().padStart(2, '0')}`;
  };

  const formatHoverTimecode = (ms: number) => {
    const totalSec = ms / 1000;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const milli = Math.floor(ms % 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${milli.toString().padStart(3, '0')}`;
  };

  const totalSec = Math.ceil(totalDurationMs / 1000);
  const majorTicks = [];
  const minorTicks = [];

  for (let sec = 0; sec <= totalSec + 5; sec += tickIntervalSec) {
    const leftPx = sec * zoomLevel;
    majorTicks.push({
      leftPx,
      label: formatTimecode(sec),
      isMinute: Math.abs(sec % 60) < 0.001,
    });

    const step = tickIntervalSec / minorTicksPerInterval;
    for (let i = 1; i < minorTicksPerInterval; i++) {
      const minorSec = sec + i * step;
      minorTicks.push(minorSec * zoomLevel);
    }
  }

  return (
    <div
      ref={rulerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ width: `${totalWidthPx}px` }}
      className="h-7 bg-studio-panel/90 border-b border-studio-border relative cursor-pointer select-none overflow-visible group/ruler"
    >
      {/* Minor Ticks */}
      {minorTicks.map((px, idx) => (
        <div
          key={`min-${idx}`}
          style={{ left: `${px}px` }}
          className="absolute bottom-0 h-1.5 w-px bg-studio-border/50 pointer-events-none"
        />
      ))}

      {/* Major Ticks & Labels */}
      {majorTicks.map((t, idx) => (
        <div
          key={`maj-${idx}`}
          style={{ left: `${t.leftPx}px` }}
          className="absolute top-0 bottom-0 flex flex-col justify-end pb-0.5 pointer-events-none"
        >
          <div className={`w-px ${t.isMinute ? 'h-3.5 bg-studio-accent' : 'h-2.5 bg-studio-border'}`} />
          <span
            className={`text-[9px] font-mono absolute -top-0.5 left-1 leading-none ${
              t.isMinute ? 'text-studio-accent font-semibold' : 'text-studio-muted'
            }`}
          >
            {t.label}
          </span>
        </div>
      ))}

      {/* Hover Time Indicator Tooltip */}
      {hoverX !== null && hoverTimeMs !== null && (
        <div
          style={{ left: `${hoverX}px` }}
          className="absolute -top-6 -translate-x-1/2 bg-black/90 text-white font-mono text-[10px] px-1.5 py-0.5 rounded shadow-lg border border-white/20 pointer-events-none z-40 whitespace-nowrap"
        >
          {formatHoverTimecode(hoverTimeMs)}
        </div>
      )}
    </div>
  );
};
