import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopIPCBridge, ProcessingJob } from '@dubstudio/shared-types';

const dubstudioApi: DesktopIPCBridge = {
  getBackendInfo: () => ipcRenderer.invoke('backend:get-info'),
  selectVideoFile: () => ipcRenderer.invoke('dialog:select-video-file'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectSavePath: (defaultName: string, extensions: string[]) =>
    ipcRenderer.invoke('dialog:select-save-path', defaultName, extensions),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item-in-folder', path),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),
  onJobUpdate: (callback: (job: ProcessingJob) => void) => {
    const handler = (_event: any, job: ProcessingJob) => callback(job);
    ipcRenderer.on('job:update', handler);
    return () => {
      ipcRenderer.removeListener('job:update', handler);
    };
  },
  onBackendCrash: (callback: (error: string) => void) => {
    const handler = (_event: any, err: string) => callback(err);
    ipcRenderer.on('backend:crash', handler);
    return () => {
      ipcRenderer.removeListener('backend:crash', handler);
    };
  },
};

contextBridge.exposeInMainWorld('dubstudio', dubstudioApi);
