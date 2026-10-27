import React, { useState } from 'react';
import { Download, CheckCircle2, Folder, Loader2, AlertCircle, Volume2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';
import type { ExportConfig } from '@dubstudio/shared-types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { currentProject, setActiveJob, activeJob } = useProjectStore();

  const [resolution, setResolution] = useState<'720p' | '1080p' | '1440p' | '4k'>('1080p');
  const [videoCodec, setVideoCodec] = useState<'h264' | 'hevc'>('h264');
  const [burnInSubtitles, setBurnInSubtitles] = useState(true);
  const [exportSidecar, setExportSidecar] = useState(false);
  const [includeOriginalAudio, setIncludeOriginalAudio] = useState(true);
  const [originalAudioVolume, setOriginalAudioVolume] = useState(15); // 15% background default
  const [dubbedAudioVolume, setDubbedAudioVolume] = useState(125); // 125% clear speech default
  const [outputPath, setOutputPath] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null);

  const handleSelectDestination = async () => {
    if (typeof window !== 'undefined' && window.dubstudio) {
      const defaultName = `${currentProject?.name || 'Dubbed_Video'}_${resolution}.mp4`;
      const path = await window.dubstudio.selectSavePath(defaultName, ['mp4', 'mkv', 'mov']);
      if (path) {
        setOutputPath(path);
      }
    }
  };

  const handleStartExport = async () => {
    if (!currentProject) return;

    let targetPath = outputPath;
    if (!targetPath) {
      // Default export location inside project exports directory
      targetPath = `${currentProject.projectDir}\\exports\\${currentProject.name || 'dubbed_video'}_${resolution}.mp4`;
    }

    const config: ExportConfig = {
      projectId: currentProject.id,
      resolution,
      videoCodec,
      audioCodec: 'aac',
      outputFilePath: targetPath,
      burnInSubtitles,
      exportSubtitlesSidecar: exportSidecar,
      subtitlesSidecarFormat: 'srt',
      includeOriginalAudio,
      originalAudioVolume: originalAudioVolume / 100.0,
      dubbedAudioVolume: dubbedAudioVolume / 100.0,
      backgroundMusicVolume: currentProject.audioSettings?.backgroundVolume ?? 0.3,
    };

    setIsExporting(true);
    setExportedFilePath(null);

    try {
      const job = await api.startExport(config);
      setActiveJob(job);
      setExportedFilePath(targetPath);
    } catch (e: any) {
      alert(`Export failed to start: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenFolder = () => {
    if (exportedFilePath && typeof window !== 'undefined' && window.dubstudio) {
      window.dubstudio.showItemInFolder(exportedFilePath);
    }
  };

  const isJobExporting = Boolean(activeJob && activeJob.type === 'video_export' && activeJob.status === 'running');
  const isJobComplete = Boolean(activeJob && activeJob.type === 'video_export' && activeJob.status === 'completed');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Finished Dubbed Video" maxWidth="lg">
      <div className="flex flex-col gap-4 text-xs">
        {/* Preset Settings */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Resolution Preset"
            options={[
              { value: '720p', label: '720p HD (1280x720)' },
              { value: '1080p', label: '1080p Full HD (1920x1080 - Default)' },
              { value: '1440p', label: '1440p 2K (2560x1440)' },
              { value: '4k', label: '4K Ultra HD (3840x2160)' },
            ]}
            value={resolution}
            onChange={(e) => setResolution(e.target.value as any)}
          />

          <Select
            label="Video Codec"
            options={[
              { value: 'h264', label: 'H.264 / AVC (Most Compatible)' },
              { value: 'hevc', label: 'H.265 / HEVC (High Efficiency)' },
            ]}
            value={videoCodec}
            onChange={(e) => setVideoCodec(e.target.value as any)}
          />
        </div>

        {/* Subtitle Options */}
        <div className="flex flex-col gap-2 p-3 rounded bg-studio-subbg border border-studio-border">
          <span className="font-semibold text-studio-text">Subtitle Rendering</span>
          <label className="flex items-center gap-2 cursor-pointer text-studio-text">
            <input
              type="checkbox"
              checked={burnInSubtitles}
              onChange={(e) => setBurnInSubtitles(e.target.checked)}
              className="accent-studio-accent rounded"
            />
            <span>Burn-in subtitles directly into video frames (Khmer OS Siemreap / Kantumruy Pro)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-studio-text">
            <input
              type="checkbox"
              checked={exportSidecar}
              onChange={(e) => setExportSidecar(e.target.checked)}
              className="accent-studio-accent rounded"
            />
            <span>Export sidecar SRT subtitle file alongside video</span>
          </label>
        </div>

        {/* Audio Mixing & Dubbing Controls */}
        <div className="flex flex-col gap-3 p-3 rounded bg-studio-subbg border border-studio-border">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-studio-text flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-studio-accent" />
              <span>ការកំណត់សម្លេង (Audio Mixing)</span>
            </span>
            <span className="text-[10px] text-studio-muted">គ្រប់គ្រងកម្រិតសម្លេងដែលត្រូវ Export</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-studio-text">
            <input
              type="checkbox"
              checked={includeOriginalAudio}
              onChange={(e) => setIncludeOriginalAudio(e.target.checked)}
              className="accent-studio-accent rounded"
            />
            <span className="font-medium">លាយសម្លេងវីដេអូដើមជាផ្ទៃខាងក្រោយ (Include Original Audio)</span>
          </label>

          {includeOriginalAudio && (
            <div className="flex flex-col gap-1 pl-5">
              <div className="flex justify-between text-[11px] text-studio-muted">
                <span>កម្រិតសម្លេងវីដេអូដើម (Original Background Audio)</span>
                <span className="font-mono text-studio-accent font-semibold">{originalAudioVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={originalAudioVolume}
                onChange={(e) => setOriginalAudioVolume(Number(e.target.value))}
                className="w-full h-1 accent-studio-accent bg-studio-surface rounded appearance-none cursor-pointer"
              />
              <span className="text-[10px] text-studio-muted/70">
                (ណែនាំ ១០% - ២០% ដើម្បីកុំឱ្យបាំងសម្លេងនិយាយខ្មែរ)
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-studio-muted">
              <span>កម្រិតសម្លេងបកប្រែដែលបាន Generate (Dubbed Voice Volume)</span>
              <span className="font-mono text-studio-accent font-semibold">{dubbedAudioVolume}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={dubbedAudioVolume}
              onChange={(e) => setDubbedAudioVolume(Number(e.target.value))}
              className="w-full h-1 accent-studio-accent bg-studio-surface rounded appearance-none cursor-pointer"
            />
            <span className="text-[10px] text-studio-muted/70">
              (ណែនាំ ១០០% - ១៥០% ដើម្បីឱ្យសម្លេងខ្មែរលឺច្បាស់ល្អ)
            </span>
          </div>
        </div>

        {/* Destination Path */}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-studio-muted">Output Destination</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={outputPath || (currentProject ? `${currentProject.projectDir}\\exports\\...` : '')}
              placeholder="Select output file..."
              className="flex-1 h-9 px-3 rounded bg-studio-subbg border border-studio-border text-xs text-studio-text"
            />
            <Button variant="secondary" size="sm" onClick={handleSelectDestination}>
              <Folder className="w-3.5 h-3.5" />
              <span>Browse...</span>
            </Button>
          </div>
        </div>

        {/* Progress or Status */}
        {activeJob && activeJob.type === 'video_export' && (
          <div className="flex flex-col gap-2 p-3 rounded bg-studio-surface border border-studio-border">
            <div className="flex items-center justify-between font-medium">
              <span className="text-studio-text">{activeJob.message || 'Processing video render...'}</span>
              <span className="font-mono text-studio-accent font-bold">{Math.round(activeJob.progress)}%</span>
            </div>
            <div className="w-full h-2 bg-studio-panel rounded-full overflow-hidden">
              <div
                style={{ width: `${activeJob.progress}%` }}
                className="h-full bg-studio-accent transition-all duration-300"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-studio-border mt-2">
          {isJobComplete ? (
            <Button variant="secondary" size="sm" onClick={handleOpenFolder}>
              <Folder className="w-3.5 h-3.5" />
              <span>Show in Explorer</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isJobExporting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleStartExport}
              isLoading={isExporting || isJobExporting}
            >
              <Download className="w-4 h-4" />
              <span>{isJobExporting ? 'Rendering...' : 'Start Video Export'}</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
