const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posaDesktop', {
  printHtml: (html) => ipcRenderer.invoke('posa:print-html', html),
});
