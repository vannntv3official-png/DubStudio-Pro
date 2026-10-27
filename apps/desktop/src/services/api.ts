import type {
  ProjectManifest,
  MediaAsset,
  TranscriptSegment,
  TranslationSegment,
  VoiceProfile,
  GeneratedAudio,
  TimelineTrack,
  SubtitleItem,
  SubtitleStyle,
  ProcessingJob,
  ExportConfig,
  AppSettings,
} from '@dubstudio/shared-types';

let backendUrl = 'http://127.0.0.1:8765/api/v1';
let authToken = 'dev_secret_token_12345';
let isConnected = false;
let connectionPromise: Promise<void> | null = null;

export function getBackendUrl(): string {
  return backendUrl;
}

export function getAuthToken(): string {
  return authToken;
}

export async function initBackendConnection(): Promise<void> {
  if (connectionPromise) return connectionPromise;
  connectionPromise = (async () => {
    if (typeof window !== 'undefined' && window.dubstudio) {
      try {
        const info = await window.dubstudio.getBackendInfo();
        if (info && info.port) {
          backendUrl = `http://${info.host}:${info.port}/api/v1`;
          authToken = info.token;
          isConnected = true;
          console.log(`[API Client] Connected to backend at ${backendUrl}`);
        }
      } catch (e) {
        console.warn('[API Client] Could not fetch backend info from IPC, using default:', e);
      }
    }
  })().finally(() => {
    connectionPromise = null;
  });
  return connectionPromise;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!isConnected) {
    await initBackendConnection();
  }

  const executeFetch = async (targetUrl: string, targetToken: string): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    headers.set('X-DubStudio-Token', targetToken);
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(targetUrl, { ...options, headers });
  };

  let response: Response;
  try {
    response = await executeFetch(`${backendUrl}${endpoint}`, authToken);
  } catch (err: any) {
    // If backend connection dropped or port changed, refresh IPC credentials and retry once
    console.warn(`[API Client] Fetch failed on ${backendUrl}${endpoint}: ${err.message}. Re-synchronizing backend...`);
    isConnected = false;
    await initBackendConnection();
    try {
      response = await executeFetch(`${backendUrl}${endpoint}`, authToken);
    } catch (retryErr: any) {
      throw new Error(`Cannot connect to DubStudio AI Engine: ${retryErr.message}. Please verify the backend is running.`);
    }
  }

  if (!response.ok) {
    let errMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) {
        errMessage = errJson.error.message;
      } else if (errJson.detail) {
        errMessage = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // fallback to statusText
    }
    throw new Error(errMessage);
  }

  // If response is file blob or void
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response as unknown as T;
}

