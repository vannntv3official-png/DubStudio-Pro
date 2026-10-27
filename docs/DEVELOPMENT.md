# DubStudio AI - Development Guide

## 1. Prerequisites
- **Node.js**: `v20+` or `v24+`
- **pnpm**: `v10+` or `v12+`
- **Python**: `3.11+` or `3.12+`
- **uv**: Fast Python package manager
- **FFmpeg & FFprobe**: Installed and added to system `PATH` (Verify via `ffmpeg -version`)

---

## 2. Initial Setup

### 2.1 Install Workspace Dependencies
From the repository root:
```bash
pnpm install
```

### 2.2 Setup Backend Virtual Environment
```bash
cd backend
uv venv --python 3.12 .venv
uv pip install -r requirements.txt
cd ..
```

---

## 3. Running in Development Mode

### 3.1 Start Desktop Application (Electron + React)
```bash
pnpm dev
```
This launches Vite on `http://localhost:5173` and boots Electron.
Electron's `backend-manager.ts` will automatically start the Python FastAPI backend in the background on an available ephemeral port and connect via secure session token.

### 3.2 Running Backend Standalone (Optional for API testing)
```powershell
powershell -ExecutionPolicy Bypass -File scripts/development/start-backend.ps1
```
The FastAPI interactive Swagger documentation is available at:
`http://127.0.0.1:8765/docs`

---

## 4. Running Automated Tests

### 4.1 Run Backend Tests (Pytest)
```powershell
powershell -ExecutionPolicy Bypass -File scripts/development/test-backend.ps1
```

### 4.2 Run Frontend Store & Unit Tests (Vitest)
```bash
pnpm test
```

### 4.3 Typecheck All Packages
```bash
pnpm typecheck
```
