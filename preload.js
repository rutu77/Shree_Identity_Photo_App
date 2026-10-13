const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printPhoto: (imageDataUrl) => ipcRenderer.invoke('print-photo', imageDataUrl),
});
