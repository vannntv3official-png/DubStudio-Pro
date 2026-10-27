import { ipcMain, dialog, shell, BrowserWindow } from 'electron';

export function registerDialogIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('dialog:select-video-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Video File to Import',
      properties: ['openFile'],
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'm4v'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:select-save-path', async (_event, defaultName: string, extensions: string[]) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Destination',
      defaultPath: defaultName,
      filters: [{ name: 'Export Media', extensions: extensions || ['mp4'] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  });

  ipcMain.handle('shell:show-item-in-folder', async (_event, fullPath: string) => {
    if (fullPath) {
      shell.showItemInFolder(fullPath);
    }
  });

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });
}
