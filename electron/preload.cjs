// Bridge between the app window and Windows: save a network login and read a scanner folder.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ctqaDesktop", {
  saveFailedImport: (name, code, bytes) => ipcRenderer.invoke("ctqa:saveFailedImport", name, code, bytes),
  listFailedImports: () => ipcRenderer.invoke("ctqa:listFailedImports"),
  openFailedImport: (id) => ipcRenderer.invoke("ctqa:openFailedImport", id),
  reviewFailedImport: (id) => ipcRenderer.invoke("ctqa:reviewFailedImport", id),
  readSettings: () => ipcRenderer.invoke("ctqa:readSettings"),
  saveSettings: (json) => ipcRenderer.invoke("ctqa:saveSettings", json),
  saveLogin: (name, user, password) => ipcRenderer.invoke("ctqa:saveLogin", name, user, password),
  renameLogin: (from, to) => ipcRenderer.invoke("ctqa:renameLogin", from, to),
  hasLogin: (name) => ipcRenderer.invoke("ctqa:hasLogin", name),
  saveCopy: (rel, data, previous) => ipcRenderer.invoke("ctqa:saveCopy", rel, data, previous),
  openLibrary: () => ipcRenderer.invoke("ctqa:openLibrary"),
  readFolder: (source) => ipcRenderer.invoke("ctqa:readFolder", source),
});
