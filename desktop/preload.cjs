const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posaDesktop', {
  previewReport: (html) => ipcRenderer.invoke('posa:preview-report', html),
});

contextBridge.exposeInMainWorld('posaPreview', {
  print: () => ipcRenderer.invoke('posa:print-preview'),
});
