import React, { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks: number[];
  width: number;
  height: number;
  color?: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  peaks,
  width,
  height,
  color = '#10B981',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (!peaks || peaks.length === 0) return;

    ctx.fillStyle = color;
    const barWidth = 2;
    const gap = 1;
    const totalBars = Math.floor(width / (barWidth + gap));
    const step = peaks.length / totalBars;

    const midY = height / 2;

    for (let i = 0; i < totalBars; i++) {
      const peakIdx = Math.floor(i * step);
      const amp = peaks[peakIdx] || 0.05;
      const barHeight = Math.max(2, amp * height * 0.85);

      const x = i * (barWidth + gap);
      const y = midY - barHeight / 2;

      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }, [peaks, width, height, color]);

  return <canvas ref={canvasRef} width={width} height={height} className="pointer-events-none" />;
};
