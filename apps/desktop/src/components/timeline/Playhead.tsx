import React from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { usePlayerStore } from '@/stores/playerStore';

export const Playhead: React.FC = () => {
  const { zoomLevel } = useTimelineStore();
  const { currentTimeMs, setCurrentTimeMs } = usePlayerStore();

  const leftPx = (currentTimeMs / 1000) * zoomLevel;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const startX = e.clientX;
    const initialTime = currentTimeMs;

    const handlePointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaMs = (deltaX / zoomLevel) * 1000;
      setCurrentTimeMs(Math.max(0, initialTime + deltaMs));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handleUp);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div
      style={{ left: `${leftPx}px` }}
      className="absolute -top-7 bottom-0 w-px bg-cyan-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(34,211,238,0.5)]"
    >
      {/* Playhead Cap in Ruler */}
      <div
        onPointerDown={handlePointerDown}
        className="w-4 h-5 bg-gradient-to-b from-cyan-400 to-blue-500 rounded-t-sm pointer-events-auto cursor-ew-resize shadow-lg hover:scale-110 active:scale-95 transition-transform top-0 -translate-x-[7.5px] absolute flex flex-col items-center justify-center"
        title={`Playhead: ${(currentTimeMs / 1000).toFixed(2)}s`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
        <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[4px] border-t-blue-500 mt-0.5" />
      </div>
    </div>
  );
};
