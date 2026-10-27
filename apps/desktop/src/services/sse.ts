import type { ProcessingJob } from '@dubstudio/shared-types';

type JobListener = (job: ProcessingJob) => void;

class JobEventService {
  private eventSource: EventSource | null = null;
  private listeners: Set<JobListener> = new Set();

  public start(backendBaseUrl = 'http://127.0.0.1:8765/api/v1', token?: string): void {
    if (this.eventSource) return;

    try {
      const url = token
        ? `${backendBaseUrl}/jobs/events/stream?token=${encodeURIComponent(token)}`
        : `${backendBaseUrl}/jobs/events/stream`;
      this.eventSource = new EventSource(url);

      this.eventSource.onmessage = (event) => {
        try {
          const job: ProcessingJob = JSON.parse(event.data);
          this.listeners.forEach((fn) => fn(job));
        } catch (e) {
          console.error('[SSE] Failed to parse job update:', e);
        }
      };

      this.eventSource.onerror = (e) => {
        console.warn('[SSE] EventSource disconnected, will retry automatically:', e);
      };
    } catch (e) {
      console.error('[SSE] Failed to initialize EventSource:', e);
    }
  }

  public subscribe(listener: JobListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public stop(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

export const jobEventService = new JobEventService();
