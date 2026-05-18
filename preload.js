const { contextBridge, ipcRenderer } = require('electron')

// Expose a safe bridge so renderer can ask main process to fetch IP location
contextBridge.exposeInMainWorld('electronAPI', {
  fetchIPLocation: () => ipcRenderer.invoke('fetch-ip-location')
})
