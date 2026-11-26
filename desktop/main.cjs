"use strict";

const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require("electron");
const { mkdir, readFile, realpath, rename, stat, unlink, writeFile } = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { join, relative, isAbsolute, win32 } = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchCodex, launchTaskCodex } = require("./codex.cjs");
const { validateProject, writeProjectFiles } = require("./project-files.cjs");
const { checkRepository, importReferences, listReferences, syncProjectContext } = require("./project-context.cjs");
const { checkForWindowsUpdate } = require("./updates.cjs");

const origin = "projet-hub://app";
const home = origin + "/";
const assets = new Map([["/", "index.html"], ["/app.js", "app.js"], ["/style.css", "style.css"]]);
const fileSelections = new Map();
const contextWrites = new Map();
const taskSessions = new Map();
let window;

protocol.registerSchemesAsPrivileged([{
  scheme: "projet-hub", privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);
app.setName("Projet Hub");
app.setAppUserModelId("fr.projethub.desktop");

function folderRecord(id) {
  return join(app.getPath("userData"), "project-folders", "project-" + id + ".json");
}

async function readFolder(id) {
  try {
    return JSON.parse(await readFile(folderRecord(id), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw new Error("Impossible de lire le dossier associé à ce projet.");
  }
}

async function projectDirectory(id) {
  const folder = await readFolder(id);
  if (!folder) throw new Error("Aucun dossier n’est associé à ce projet. Choisissez-en un dans ses paramètres.");
  try {
    const resolved = await realpath(folder);
    if ((await stat(resolved)).isDirectory()) return resolved;
  } catch {
    // The folder may have been moved or disconnected.
  }
  throw new Error("Le dossier du projet est inaccessible. Choisissez à nouveau son emplacement.");
}

async function projectFile(folder, file) {
  const resolved = await realpath(file).catch(() => "");
  const name = resolved && relative(folder, resolved);
  if (!name || name === ".." || name.startsWith(".." + win32.sep) ||
      isAbsolute(name) || !(await stat(resolved).catch(() => null))?.isFile()) {
    throw new Error("Choisissez un fichier accessible à l’intérieur du dossier du projet.");
  }
  return name;
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, id, ...args) => {
    try {
      const frame = event.senderFrame;
      if (event.sender !== window?.webContents || frame !== event.sender.mainFrame ||
          frame.url.split("#")[0] !== home || typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id)) {
        throw new Error("Action Windows non autorisée.");
      }
      return { value: await action(id, ...args) };
    } catch (error) {
      return { error: error.message };
    }
  });
}

async function saveFolder(id, folder) {
  const record = folderRecord(id);
  await mkdir(join(app.getPath("userData"), "project-folders"), { recursive: true });
  const temporary = record + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(folder), { flag: "wx" });
  await rename(temporary, record);
  fileSelections.delete(id);
  return folder;
}

const defaultParent = () => join(app.getPath("documents"), "Projet Hub");

async function chooseDirectory(title, defaultPath) {
  const result = await dialog.showOpenDialog(window, {
    title, defaultPath, properties: ["openDirectory"]
  });
  return result.canceled ? null : realpath(result.filePaths[0]);
}

handle("backup:save", async (_id, filename, content) => {
  if (typeof filename !== "string" || !/^projet-hub-(?:avant-restauration-)?\d{4}-\d{2}-\d{2}\.json$/.test(filename) ||
      typeof content !== "string") throw new Error("Sauvegarde invalide.");
  const result = await dialog.showSaveDialog(window, {
    title: "Enregistrer la sauvegarde Projet Hub",
    defaultPath: join(app.getPath("downloads"), filename),
    filters: [{ name: "Sauvegarde JSON", extensions: ["json"] }]
  });
  if (result.canceled) return null;
  const temporary = result.filePath + "." + randomUUID() + ".tmp";
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" }).then(
    () => rename(temporary, result.filePath)
  ).catch(async error => {
    if (error.code !== "EEXIST") await unlink(temporary).catch(() => {});
    throw error;
  });
  return result.filePath;
});

