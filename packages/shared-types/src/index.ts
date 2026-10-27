/**
 * DubStudio AI Shared Types
 * Production type definitions shared between Electron Main, Preload, React UI, and API.
 */

export type AIProvider = 'gemini' | 'codecraft';
export type TTSProvider = 'edge_tts';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobType =
  | 'media_import'
  | 'audio_extraction'
  | 'waveform_generation'
  | 'thumbnail_generation'
  | 'transcription'
  | 'translation'
  | 'speech_generation'
  | 'alignment'
  | 'preview_rendering'
  | 'video_export';

export interface ProcessingJob {
  id: string;
  projectId: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0.0 - 100.0
  message: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  metadata?: Record<string, unknown>;
}

// Media Metadata
export interface VideoStreamMeta {
  index: number;
  codec: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  bitrate?: number;
  aspectRatio?: string;
}

export interface AudioStreamMeta {
  index: number;
  codec: string;
  channels: number;
  sampleRate: number;
  durationMs: number;
  bitrate?: number;
}

export interface MediaMetadata {
  formatName: string;
  durationMs: number;
  sizeBytes: number;
  bitrate: number;
  video?: VideoStreamMeta;
  audio?: AudioStreamMeta;
}

export interface MediaAsset {
  id: string;
  projectId: string;
  filename: string;
  filePath: string;
  relativePath: string;
  fileSizeBytes: number;
  durationMs: number;
  metadata: MediaMetadata;
  extractedAudioPath?: string | null;
  waveformPath?: string | null;
  thumbnailPath?: string | null;
  createdAt: string;
}

// Transcript
export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number | null;
}

export interface TranscriptSegment {
  id: string;
  projectId: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId: string;
  language: string;
  confidence?: number | null;
  words?: WordTiming[];
  status: 'pending' | 'completed' | 'edited';
  createdAt: string;
  updatedAt: string;
}

