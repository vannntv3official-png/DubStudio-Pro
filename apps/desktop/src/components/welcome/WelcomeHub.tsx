import React, { useState } from 'react';
import {
  Film,
  Plus,
  FolderOpen,
  Sparkles,
  Play,
  ArrowRight,
  Clock,
  Languages,
  CheckCircle2,
  Video,
} from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '@/components/ui/Button';

interface WelcomeHubProps {
  onOpenNewProject: () => void;
}

export const WelcomeHub: React.FC<WelcomeHubProps> = ({ onOpenNewProject }) => {
  const { recentProjects, openProject, createProject, importMediaFile, isLoading } =
    useProjectStore();
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleOpenMedia = async () => {
    if (typeof window !== 'undefined' && window.dubstudio) {
      try {
        const selectedPath = await window.dubstudio.selectVideoFile();
        if (selectedPath) {
          // Automatically create a project named after the video file
          const fileName = selectedPath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || 'Dubbed Video';
          await createProject(`${fileName} Dub`, 'auto', 'km', 'balanced');
          await importMediaFile(selectedPath);
        }
      } catch (err: any) {
        console.error('Failed to open media file:', err);
      }
    }
  };

  const handleLoadDemo = async () => {
    setIsDemoLoading(true);
    try {
      if (typeof window !== 'undefined' && window.dubstudio) {
        const selectedPath = await window.dubstudio.selectVideoFile();
        if (selectedPath) {
          await createProject('Khmer Dubbing Demo', 'auto', 'km', 'balanced');
          await importMediaFile(selectedPath);
        }
      }
    } catch (e: any) {
      console.error('Failed to load demo:', e);
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center bg-gradient-to-b from-studio-bg via-studio-panel to-studio-bg px-6 py-8 overflow-y-auto select-none">
      <div className="max-w-3xl w-full flex flex-col items-center text-center gap-6 my-auto pt-6 pb-12 shrink-0">
        {/* Brand & Hero */}
        <div className="flex flex-col items-center gap-2 pt-2 shrink-0">
          <img
            src="/logo.png"
            alt="DubStudio Pro - AI Video Dubbing For A Global World"
            className="h-28 max-w-[340px] object-contain drop-shadow-[0_10px_25px_rgba(59,130,246,0.3)] shrink-0 hover:scale-[1.02] transition-transform duration-300"
          />
          <p className="text-xs text-studio-muted mt-1 max-w-md">
            Production-Grade AI Video Dubbing, Voice Cloning & Translation Studio for Windows Desktop
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Local Media Engine Ready
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Khmer (ភាសាខ្មែរ) Neural Support
            </span>
          </div>
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-2">
          {/* Card 1: New Project */}
          <button
            onClick={onOpenNewProject}
            className="flex flex-col items-start p-4 rounded-xl bg-studio-surface/80 hover:bg-studio-surface border border-studio-border hover:border-studio-accent/60 transition-all text-left group shadow-sm hover:shadow-md"
          >
            <div className="w-9 h-9 rounded-lg bg-studio-accent/15 border border-studio-accent/30 flex items-center justify-center text-studio-accent mb-3 group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <span className="font-semibold text-xs text-studio-text group-hover:text-studio-accent transition-colors">
              New Dubbing Project
            </span>
            <span className="text-[11px] text-studio-muted mt-1 leading-relaxed">
              Configure source dialogue and target voice languages with custom subtitle styling.
            </span>
            <span className="text-[10px] font-mono text-studio-muted bg-studio-subbg px-1.5 py-0.5 rounded mt-3 border border-studio-border">
              Ctrl + N
            </span>
          </button>

          {/* Card 2: Quick Open Video */}
          <button
            onClick={handleOpenMedia}
            className="flex flex-col items-start p-4 rounded-xl bg-studio-surface/80 hover:bg-studio-surface border border-studio-border hover:border-emerald-500/60 transition-all text-left group shadow-sm hover:shadow-md"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
              <FolderOpen className="w-5 h-5" />
            </div>
            <span className="font-semibold text-xs text-studio-text group-hover:text-emerald-400 transition-colors">
              Open Media File
            </span>
            <span className="text-[11px] text-studio-muted mt-1 leading-relaxed">
              Select an MP4, MOV, MKV, or WebM video to automatically generate a workspace.
            </span>
            <span className="text-[10px] font-mono text-studio-muted bg-studio-subbg px-1.5 py-0.5 rounded mt-3 border border-studio-border">
              Ctrl + I
            </span>
          </button>

          {/* Card 3: Demo Dubbing */}
          <button
            onClick={handleLoadDemo}
            disabled={isDemoLoading}
            className="flex flex-col items-start p-4 rounded-xl bg-studio-surface/80 hover:bg-studio-surface border border-studio-border hover:border-amber-500/60 transition-all text-left group shadow-sm hover:shadow-md"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-semibold text-xs text-studio-text group-hover:text-amber-400 transition-colors">
              Try Sample Project
            </span>
            <span className="text-[11px] text-studio-muted mt-1 leading-relaxed">
              Load a sample test clip to explore Edge TTS Khmer voices and multitrack editing.
            </span>
            <span className="text-[10px] font-mono text-studio-muted bg-studio-subbg px-1.5 py-0.5 rounded mt-3 border border-studio-border">
              Instant Demo
            </span>
          </button>
        </div>

        {/* Recent Projects List */}
        {recentProjects.length > 0 && (
          <div className="w-full flex flex-col items-start gap-2.5 mt-2 bg-studio-surface/40 p-4 rounded-xl border border-studio-border/70">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-studio-text">
              <Clock className="w-3.5 h-3.5 text-studio-muted" />
              <span>Recent Projects</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
              {Array.from(new Map(recentProjects.map((p) => [p.id, p])).values()).slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-studio-subbg hover:bg-studio-surface border border-studio-border/60 hover:border-studio-accent/40 cursor-pointer transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Video className="w-4 h-4 text-studio-muted group-hover:text-studio-accent shrink-0" />
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-medium text-studio-text truncate">{p.name}</span>
                      <span className="text-[10px] text-studio-muted uppercase">
                        {p.sourceLanguage} ➔ {p.targetLanguage} · {p.syncMode}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4-Step Dubbing Workflow Roadmap */}
        <div className="w-full flex flex-col items-center gap-3 pt-4 border-t border-studio-border/60">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-studio-muted">
            End-to-End AI Dubbing Workflow
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full text-left">
            <div className="p-2.5 rounded-lg bg-studio-subbg/50 border border-studio-border/40 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-blue-400">
                <span>1.</span>
                <span>Import Video</span>
              </div>
              <span className="text-[10px] text-studio-muted">
                Extracts lossless 48kHz WAV audio and builds waveform peaks.
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-studio-subbg/50 border border-studio-border/40 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-400">
                <span>2.</span>
                <span>AI Transcribe</span>
              </div>
              <span className="text-[10px] text-studio-muted">
                Gemini or Codecraft extracts dialogue segments & timestamps.
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-studio-subbg/50 border border-studio-border/40 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-purple-400">
                <span>3.</span>
                <span>Khmer Translation</span>
              </div>
              <span className="text-[10px] text-studio-muted">
                Translates with context preservation and terminology rules.
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-studio-subbg/50 border border-studio-border/40 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                <span>4.</span>
                <span>Voice & Export</span>
              </div>
              <span className="text-[10px] text-studio-muted">
                Edge TTS synthesis, audio time-stretching & MP4 export.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
