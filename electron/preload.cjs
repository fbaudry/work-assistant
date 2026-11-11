const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workAssistant', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getUpdateState: () => ipcRenderer.invoke('updates:state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openFeedback: () => ipcRenderer.invoke('app:feedback'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('updates:state-changed', listener);
    return () => ipcRenderer.removeListener('updates:state-changed', listener);
  },
});
