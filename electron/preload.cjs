// Bridge between the app window and Windows: save a network login and read a scanner folder.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ctqaDesktop", {
  saveLogin: (name, user, password) => ipcRenderer.invoke("ctqa:saveLogin", name, user, password),
  renameLogin: (from, to) => ipcRenderer.invoke("ctqa:renameLogin", from, to),
  hasLogin: (name) => ipcRenderer.invoke("ctqa:hasLogin", name),
  saveCopy: (rel, data, previous) => ipcRenderer.invoke("ctqa:saveCopy", rel, data, previous),
  openLibrary: () => ipcRenderer.invoke("ctqa:openLibrary"),
  readFolder: (source) => ipcRenderer.invoke("ctqa:readFolder", source),
});
