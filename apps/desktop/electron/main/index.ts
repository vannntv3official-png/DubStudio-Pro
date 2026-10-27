import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import { pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { createMainWindow } from './window';
import { backendManager } from './backend-manager';
import { registerDialogIpc } from './ipc/dialogs';

// Register privileged custom media streaming scheme
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Register media handler for local video/audio streaming with high-performance HTTP 206 byte ranges
    protocol.handle('media', (request) => {
      try {
        const url = new URL(request.url);
        let raw = url.pathname;
        while (raw.startsWith('/')) {
          raw = raw.slice(1);
        }
        let filePath = decodeURIComponent(raw);
        if (/^[a-zA-Z]\//.test(filePath)) {
          filePath = filePath[0] + ':' + filePath.slice(1);
        }
        filePath = path.normalize(filePath);
        if (!fs.existsSync(filePath)) {
          console.warn('[MediaProtocol] Media file not found on disk:', filePath);
          return new Response('Media file not found', { status: 404 });
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.mkv': 'video/x-matroska',
          '.avi': 'video/x-msvideo',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
          '.aac': 'audio/aac',
          '.ogg': 'audio/ogg',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const rangeHeader = request.headers.get('range');

        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
            const chunkSize = end - start + 1;
            const nodeStream = fs.createReadStream(filePath, { start, end });
            const webStream = (Readable as any).toWeb(nodeStream);

            return new Response(webStream, {
              status: 206,
              statusText: 'Partial Content',
              headers: {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize.toString(),
                'Content-Type': contentType,
              },
            });
          }
        }

        const nodeStream = fs.createReadStream(filePath);
        const webStream = (Readable as any).toWeb(nodeStream);
        return new Response(webStream, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': fileSize.toString(),
            'Content-Type': contentType,
          },
        });
      } catch (e) {
        console.error('[MediaProtocol] Failed to serve media file:', e);
        return new Response('Media file error', { status: 500 });
      }
    });

    console.log('[Electron Main] App ready, launching backend...');
    try {
      await backendManager.start();
    } catch (e) {
      console.error('[Electron Main] Failed to launch backend:', e);
    }

    mainWindow = createMainWindow();
    registerDialogIpc(mainWindow);

    backendManager.onRestart((info) => {
      console.log('[Electron Main] Backend restarted, broadcasting new info to renderer:', info);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend:restarted', info);
      }
    });

    // Provide backend credentials to renderer upon request
    ipcMain.handle('backend:get-info', async () => {
      return backendManager.getConnectionInfo();
    });

    ipcMain.handle('app:get-version', async () => {
      return app.getVersion();
    });

    ipcMain.handle('app:get-system-info', async () => {
      return {
        os: process.platform,
        platform: process.platform,
        arch: process.arch,
      };
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    console.log('[Electron Main] Quitting application, shutting down backend...');
    backendManager.stop();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      backendManager.stop();
      app.quit();
    }
  });
}
