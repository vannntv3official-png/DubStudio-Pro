# DubStudio AI

> **Production-Grade AI Video Dubbing & Translation Studio for Windows Desktop**

DubStudio AI is a professional desktop nonlinear video editor engineered specifically for AI-powered video transcription, translation, voice synthesis, audio synchronization, and high-fidelity video export. Inspired by CapCut Desktop and VS Code, it delivers an intuitive, dark-themed creative workspace with a robust local media processing engine.

---

## Key Features

- **Desktop-First Architecture**: Built on Electron, Vite, React 18, TypeScript, and Python FastAPI.
- **AI Transcription Subsystem**:
  - Modular adapters for **Google Gemini API** (`gemini-3.8-flash`) and **Codecraft API** (OpenAI-compatible).
  - Accurate dialogue segment splitting, merging, and speaker labeling.
- **Context-Aware Translation**:
  - High-quality translation into **Khmer (ភាសាខ្មែរ)**, English, Thai, Vietnamese, Chinese, Japanese, French, and Spanish.
  - Terminology glossary preservation and manual edit protection.
- **Microsoft Edge TTS Voice Synthesis**:
  - Live discovery and auditioning of natural voices.
  - Native support for Khmer voices (`km-KH`) and multi-lingual locales.
- **Advanced Audio Synchronization**:
  - Three synchronization profiles: **Natural**, **Balanced**, and **Strict Sync**.
  - Dynamic FFmpeg `atempo` time-stretching and silence padding to match video dialogue timestamps.
- **Interactive Multitrack Timeline**:
  - Video track, original audio track with rendered canvas waveform, dubbed voice track, background music track, and subtitles track.
  - Real-time playhead scrubbing, magnetic snapping, clip trimming, and undo/redo history.
- **Professional Subtitle Engine**:
  - Proper Khmer Unicode rendering with the **Kantumruy Pro** font.
  - Real-time video player overlay with customizable colors, outlines, shadows, and alignment.
  - Full SRT and VTT import and export.
- **FFmpeg Video Export Pipeline**:
  - Hardware-accelerated and software encoding presets (720p, 1080p, 1440p, 4K).
  - Background audio ducking and volume mixing.
  - Subtitle burn-in with font embedding and true progress reporting.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Desktop Shell** | Electron 32, TypeScript, Secure contextBridge, electron-builder |
| **Frontend** | React 18, Vite 5, Tailwind CSS, Lucide Icons, Zustand, HTML5 Canvas & Video |
| **Backend** | Python 3.12, FastAPI, Uvicorn, SQLAlchemy 2.0, SQLite, Alembic |
| **Media Processing**| FFmpeg, FFprobe, edge-tts, soundfile, NumPy |
| **AI Providers** | Google GenAI SDK (`google-genai`), Codecraft API (OpenAI-compatible gateway) |

---

## Quick Start

### 1. Prerequisites
- Node.js `20+` or `24+`
- pnpm `10+` or `12+`
- Python `3.11+` or `3.12+`
- `uv` (recommended) or standard `pip`
- FFmpeg installed and available in `PATH`

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/your-username/dubstudio-ai.git
cd dubstudio-ai

# Install frontend dependencies
pnpm install

# Setup Python virtual environment
cd backend
uv venv --python 3.12 .venv
uv pip install -r requirements.txt
cd ..
```

### 3. Run Development Mode
```bash
pnpm dev
```
Electron will launch and automatically start the local authenticated FastAPI backend on a loopback port.

### 4. Run Automated Tests
```bash
# Run backend test suite (FastAPI, SQLite, Speech Synthesis, E2E Dubbing Workflow)
pnpm test:backend

# Run frontend test suite (Zustand Stores, Timeline, Subtitles, Player)
pnpm test

# Run desktop integration & Electron smoke test
pnpm test:smoke
```

---

## Documentation
- [Architecture & Design Details](docs/ARCHITECTURE.md)
- [FastAPI Backend API Reference](docs/API.md)
- [Developer Setup Guide](docs/DEVELOPMENT.md)
- [Windows Packaging & NSIS Installer](docs/PACKAGING.md)
- [User Guide & Tutorial](docs/USER_GUIDE.md)

---

## License
MIT License. Created for professional video creators and localization teams.
