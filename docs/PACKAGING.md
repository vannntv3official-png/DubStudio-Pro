# DubStudio AI - Windows Packaging & Distribution Guide

## 1. Overview
DubStudio AI is packaged into a standalone Windows installer (.exe) via **electron-builder** and **NSIS**.
The distribution bundles:
1. Electron runtime and packaged Vite React frontend.
2. Compiled Python backend executable.
3. Embedded FFmpeg/FFprobe binaries.

Users do not need Python, Node.js, or development dependencies installed.

---

## 2. Packaging the Python Backend Executable

To bundle the Python backend into a standalone executable:
```powershell
cd backend
.\.venv\Scripts\pip.exe install pyinstaller
.\.venv\Scripts\pyinstaller.exe --noconfirm --onedir --windowed `
  --name "dubstudio-backend" `
  --add-data "app;app" `
  app/main.py
```
This produces `backend/dist/dubstudio-backend/dubstudio-backend.exe`.

---

## 3. Building the Windows Installer

From the root workspace:
```bash
# 1. Build frontend and Electron main scripts
pnpm build

# 2. Package into Windows NSIS installer
pnpm build:win
```
The installer executable is written to `apps/desktop/release/DubStudio AI Setup 1.0.0.exe`.

---

## 4. NSIS Installer Features
- Standard Windows wizard with customizable installation directory (`C:\Program Files\DubStudio AI`).
- Automatic Desktop and Start Menu shortcut creation.
- Clean uninstaller (`uninstall.exe`) that preserves user project data in `%APPDATA%\DubStudioAI\Projects`.
