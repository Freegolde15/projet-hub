"use strict";

const { app, dialog } = require("electron");
const { access } = require("node:fs/promises");
const { join } = require("node:path");

async function reportFailure(window, message, error) {
  console.error("Projet Hub : mise à jour", error);
  if (window.isDestroyed()) return;
  const code = error?.code;
  const detail = {
    ERR_UPDATER_LATEST_VERSION_NOT_FOUND: "Aucune version publique n’a été trouvée sur GitHub Releases.",
    ERR_UPDATER_NO_PUBLISHED_VERSIONS: "Aucune version publique n’a été trouvée sur GitHub Releases.",
    ERR_UPDATER_CHANNEL_FILE_NOT_FOUND: "Le fichier latest.yml est absent de la version publiée.",
    ERR_CHECKSUM_MISMATCH: "Le fichier téléchargé a échoué à la vérification d’intégrité.",
    ENOSPC: "L’espace disque disponible est insuffisant."
  }[code];
  const reason = detail || "Vérifiez votre connexion et réessayez en rouvrant Projet Hub.";
  const reference = typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? ` (${code})` : "";
  await dialog.showMessageBox(window, {
    type: "warning",
    title: "Mise à jour de Projet Hub",
    message,
    detail: reason + reference + "\nVous pouvez continuer à utiliser Projet Hub.",
    buttons: ["OK"]
  });
}

async function checkForWindowsUpdate(window) {
  if (process.platform !== "win32" || !app.isPackaged) return;

  let failure = "La vérification des mises à jour a échoué.";
  try {
    try {
      await access(join(process.resourcesPath, "app-update.yml"));
    } catch (error) {
      // Local builds have no release feed.
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (window.isDestroyed()) return;

    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.disableWebInstaller = true;

    // Checking and downloading also reject their promises. Installation reports
    // asynchronous failures through this event only.
    let installing = false;
    autoUpdater.on("error", error => {
      if (installing) {
        installing = false;
        void reportFailure(window, failure, error).catch(console.error);
      }
    });

    const update = await autoUpdater.checkForUpdates();
    if (!update?.isUpdateAvailable || window.isDestroyed()) return;

    failure = "Le téléchargement de la mise à jour a échoué.";
    await autoUpdater.downloadUpdate();
    if (window.isDestroyed()) return;

    const { response } = await dialog.showMessageBox(window, {
      type: "info",
      title: "Mise à jour de Projet Hub",
      message: `Projet Hub ${update.updateInfo.version} est prêt à être installé.`,
      detail: "Si vous choisissez « Plus tard », la mise à jour vous sera proposée à la prochaine ouverture.",
      buttons: ["Redémarrer et installer", "Plus tard"],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    if (response === 0 && !window.isDestroyed()) {
      failure = "L’installation de la mise à jour a échoué.";
      installing = true;
      autoUpdater.quitAndInstall();
    }
  } catch (error) {
    await reportFailure(window, failure, error);
  }
}

module.exports = { checkForWindowsUpdate };
