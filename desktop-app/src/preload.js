const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pausaActiva', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  startBreakNow: () => ipcRenderer.invoke('break:start-now'),
  finishBreak: () => ipcRenderer.invoke('break:finish'),
});
