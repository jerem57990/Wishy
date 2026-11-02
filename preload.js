const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDb: () => ipcRenderer.invoke('db:get'),
  addItem: (url, extra) => ipcRenderer.invoke('item:add', url, extra),
  updateItem: (id, patch) => ipcRenderer.invoke('item:update', id, patch),
  deleteItem: (id) => ipcRenderer.invoke('item:delete', id),
  refreshItem: (id) => ipcRenderer.invoke('item:refresh', id),
  addAlt: (id, url) => ipcRenderer.invoke('item:addAlt', id, url),
  removeAlt: (id, idx) => ipcRenderer.invoke('item:removeAlt', id, idx),
  buyItem: (id, info) => ipcRenderer.invoke('item:buy', id, info),
  deletePurchase: (pid) => ipcRenderer.invoke('purchase:delete', pid),
  checkPrices: () => ipcRenderer.invoke('prices:check'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  importData: (data) => ipcRenderer.invoke('data:import', data),
  open: (url) => ipcRenderer.invoke('open', url),
  imageData: (url) => ipcRenderer.invoke('img:data', url),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  setPhoto: (dataUrl) => ipcRenderer.invoke('cabine:setPhoto', dataUrl),
  getPhoto: () => ipcRenderer.invoke('cabine:photo'),
  tryOn: (sel) => ipcRenderer.invoke('cabine:tryon', sel),
  getLook: (id) => ipcRenderer.invoke('cabine:look', id),
  deleteLook: (id) => ipcRenderer.invoke('cabine:deleteLook', id),
  minimize: () => ipcRenderer.send('win:minimize'),
  hide: () => ipcRenderer.send('win:hide'),
  maximize: () => ipcRenderer.send('win:maximize'),
  on: (channel, cb) => {
    const allowed = ['db:changed', 'toast', 'checking', 'focus-item', 'tryon:progress', 'update:status'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_, data) => cb(data));
  },
});
