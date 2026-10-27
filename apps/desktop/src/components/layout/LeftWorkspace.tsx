import React, { useState } from 'react';
import {
  Film,
  Mic,
  Languages,
  Volume2,
  Type,
  ChevronLeft,
  ChevronRight,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { MediaLibrary } from '@/components/media/MediaLibrary';
import { TranscriptEditor } from '@/components/transcript/TranscriptEditor';
import { TranslationEditor } from '@/components/translation/TranslationEditor';
import { VoiceLibrary } from '@/components/voices/VoiceLibrary';
import { SubtitleEditor } from '@/components/subtitles/SubtitleEditor';
import { useProjectStore } from '@/stores/projectStore';
import { useTranscriptStore } from '@/stores/transcriptStore';
import { useTranslationStore } from '@/stores/translationStore';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { useSettingsStore } from '@/stores/settingsStore';

export type LeftSidebarTab = 'media' | 'transcript' | 'translation' | 'voices' | 'subtitles';

interface TabDefinition {
  id: LeftSidebarTab;
  label: string;
  headerTitle: string;
  icon: React.ReactNode;
  count?: number;
}

export const LeftWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LeftSidebarTab>('media');
  const [isOpen, setIsOpen] = useState(true);

  const { mediaAssets } = useProjectStore();
  const { segments } = useTranscriptStore();
  const { translations } = useTranslationStore();
  const { items: subtitles } = useSubtitleStore();
  const { openModal } = useSettingsStore();

  const tabs: TabDefinition[] = [
    {
      id: 'media',
      label: 'Media',
      headerTitle: 'Project Media',
      icon: <Film className="w-5 h-5" />,
      count: mediaAssets.length || undefined,
    },
    {
      id: 'transcript',
      label: 'Transcript',
      headerTitle: 'Spoken Transcript',
      icon: <Mic className="w-5 h-5" />,
      count: segments.length || undefined,
    },
    {
      id: 'translation',
      label: 'Translation',
      headerTitle: 'Dialogue Translation',
      icon: <Languages className="w-5 h-5" />,
      count: translations.length || undefined,
    },
    {
      id: 'voices',
      label: 'Voices',
      headerTitle: 'Voice Synthesizer',
      icon: <Volume2 className="w-5 h-5" />,
    },
    {
      id: 'subtitles',
      label: 'Subtitles',
      headerTitle: 'Subtitle Tracks',
      icon: <Type className="w-5 h-5" />,
      count: subtitles.length || undefined,
    },
  ];

  const handleTabClick = (tabId: LeftSidebarTab) => {
    if (activeTab === tabId) {
      // Toggle collapse/expand when clicking already active tab
      setIsOpen(!isOpen);
    } else {
      setActiveTab(tabId);
      setIsOpen(true);
    }
  };

  const activeTabObj = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <div className="flex h-full shrink-0 select-none border-r border-studio-border">
      {/* CapCut-Style Slim Vertical Sidebar Rail */}
      <div className="w-[72px] bg-studio-bg border-r border-studio-border flex flex-col items-center justify-between py-3 shrink-0 z-20">
        {/* Navigation Tab Icons */}
        <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id && isOpen;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                title={`${tab.label} (Click to toggle)`}
                className={`w-[60px] h-[56px] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all relative group ${
                  isActive
                    ? 'bg-studio-panel text-studio-accent font-semibold shadow-sm border border-studio-border/70'
                    : 'text-studio-muted hover:text-studio-text hover:bg-studio-subbg/80 border border-transparent'
                }`}
              >
                {/* Active Indicator Bar on Left */}
                {isActive && (
                  <span className="absolute -left-1.5 top-2.5 bottom-2.5 w-1 bg-studio-accent rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.7)]" />
                )}

                {/* Icon with Counter Badge */}
                <div className="relative flex items-center justify-center">
                  <span className={isActive ? 'scale-105 transition-transform' : 'group-hover:scale-105 transition-transform'}>
                    {tab.icon}
                  </span>
                  {tab.count !== undefined && (
                    <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[15px] h-3.5 rounded-full bg-studio-accent text-[9px] font-bold text-white flex items-center justify-center shadow-md border border-studio-bg">
                      {tab.count}
                    </span>
                  )}
                </div>

                {/* Text Label */}
                <span className="text-[10px] tracking-tight leading-none truncate max-w-[56px]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom Utility Icons */}
        <div className="flex flex-col items-center gap-2 w-full px-1.5 pt-2 border-t border-studio-border/50">
          {/* Quick Settings Shortcut */}
          <button
            onClick={openModal}
            title="Settings (AI Providers & General)"
            className="w-[42px] h-[36px] rounded-lg flex items-center justify-center text-studio-muted hover:text-studio-text hover:bg-studio-subbg/70 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Toggle Expand/Collapse Drawer Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            title={isOpen ? 'Collapse sidebar panel' : 'Expand sidebar panel'}
            className="w-[42px] h-[36px] rounded-lg flex items-center justify-center text-studio-muted hover:text-studio-text hover:bg-studio-subbg/70 transition-colors"
          >
            {isOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Sidebar Drawer Panel */}
      {isOpen && (
        <div className="w-[375px] bg-studio-panel flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-left-2 duration-150">
          {/* Section Header */}
          <div className="h-10 px-3.5 border-b border-studio-border flex items-center justify-between bg-studio-panel shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-studio-accent shrink-0">{activeTabObj.icon}</span>
              <span className="text-xs font-semibold text-studio-text tracking-wide truncate">
                {activeTabObj.headerTitle}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {activeTabObj.count !== undefined && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-studio-subbg text-studio-muted border border-studio-border font-mono">
                  {activeTabObj.count}
                </span>
              )}

              <button
                onClick={() => setIsOpen(false)}
                title="Collapse panel"
                className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-subbg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Section Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'media' && <MediaLibrary />}
            {activeTab === 'transcript' && <TranscriptEditor />}
            {activeTab === 'translation' && <TranslationEditor />}
            {activeTab === 'voices' && <VoiceLibrary />}
            {activeTab === 'subtitles' && <SubtitleEditor />}
          </div>
        </div>
      )}
    </div>
  );
};