// Projects
export const api = {
  // Projects
  async createProject(name: string, sourceLanguage = 'en', targetLanguage = 'km', syncMode = 'balanced'): Promise<ProjectManifest> {
    return request<ProjectManifest>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, sourceLanguage, targetLanguage, syncMode }),
    });
  },

  async listRecentProjects(): Promise<ProjectManifest[]> {
    return request<ProjectManifest[]>('/projects');
  },

  async getProject(projectId: string): Promise<ProjectManifest> {
    return request<ProjectManifest>(`/projects/${projectId}`);
  },

  async updateProject(projectId: string, data: Partial<ProjectManifest>): Promise<ProjectManifest> {
    return request<ProjectManifest>(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Media
  async importMedia(projectId: string, filePath: string): Promise<MediaAsset> {
    return request<MediaAsset>('/media/import', {
      method: 'POST',
      body: JSON.stringify({ projectId, filePath }),
    });
  },

  async getProjectMedia(projectId: string): Promise<MediaAsset[]> {
    return request<MediaAsset[]>(`/media/${projectId}`);
  },

  // Transcription
  async startTranscription(projectId: string, mediaAssetId: string, provider = 'gemini', model?: string, sourceLanguage?: string): Promise<ProcessingJob> {
    return request<ProcessingJob>('/transcription/jobs', {
      method: 'POST',
      body: JSON.stringify({ projectId, mediaAssetId, provider, model, sourceLanguage }),
    });
  },

  async getTranscript(projectId: string): Promise<TranscriptSegment[]> {
    return request<TranscriptSegment[]>(`/transcription/${projectId}`);
  },

  async splitSegment(projectId: string, segmentId: string, splitTimeMs: number): Promise<TranscriptSegment[]> {
    return request<TranscriptSegment[]>(`/transcription/split?project_id=${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ segmentId, splitTimeMs }),
    });
  },

  async mergeSegments(projectId: string, segmentIds: string[]): Promise<TranscriptSegment[]> {
    return request<TranscriptSegment[]>(`/transcription/merge?project_id=${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ segmentIds }),
    });
  },

  // Translation
  async startTranslation(projectId: string, provider = 'gemini', model?: string, sourceLanguage = 'en', targetLanguage = 'km', glossary?: Record<string, string>): Promise<ProcessingJob> {
    return request<ProcessingJob>('/translation/jobs', {
      method: 'POST',
      body: JSON.stringify({ projectId, provider, model, sourceLanguage, targetLanguage, glossary }),
    });
  },

  async getTranslations(projectId: string): Promise<TranslationSegment[]> {
    return request<TranslationSegment[]>(`/translation/${projectId}`);
  },

  async updateTranslation(
    projectId: string,
    translationId: string,
    data: Partial<TranslationSegment> | string
  ): Promise<TranslationSegment> {
    const body = typeof data === 'string' ? { translatedText: data, isManuallyEdited: true } : { ...data, isManuallyEdited: true };
    return request<TranslationSegment>(`/translation/${projectId}/${translationId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async regenerateSingleSegment(
    projectId: string,
    segmentId: string,
    voiceId?: string,
    rate = '+0%',
    pitch = '+0Hz',
    volume = '+0%',
    syncMode?: string
  ): Promise<GeneratedAudio> {
    return request<GeneratedAudio>('/tts/regenerate-segment', {
      method: 'POST',
      body: JSON.stringify({ projectId, segmentId, voiceId, rate, pitch, volume, syncMode }),
    });
  },


  // Voices & TTS
  async listVoices(locale?: string): Promise<VoiceProfile[]> {
    const q = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return request<VoiceProfile[]>(`/voices${q}`);
  },

  async previewVoice(voiceId: string, text: string, rate = '+0%', pitch = '+0Hz', volume = '+0%'): Promise<string> {
    const response = await fetch(`${backendUrl}/voices/preview`, {
      method: 'POST',
      headers: {
        'X-DubStudio-Token': authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ voiceId, text, rate, pitch, volume }),
    });
    if (!response.ok) throw new Error('Preview synthesis failed');
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  async startSpeechGeneration(
    projectId: string,
    voiceId?: string,
    rate = '+0%',
    pitch = '+0Hz',
    volume = '+0%',
    segmentIds?: string[],
    syncMode?: string
  ): Promise<ProcessingJob> {
    return request<ProcessingJob>('/tts/jobs', {
      method: 'POST',
      body: JSON.stringify({ projectId, voiceId, rate, pitch, volume, segmentIds, syncMode }),
    });
  },

  async getGeneratedAudios(projectId: string): Promise<GeneratedAudio[]> {
    return request<GeneratedAudio[]>(`/tts/${projectId}`);
  },

  getMediaStreamUrl(filePath: string): string {
    return `${backendUrl}/media/stream-file?path=${encodeURIComponent(filePath)}`;
  },

  // Subtitles
  async getSubtitles(projectId: string): Promise<{ projectId: string; style: SubtitleStyle; items: SubtitleItem[] }> {
    return request<{ projectId: string; style: SubtitleStyle; items: SubtitleItem[] }>(`/subtitles/${projectId}`);
  },

  async exportSrt(projectId: string): Promise<string> {
    const res = await fetch(`${backendUrl}/subtitles/${projectId}/export/srt`, {
      headers: { 'X-DubStudio-Token': authToken },
    });
    return res.text();
  },

  async exportVtt(projectId: string): Promise<string> {
    const res = await fetch(`${backendUrl}/subtitles/${projectId}/export/vtt`, {
      headers: { 'X-DubStudio-Token': authToken },
    });
    return res.text();
  },

  async importSubtitles(projectId: string, content: string): Promise<{ projectId: string; style: SubtitleStyle; items: SubtitleItem[] }> {
    return request<{ projectId: string; style: SubtitleStyle; items: SubtitleItem[] }>('/subtitles/import', {
      method: 'POST',
      body: JSON.stringify({ projectId, content, format: 'srt' }),
    });
  },

  async fixSubtitleOverlaps(projectId: string): Promise<{ projectId: string; style: SubtitleStyle; items: SubtitleItem[] }> {
    return request<{ projectId: string; style: SubtitleStyle; items: SubtitleItem[] }>(`/subtitles/${projectId}/fix-overlaps`, {
      method: 'POST',
    });
  },

  // Timeline
  async getTimeline(projectId: string): Promise<{ projectId: string; durationMs: number; tracks: TimelineTrack[] }> {
    return request<{ projectId: string; durationMs: number; tracks: TimelineTrack[] }>(`/timeline/${projectId}`);
  },

  async saveTimeline(projectId: string, tracks: TimelineTrack[]): Promise<{ projectId: string; durationMs: number; tracks: TimelineTrack[] }> {
    return request<{ projectId: string; durationMs: number; tracks: TimelineTrack[] }>(`/timeline/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({ tracks }),
    });
  },

  // Export
  async startExport(config: ExportConfig): Promise<ProcessingJob> {
    return request<ProcessingJob>('/export/jobs', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  // Jobs
  async getJob(jobId: string): Promise<ProcessingJob> {
    return request<ProcessingJob>(`/jobs/${jobId}`);
  },

  async cancelJob(jobId: string): Promise<{ jobId: string; cancelled: boolean }> {
    return request<{ jobId: string; cancelled: boolean }>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  },

  // Settings
  async getSettings(): Promise<AppSettings> {
    return request<AppSettings>('/settings');
  },

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    return request<AppSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async testConnection(
    provider: string,
    apiKey: string,
    baseUrl?: string,
    model?: string,
    apiKeys?: string[]
  ): Promise<{ success: boolean; message: string; models: string[] }> {
    return request<{ success: boolean; message: string; models: string[] }>('/settings/test-connection', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, baseUrl, model, apiKeys }),
    });
  },
};