handle("project:folder", readFolder);
handle("project:default-parent", defaultParent);
handle("project:choose-parent", () => chooseDirectory("Choisir l’emplacement du nouveau dossier", defaultParent()));
handle("project:choose-folder", async id => {
  const folder = await chooseDirectory("Associer un dossier existant", await readFolder(id) || defaultParent());
  return folder && saveFolder(id, folder);
});
handle("project:create-folder", async (id, project, selectedParent) => {
  validateProject(project);
  const parent = selectedParent === "" ? defaultParent() : selectedParent;
  if (typeof parent !== "string" || !isAbsolute(parent)) throw new Error("Choisissez un emplacement valide.");
  if (selectedParent === "") await mkdir(parent, { recursive: true });
  const folder = join(await realpath(parent), project.name);
  try {
    await mkdir(folder);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (!(await stat(folder).catch(() => null))?.isDirectory()) {
      throw new Error("Un fichier porte déjà ce nom à cet emplacement. Choisissez un autre emplacement ou un autre nom.");
    }
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      title: "Ce dossier existe déjà",
      message: "Ce dossier existe déjà.",
      detail: folder,
      buttons: ["Ouvrir et associer", "Choisir un autre emplacement", "Annuler"],
      defaultId: 1,
      cancelId: 2,
      noLink: true
    });
    if (response === 1) {
      return { parent: await chooseDirectory("Choisir un autre emplacement", parent) };
    }
    if (response !== 0) return null;
    const existing = await realpath(folder);
    const errorMessage = await shell.openPath(existing);
    if (errorMessage) throw new Error("Impossible d’ouvrir le dossier existant. " + errorMessage);
    return { folder: await saveFolder(id, existing) };
  }
  try {
    await writeProjectFiles(folder, project);
    return { folder: await saveFolder(id, folder) };
  } catch (error) {
    throw new Error(`Création interrompue dans « ${folder} ». Les fichiers déjà écrits sont conservés. ${error.message}`);
  }
});
handle("project:context-sync", async (id, context) => {
  const folder = await projectDirectory(id);
  const key = folder.toLowerCase();
  const previous = contextWrites.get(key);
  const write = (previous?.catch(() => {}) ?? Promise.resolve()).then(() => syncProjectContext(folder, context));
  contextWrites.set(key, write);
  try {
    return await write;
  } finally {
    if (contextWrites.get(key) === write) contextWrites.delete(key);
  }
});
handle("project:references", async id => listReferences(await projectDirectory(id)));
handle("project:import-references", async id => {
  const folder = await projectDirectory(id);
  const result = await dialog.showOpenDialog(window, {
    title: "Importer des références", defaultPath: folder, properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images et documents", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "pdf", "md", "txt", "doc", "docx", "odt", "ppt", "pptx", "xls", "xlsx", "csv"] },
      { name: "Tous les fichiers", extensions: ["*"] }
    ]
  });
  return result.canceled ? { imported: [], errors: [] } : importReferences(folder, result.filePaths);
});
handle("project:check-repository", async (id, address) => checkRepository(await projectDirectory(id), address));
handle("project:choose-file", async id => {
  const folder = await projectDirectory(id);
  const result = await dialog.showOpenDialog(window, {
    title: "Choisir un fichier du projet", defaultPath: folder, properties: ["openFile"]
  });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  const name = await projectFile(folder, file);
  const token = randomUUID();
  fileSelections.set(id, { token, file });
  return { token, name };
});
handle("project:open-codex", async (id, prompt, token) => {
  const folder = await projectDirectory(id);
  if (typeof prompt !== "string" || prompt.length > 4000 || prompt.includes("\0")) {
    throw new Error("Saisissez une consigne de 4 000 caractères maximum.");
  }
  if (typeof token !== "string") throw new Error("Sélection de fichier invalide.");
  if (token) {
    const selection = fileSelections.get(id);
    if (!selection || selection.token !== token) throw new Error("Choisissez à nouveau le fichier.");
    const name = await projectFile(folder, selection.file);
    prompt = `Fichier du projet à consulter : ${JSON.stringify(name)}\n\n${prompt || "Examine ce fichier."}`;
  }
  await launchCodex(folder, prompt);
  fileSelections.delete(id);
  return prompt;
});

handle("task:open-codex", async (id, taskId, task) => {
  if (typeof taskId !== "string" || !/^[a-z0-9-]{1,80}$/.test(taskId) ||
      !task || !["title", "description", "instructions"].every(key =>
        typeof task[key] === "string" && task[key].length <= (key === "title" ? 200 : 4000) && !task[key].includes("\0")) ||
      !task.title.trim()) throw new Error("Les informations de la tâche sont invalides.");
  const key = id + "/" + taskId;
  if (taskSessions.has(key)) throw new Error("Une session Codex existe déjà pour cette tâche.");
  const session = { id: randomUUID() };
  taskSessions.set(key, session);
  try {
    const folder = await projectDirectory(id);
    Object.assign(session, await launchTaskCodex(folder, {
      title: task.title, description: task.description, instructions: task.instructions
    }));
    return { id: session.id, at: session.at };
  } catch (error) {
    taskSessions.delete(key);
    throw error;
  }
});

handle("task:codex-result", async (id, taskId, sessionId) => {
  if (typeof taskId !== "string" || !/^[a-z0-9-]{1,80}$/.test(taskId)) throw new Error("Tâche invalide.");
  const key = id + "/" + taskId;
  const session = taskSessions.get(key);
  if (!session?.result || session.id !== sessionId) throw new Error("Cette session Codex est introuvable.");
  try {
    return await session.result;
  } finally {
    if (taskSessions.get(key) === session) taskSessions.delete(key);
  }
});

app.on("before-quit", () => {
  for (const session of taskSessions.values()) session.stop?.();
});

function createWindow() {
  window = new BrowserWindow({
    width: 1200, height: 820, minWidth: 420, minHeight: 540, autoHideMenuBar: true,
    ...(process.platform === "win32" && {
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#20291f", symbolColor: "#f3f6ee", height: 40 }
    }),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"), contextIsolation: true,
      nodeIntegration: false, sandbox: true
    }
  });
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    if (["https:", "http:"].includes(target.protocol)) void shell.openExternal(target.href).catch(() => {});
    return { action: "deny" };
  });
  window.webContents.once("did-finish-load", () => {
    void checkForWindowsUpdate(window).catch(error => console.error("Projet Hub : mise à jour", error));
  });
  void window.loadURL(home);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(() => {
    protocol.handle("projet-hub", async request => {
      const url = new URL(request.url);
      const file = url.host === "app" && assets.get(url.pathname);
      if (!file || request.method !== "GET") return new Response(null, { status: 404 });
      const response = await net.fetch(pathToFileURL(join(app.getAppPath(), file)).href);
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'");
      return new Response(response.body, { status: response.status, headers });
    });
    createWindow();
    app.on("window-all-closed", () => app.quit());
  });
}
