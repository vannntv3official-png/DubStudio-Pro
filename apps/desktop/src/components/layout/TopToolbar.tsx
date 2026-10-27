import React, { useState } from 'react';
import {
  Film,
  FolderOpen,
  Save,
  Download,
  Settings,
  Undo2,
  Redo2,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
} from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';

interface TopToolbarProps {
  onOpenNewProject: () => void;
  onOpenExportModal: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  onOpenNewProject,
  onOpenExportModal,
}) => {
  const { currentProject, activeJob, importMediaFile } = useProjectStore();
  const { undo, redo, history } = useTimelineStore();
  const { settings, openModal: openSettingsModal, openGeminiPoolModal } = useSettingsStore();

  const geminiKeysCount = settings.aiProviders.geminiApiKeys?.length || (settings.aiProviders.geminiApiKey ? 1 : 0);

  const handleImportClick = async () => {
    if (typeof window !== 'undefined' && window.dubstudio) {
      const selectedPath = await window.dubstudio.selectVideoFile();
      if (selectedPath) {
        await importMediaFile(selectedPath);
      }
    }
  };

  return (
    <header className="h-12 bg-studio-panel border-b border-studio-border flex items-center justify-between px-3 select-none">
      {/* Left: App Branding & Project Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2 py-1 bg-studio-surface border border-studio-border/80 rounded-lg shadow-sm">
          <img src="/icon.png" alt="DubStudio Pro" className="w-5 h-5 object-contain" />
          <span className="font-bold text-xs tracking-wider uppercase text-studio-text flex items-center gap-1">
            DubStudio <span className="text-studio-accent font-extrabold">Pro</span>
          </span>
        </div>

        <div className="h-4 w-px bg-studio-border" />

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onOpenNewProject} title="New Project (Ctrl+N)">
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={handleImportClick} title="Import Media (Ctrl+I)">
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Import</span>
          </Button>
        </div>

        <div className="h-4 w-px bg-studio-border" />

        {currentProject ? (
          <div className="flex items-center gap-2 px-2.5 py-1 bg-studio-surface border border-studio-border rounded-lg text-xs">
            <span className="font-semibold text-studio-text truncate max-w-[180px]" title={currentProject.name}>
              {currentProject.name}
            </span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-studio-accent/15 text-studio-accent border border-studio-accent/30 font-bold">
              {currentProject.sourceLanguage} ➔ {currentProject.targetLanguage}
            </span>
          </div>
        ) : (
          <span className="text-xs text-studio-muted flex items-center gap-1.5 italic">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            No Project Open
          </span>
        )}
      </div>

      {/* Center: Active Job Status Bar or Engine Status */}
      <div className="flex items-center gap-3">
        {activeJob ? (
          <div className="flex items-center gap-2.5 px-3 py-1 bg-studio-surface border border-studio-border rounded-full text-xs shadow-sm">
            {activeJob.status === 'running' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-studio-accent" />
            ) : activeJob.status === 'completed' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-studio-success" />
            ) : activeJob.status === 'failed' ? (
              <AlertCircle className="w-3.5 h-3.5 text-studio-error" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-studio-muted" />
            )}
            <span className="text-studio-text truncate max-w-[280px]">{activeJob.message || activeJob.type}</span>
            <span className="font-mono text-studio-accent font-semibold">{Math.round(activeJob.progress)}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium hidden sm:inline">AI Media Engine Online</span>
          </div>
        )}
      </div>

      {/* Right: Actions (Undo/Redo, Settings, Export) */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={undo}
          disabled={history.past.length === 0}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={redo}
          disabled={history.future.length === 0}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </Button>

        <div className="h-4 w-px bg-studio-border" />

        <Button
          variant="ghost"
          size="sm"
          onClick={openGeminiPoolModal}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-studio-text hover:text-studio-accent font-medium rounded-lg hover:bg-studio-surface transition-colors"
          title="Gemini API Keys Pool (Auto-Rotation & Failover)"
        >
          <Key className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden lg:inline">Keys Pool</span>
          {geminiKeysCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              {geminiKeysCount}
            </span>
          )}
        </Button>

        <Button variant="ghost" size="icon" onClick={openSettingsModal} title="Settings">
          <Settings className="w-4 h-4" />
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={onOpenExportModal}
          disabled={!currentProject}
          title="Export Dubbed Video (Ctrl+E)"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </Button>
      </div>
    </header>
  );
};