// Translation
export interface TranslationSegment {
  id: string;
  projectId: string;
  segmentId: string; // Foreign key to TranscriptSegment
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: AIProvider;
  model: string;
  status: 'pending' | 'completed' | 'edited';
  isManuallyEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

// Speaker & Voices
export interface Speaker {
  id: string;
  projectId: string;
  name: string;
  color: string;
  voiceId?: string | null;
  ttsProvider?: TTSProvider;
  rate?: string; // e.g. "+0%"
  pitch?: string; // e.g. "+0Hz"
  volume?: string; // e.g. "+0%"
}

export interface VoiceProfile {
  id: string;
  name: string;
  displayName: string;
  gender: 'Female' | 'Male' | 'Neutral';
  locale: string;
  languageName: string;
  suggestedCodec?: string;
  sampleRate?: number;
}

// Generated Audio & Alignment
export type SyncMode = 'natural' | 'balanced' | 'strict';

export interface GeneratedAudio {
  id: string;
  projectId: string;
  segmentId: string;
  translationId: string;
  voiceId: string;
  originalDurationMs: number;
  rawDurationMs: number;
  alignedDurationMs: number;
  speedFactor: number;
  audioPath: string;
  alignedAudioPath: string;
  syncMode: SyncMode;
  status: 'generated' | 'aligned' | 'failed';
  createdAt: string;
}

// Timeline
export type TrackType = 'video' | 'original_audio' | 'dubbed_voice' | 'background_audio' | 'subtitles';

export interface TimelineClip {
  id: string;
  trackId: string;
  projectId: string;
  sourceId: string; // MediaAsset ID, GeneratedAudio ID, or Subtitle ID
  label: string;
  startMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  playbackRate: number;
  volume: number; // 0.0 to 2.0 (1.0 default)
  muted: boolean;
  locked: boolean;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface TimelineTrack {
  id: string;
  projectId: string;
  type: TrackType;
  name: string;
  index: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  volume: number; // 0.0 - 2.0
  clips: TimelineClip[];
}

// Subtitles
export type CaptionAnimationType = 'none' | 'pop' | 'fade-up' | 'highlight' | 'zoom-in';
export type KaraokeStyleType = 'none' | 'bounce-pop' | 'highlight' | 'box' | 'color-fill';

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold' | '500' | '600' | '700';
  textColor: string;
  outlineColor: string;
  outlineThickness: number;
  shadowColor: string;
  shadowBlur: number;
  backgroundColor: string;
  backgroundPadding?: number;
  borderRadius?: number;
  alignment: 'top' | 'middle' | 'bottom';
  verticalMargin: number;
  horizontalMargin: number;
  lineHeight: number;
  presetId?: string;
  animation?: CaptionAnimationType;
  // Karaoke Word-by-Word Highlight Settings
  karaokeEnabled?: boolean;
  karaokeStyle?: KaraokeStyleType;
  karaokeActiveColor?: string;
  karaokeInactiveColor?: string;
  karaokeActiveScale?: number;
  karaokeActiveBg?: string;
}

export interface SubtitleItem {
  id: string;
  projectId: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string | null;
  words?: WordTiming[];
  styleOverride?: Partial<SubtitleStyle> | null;
}

// Project Manifest
export interface ProjectManifest {
  id: string;
  schemaVersion: string; // e.g. "1.0.0"
  name: string;
  projectDir: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  mediaAssetId?: string | null;
  durationMs: number;
  syncMode: SyncMode;
  audioSettings: {
    originalVolume: number;
    dubbedVolume: number;
    backgroundVolume: number;
    duckingEnabled: boolean;
    duckingAttenuationDb: number;
  };
  subtitleStyle: SubtitleStyle;
}

// Export Configuration
export interface ExportConfig {
  projectId: string;
  resolution: '720p' | '1080p' | '1440p' | '4k' | 'original';
  videoCodec: 'h264' | 'hevc';
  audioCodec: 'aac';
  fps?: number;
  videoBitrate?: string; // e.g. "6000k"
  audioBitrate?: string; // e.g. "192k"
  outputFilePath: string;
  burnInSubtitles: boolean;
  exportSubtitlesSidecar: boolean;
  subtitlesSidecarFormat?: 'srt' | 'vtt';
  includeOriginalAudio: boolean;
  originalAudioVolume: number;
  dubbedAudioVolume: number;
  backgroundMusicVolume: number;
}

export interface ExportJob {
  id: string;
  projectId: string;
  config: ExportConfig;
  status: JobStatus;
  progress: number;
  currentStage: string;
  outputPath?: string | null;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

// App Settings & Credentials
export interface AIProviderSettings {
  geminiApiKey: string;
  geminiApiKeys?: string[];
  geminiModel: string;
  codecraftApiKey: string;
  codecraftBaseUrl: string;
  codecraftModel: string;
  defaultTranscriptionProvider: AIProvider;
  defaultTranslationProvider: AIProvider;
  defaultTTSProvider: TTSProvider;
  requestTimeoutSeconds: number;
  retryAttempts: number;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  aiProviders: AIProviderSettings;
  defaultExportPath: string;
  projectsDir: string;
  tempDir: string;
  hardwareAcceleration: boolean;
  autoSaveIntervalSeconds: number;
  snapSensitivityPx: number;
}

// IPC Interface between Electron Main and Renderer
export interface DesktopIPCBridge {
  getBackendInfo: () => Promise<{ port: number; token: string; host: string }>;
  selectVideoFile: () => Promise<string | null>;
  selectFolder: () => Promise<string | null>;
  selectSavePath: (defaultName: string, extensions: string[]) => Promise<string | null>;
  showItemInFolder: (path: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getSystemInfo: () => Promise<{ os: string; platform: string; arch: string }>;
  onJobUpdate: (callback: (job: ProcessingJob) => void) => () => void;
  onBackendCrash: (callback: (error: string) => void) => () => void;
}

declare global {
  interface Window {
    dubstudio?: DesktopIPCBridge;
  }
}
