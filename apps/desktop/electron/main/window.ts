import { BrowserWindow, shell } from 'electron';
import path from 'path';

export function createMainWindow(): BrowserWindow {
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

  const preloadPath = path.join(__dirname, '../preload/index.js');
  const iconPath = path.join(__dirname, '../../public/icon.png');

  const win = new BrowserWindow({
    title: 'DubStudio Pro - AI Video Dubbing & Translation Studio',
    icon: iconPath,
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#111318',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Open target links in external browser safely
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return win;
}
