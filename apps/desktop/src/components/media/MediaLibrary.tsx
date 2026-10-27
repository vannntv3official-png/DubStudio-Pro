import React from 'react';
import { UploadCloud, Film, Music, FileVideo, CheckCircle2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '@/components/ui/Button';

export const MediaLibrary: React.FC = () => {
  const { currentProject, mediaAssets, importMediaFile, isLoading } = useProjectStore();

  const handleSelectFile = async () => {
    if (typeof window !== 'undefined' && window.dubstudio) {
      const selected = await window.dubstudio.selectVideoFile();
      if (selected) {
        await importMediaFile(selected);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // Electron native file path
      const filePath = (file as any).path;
      if (filePath) {
        await importMediaFile(filePath);
      }
    }
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-y-auto">
      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={handleSelectFile}
        className="border-2 border-dashed border-studio-border hover:border-studio-accent rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-studio-subbg/50 hover:bg-studio-subbg"
      >
        <UploadCloud className="w-8 h-8 text-studio-accent mb-2" />
        <span className="text-xs font-semibold text-studio-text">Import Media</span>
        <span className="text-[11px] text-studio-muted mt-0.5">Drag & drop video (MP4, MOV, MKV, WebM)</span>
      </div>

      {/* Asset List */}
      <div className="flex flex-col gap-2 mt-1">
        <span className="text-xs font-bold uppercase tracking-wider text-studio-muted">Project Assets ({mediaAssets.length})</span>

        {mediaAssets.length === 0 ? (
          <div className="text-xs text-studio-muted text-center py-8">No media assets imported yet.</div>
        ) : (
          mediaAssets.map((asset) => (
            <div
              key={asset.id}
              className="p-2.5 rounded bg-studio-subbg border border-studio-border flex flex-col gap-2 group hover:border-studio-accent/50 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-12 h-10 rounded bg-studio-surface border border-studio-border flex items-center justify-center shrink-0">
                  <Film className="w-5 h-5 text-studio-accent" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium text-studio-text truncate" title={asset.filename}>
                    {asset.filename}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-studio-muted mt-0.5">
                    <span>{formatDuration(asset.durationMs)}</span>
                    {asset.metadata?.video && (
                      <>
                        <span>•</span>
                        <span>{asset.metadata.video.width}x{asset.metadata.video.height}</span>
                        <span>•</span>
                        <span>{asset.metadata.video.fps} fps</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Codecs & Audio tags */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {asset.metadata?.video?.codec && (
                  <span className="px-1.5 py-0.5 bg-studio-surface text-[10px] font-mono text-studio-muted rounded uppercase">
                    {asset.metadata.video.codec}
                  </span>
                )}
                {asset.metadata?.audio?.codec && (
                  <span className="px-1.5 py-0.5 bg-studio-surface text-[10px] font-mono text-studio-muted rounded uppercase">
                    {asset.metadata.audio.codec}
                  </span>
                )}
                {asset.extractedAudioPath && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-studio-success/10 text-[10px] text-studio-success rounded">
                    <CheckCircle2 className="w-3 h-3" />
                    Audio extracted
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
