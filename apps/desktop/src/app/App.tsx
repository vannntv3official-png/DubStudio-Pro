import React, { useEffect, useState } from 'react';
import { TopToolbar } from '@/components/layout/TopToolbar';
import { LeftWorkspace } from '@/components/layout/LeftWorkspace';
import { RightInspector } from '@/components/layout/RightInspector';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { WelcomeHub } from '@/components/welcome/WelcomeHub';
import { TimelineEditor } from '@/components/timeline/TimelineEditor';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { ExportModal } from '@/components/export/ExportModal';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { GeminiKeyPoolModal } from '@/components/settings/GeminiKeyPoolModal';
import { JobStatusToast } from '@/components/layout/JobStatusToast';
import { useProjectStore } from '@/stores/projectStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { useTranslationStore } from '@/stores/translationStore';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { initBackendConnection, updateBackendConnection, getBackendUrl, getAuthToken, api } from '@/services/api';
import { jobEventService } from '@/services/sse';

export const App: React.FC = () => {
  const { currentProject, loadRecentProjects, recentProjects, openProject, setActiveJob, importMediaFile } =
    useProjectStore();
  const { togglePlay } = usePlayerStore();
  const { undo, redo, saveTimeline } = useTimelineStore();
  const { loadTranscript } = useTranscriptStore();
  const { loadTranslations } = useTranslationStore();
  const { loadSubtitles } = useSubtitleStore();
  const { loadSettings } = useSettingsStore();

  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Initialize backend connection, settings, and job event stream
  useEffect(() => {
    initBackendConnection().then(() => {
      loadSettings();
      loadRecentProjects();
      jobEventService.start(getBackendUrl(), getAuthToken());

      const unsubscribe = jobEventService.subscribe((job) => {
        setActiveJob(job);
        if (job.status === 'completed') {
          const activeProj = useProjectStore.getState().currentProject;
          const targetProjId = job.projectId || (job as any).project_id || activeProj?.id;
          if (targetProjId && activeProj && activeProj.id === targetProjId) {
            // Immediate real-time refresh of ALL project data
            loadTranscript(targetProjId);
            loadTranslations(targetProjId);
            loadSubtitles(targetProjId);
            useProjectStore.getState().openProject(targetProjId);
            useTimelineStore.getState().loadTimeline(targetProjId);
          }
        }
      });

      // Listen for backend restart events from Electron
      let unsubRestart: (() => void) | undefined;
      if (typeof window !== 'undefined' && window.dubstudio?.onBackendRestarted) {
        unsubRestart = window.dubstudio.onBackendRestarted((info) => {
          console.log('[App] Received backend restart event:', info);
          updateBackendConnection(info.host, info.port, info.token);
          jobEventService.start(getBackendUrl(), getAuthToken());
        });
      }

      return () => {
        if (unsubRestart) unsubRestart();
        unsubscribe();
        jobEventService.stop();
      };
    });
  }, []);

  // Real-time job status poller fallback (guarantees UI updates even if SSE is interrupted)
  const activeJob = useProjectStore((s) => s.activeJob);
  useEffect(() => {
    if (!activeJob || (activeJob.status !== 'running' && activeJob.status !== 'queued')) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const latest = await api.getJob(activeJob.id);
        setActiveJob(latest);
        if (latest.status === 'completed') {
          const activeProj = useProjectStore.getState().currentProject;
          const targetProjId = latest.projectId || (latest as any).project_id || activeProj?.id;
          if (targetProjId && activeProj && activeProj.id === targetProjId) {
            loadTranscript(targetProjId);
            loadTranslations(targetProjId);
            loadSubtitles(targetProjId);
            useProjectStore.getState().openProject(targetProjId);
            useTimelineStore.getState().loadTimeline(targetProjId);
          }
        }
      } catch (e) {
        console.warn('[JobPoller] Polling status error:', e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status]);

  // When project changes, load its assets
  useEffect(() => {
    if (currentProject) {
      loadTranscript(currentProject.id);
      loadTranslations(currentProject.id);
      loadSubtitles(currentProject.id);
    }
  }, [currentProject?.id]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when editing text inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsNewProjectOpen(true);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsExportOpen(true);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (currentProject) {
          saveTimeline(currentProject.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProject?.id]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-studio-bg font-sans">
      {/* Top Application Toolbar */}
      <TopToolbar
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        onOpenExportModal={() => setIsExportOpen(true)}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side Tabbed Workspace */}
        <LeftWorkspace />

        {/* Center: Video Player or Welcome Hub */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentProject ? (
            <VideoPlayer />
          ) : (
            <WelcomeHub onOpenNewProject={() => setIsNewProjectOpen(true)} />
          )}
        </div>

        {/* Right: Inspector Properties */}
        <RightInspector />
      </div>

      {/* Bottom: Multitrack Timeline */}
      <TimelineEditor />

      {/* Modals & Status Toasts */}
      <NewProjectModal isOpen={isNewProjectOpen} onClose={() => setIsNewProjectOpen(false)} />
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <SettingsModal />
      <GeminiKeyPoolModal />
      <JobStatusToast />
    </div>
  );
};
