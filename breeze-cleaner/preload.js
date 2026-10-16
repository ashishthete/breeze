'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The renderer can only call these named channels. It never gets fs access,
// and it passes opaque item ids (not paths) back for cleaning.
contextBridge.exposeInMainWorld('breeze', {
  scan: (category, opts) => ipcRenderer.invoke('breeze:scan', category, opts),
  clean: (ids, opts) => ipcRenderer.invoke('breeze:clean', { ids, opts }),
  disk: () => ipcRenderer.invoke('breeze:disk'),
  memory: () => ipcRenderer.invoke('breeze:memory'),
  loginItems: () => ipcRenderer.invoke('breeze:loginItems'),
  thumb: (id) => ipcRenderer.invoke('breeze:thumb', id),
  stats: () => ipcRenderer.invoke('breeze:stats'),
  openMain: () => ipcRenderer.invoke('breeze:openMain'),
});
