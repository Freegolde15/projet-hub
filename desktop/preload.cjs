"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("projetHubWindows", {
  folder: id => ipcRenderer.invoke("project:folder", id),
  defaultParent: id => ipcRenderer.invoke("project:default-parent", id),
  chooseParent: id => ipcRenderer.invoke("project:choose-parent", id),
  createFolder: (id, project, parent) => ipcRenderer.invoke("project:create-folder", id, project, parent),
  chooseFolder: id => ipcRenderer.invoke("project:choose-folder", id),
  syncContext: (id, context) => ipcRenderer.invoke("project:context-sync", id, context),
  references: id => ipcRenderer.invoke("project:references", id),
  importReferences: id => ipcRenderer.invoke("project:import-references", id),
  checkRepository: (id, address) => ipcRenderer.invoke("project:check-repository", id, address),
  chooseFile: id => ipcRenderer.invoke("project:choose-file", id),
  openCodex: (id, prompt, fileToken) => ipcRenderer.invoke("project:open-codex", id, prompt, fileToken)
});
