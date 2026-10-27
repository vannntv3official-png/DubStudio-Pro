# DubStudio AI - Backend API Reference

Base URL: `http://127.0.0.1:<PORT>/api/v1`

All endpoints except `/health` require the `X-DubStudio-Token: <SESSION_TOKEN>` header.

---

## 1. System & Health

### `GET /health`
Returns the status of the local FastAPI backend.
- **Response**:
  ```json
  {
    "status": "healthy",
    "app": "DubStudio AI",
    "version": "1.0.0"
  }
  ```

---

## 2. Projects API

### `POST /projects`
Creates a new project and scaffolds required directories and database tables.
- **Request**:
  ```json
  {
    "name": "My Khmer Dubbing Project",
    "sourceLanguage": "en",
    "targetLanguage": "km",
    "syncMode": "balanced"
  }
  ```

### `GET /projects`
Lists recent projects sorted by last opened timestamp.

### `GET /projects/{project_id}`
Retrieves project manifest, audio mix configuration, and subtitle styles.

### `PUT /projects/{project_id}`
Updates project properties, audio volume levels, or subtitle styling.

---

## 3. Media API

### `POST /media/import`
Analyzes media with FFprobe, extracts audio PCM WAV, generates peak waveform JSON, and creates video filmstrip thumbnails.
- **Request**:
  ```json
  {
    "projectId": "uuid",
    "filePath": "C:\\Videos\\sample.mp4"
  }
  ```

### `GET /media/{project_id}`
Lists all imported media assets and their stream metadata.

---

## 4. Transcription API

### `POST /transcription/jobs`
Queues an asynchronous speech recognition job via Google Gemini (`gemini-3.8-flash`) or Codecraft.
- **Request**:
  ```json
  {
    "projectId": "uuid",
    "mediaAssetId": "uuid",
    "provider": "gemini",
    "sourceLanguage": "en"
  }
  ```

### `GET /transcription/{project_id}`
Retrieves timestamped dialogue segments.

### `POST /transcription/split?project_id={id}`
Splits a segment into two segments at the specified timestamp in milliseconds.

### `POST /transcription/merge?project_id={id}`
Merges two or more contiguous segments into a single segment.

---

## 5. Translation API

### `POST /translation/jobs`
Translates dialogue segments into the target language with context awareness and glossary preservation.
- **Request**:
  ```json
  {
    "projectId": "uuid",
    "provider": "gemini",
    "sourceLanguage": "en",
    "targetLanguage": "km",
    "glossary": { "AI": "បញ្ញាសិប្បនិម្មិត" }
  }
  ```

### `GET /translation/{project_id}`
Retrieves all translated segments for the project.

### `PUT /translation/{project_id}/{translation_id}`
Updates a translated segment manually. Marks the segment as manually edited to prevent automatic overwrites.

---

## 6. Voices & TTS API

### `GET /voices?locale={prefix}`
Discovers all available natural voices from Edge TTS, optionally filtered by locale (e.g. `km`, `en-US`, `th-TH`).

### `POST /voices/preview`
Generates a short audio preview of a voice and returns a binary WAV stream.

### `POST /tts/jobs`
Synthesizes dubbed dialogue for all segments, performs duration comparison, and applies time-stretching and silence padding.

---

## 7. Timeline & Subtitles API

### `GET /timeline/{project_id}`
Returns all tracks (video, original audio, dubbed voice, background audio, subtitles) and their clips.

### `PUT /timeline/{project_id}`
Saves updated timeline track and clip coordinates.

### `GET /subtitles/{project_id}`
Returns active subtitle items and style configuration.

### `GET /subtitles/{project_id}/export/srt`
Streams formatted SRT subtitle text file.

### `GET /subtitles/{project_id}/export/vtt`
Streams formatted WebVTT subtitle text file.

---

## 8. Export API

### `POST /export/jobs`
Starts FFmpeg final video rendering pipeline.
- **Request**:
  ```json
  {
    "projectId": "uuid",
    "resolution": "1080p",
    "videoCodec": "h264",
    "audioCodec": "aac",
    "outputFilePath": "C:\\Exports\\dubbed.mp4",
    "burnInSubtitles": true,
    "exportSubtitlesSidecar": true,
    "includeOriginalAudio": true,
    "originalAudioVolume": 0.2,
    "dubbedAudioVolume": 1.0,
    "backgroundMusicVolume": 0.3
  }
  ```

---

## 9. Background Jobs & SSE

### `GET /jobs/{job_id}`
Retrieves status, progress percentage (0-100%), and status message.

### `POST /jobs/{job_id}/cancel`
Cancels an active running or queued job.

### `GET /jobs/events/stream`
Server-Sent Events (SSE) stream emitting real-time job progress events.
