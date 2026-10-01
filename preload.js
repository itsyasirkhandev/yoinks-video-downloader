const { contextBridge, ipcRenderer } = require("electron");

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld("yoinks", {
  ready: () => call("ready"),
  getSettings: () => call("settings:get"),
  setSettings: (patch) => call("settings:set", patch),
  chooseFolder: () => call("folder:choose"),
  openFolder: () => call("folder:open"),
  showFile: (p) => call("file:show", p),
  openFile: (p) => call("file:open", p),
  readClipboard: () => call("clipboard:read"),
  info: (url) => call("video:info", url),
  download: (url, format) => call("video:download", url, format),
  cancel: (id) => call("video:cancel", id),
  onProgress: (fn) => ipcRenderer.on("progress", (_e, d) => fn(d)),
  onStatus: (fn) => ipcRenderer.on("status", (_e, d) => fn(d)),
  onFocus: (fn) => ipcRenderer.on("focus", () => fn()),
});
