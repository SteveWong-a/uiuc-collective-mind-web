import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onStateUpdate: (callback: (state: any) => void) => {
    ipcRenderer.on('state-update', (_event, state) => callback(state));
  },
  triggerPoll: () => ipcRenderer.invoke('trigger-poll'),
  openLogin: (sourceKey: string) => ipcRenderer.invoke('open-login', sourceKey),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
