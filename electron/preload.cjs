// Bridge between the app window and Windows: save a network login and read a scanner folder.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ctqaDesktop", {
  saveFailedImport: (name, code, bytes) => ipcRenderer.invoke("ctqa:saveFailedImport", name, code, bytes),
  listFailedImports: () => ipcRenderer.invoke("ctqa:listFailedImports"),
  openFailedImport: (id) => ipcRenderer.invoke("ctqa:openFailedImport", id),
  reviewFailedImport: (id) => ipcRenderer.invoke("ctqa:reviewFailedImport", id),
  listCatalog: () => ipcRenderer.invoke("ctqa:listCatalog"),
  readSettings: () => ipcRenderer.invoke("ctqa:readSettings"),
  saveSettings: (json) => ipcRenderer.invoke("ctqa:saveSettings", json),
  saveLogin: (source, password) => ipcRenderer.invoke("ctqa:saveLogin", source, password),
  approveLegacyLogin: (source) => ipcRenderer.invoke("ctqa:approveLegacyLogin", source),
  loginStatus: (source) => ipcRenderer.invoke("ctqa:loginStatus", source),
  saveCopy: (rel, data, previous, metadata) => ipcRenderer.invoke("ctqa:saveCopy", rel, data, previous, metadata),
  openLibrary: () => ipcRenderer.invoke("ctqa:openLibrary"),
  startFolderScan: (source) => ipcRenderer.invoke("ctqa:startFolderScan", source),
  nextFolderBatch: (id) => ipcRenderer.invoke("ctqa:nextFolderBatch", id),
  endFolderScan: (id) => ipcRenderer.invoke("ctqa:endFolderScan", id),
  testFolder: (source) => ipcRenderer.invoke("ctqa:testFolder", source),
});
