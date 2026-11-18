"use strict";

const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { constants } = require("node:fs");
const { copyFile, lstat, mkdir, readFile, readdir, rename, unlink, writeFile } = require("node:fs/promises");
const { basename, delimiter, extname, isAbsolute, join } = require("node:path");
const { promisify } = require("node:util");

const execute = promisify(execFile);
const start = "<!-- projet-hub:debut -->";
const end = "<!-- projet-hub:fin -->";
const headings = {
  objective: "Objectif",
  type: "Type",
  needs: "Besoins",
  style: "Style",
  constraints: "Contraintes",
  state: "État actuel",
  nextSteps: "Prochaines étapes"
};
const instructions = "## Contexte du projet\n\nAvant de modifier le projet, lire `PROJECT_CONTEXT.md`, le README s’il existe et les ressources pertinentes dans `docs/references/`. Respecter également les autres consignes applicables du dépôt.";

async function entry(path) {
  return lstat(path).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
}

async function referencesDirectory(folder) {
  for (const name of ["docs", "references"]) {
    folder = join(folder, name);
    await mkdir(folder).catch(error => {
      if (error.code !== "EEXIST") throw error;
    });
    if (!(await lstat(folder)).isDirectory()) throw new Error("Le dossier de références doit être un dossier local.");
  }
  return folder;
}

async function listReferences(folder) {
  const directory = await referencesDirectory(folder);
  const files = await readdir(directory, { withFileTypes: true });
  return files.filter(file => file.isFile()).map(file => file.name).sort((a, b) => a.localeCompare(b, "fr"));
}

async function importReferences(folder, sources) {
  const directory = await referencesDirectory(folder);
  const imported = [];
  const errors = [];
  for (const source of sources) {
    const name = basename(source);
    try {
      const copied = await copyReference(directory, source, name);
      if (copied) imported.push(copied);
    } catch (error) {
      errors.push(`Impossible d’importer « ${name} ». ${error.code || error.message}`);
    }
  }
  return { imported, errors };
}

async function copyReference(directory, source, name) {
  if (!(await lstat(source)).isFile()) throw new Error("Choisissez un fichier ordinaire.");
  if (join(directory, name).toLowerCase() === source.toLowerCase()) return "";
  const extension = extname(name);
  const stem = basename(name, extension);
  for (let index = 0; ; index++) {
    const candidate = index ? `${stem.slice(0, 160)} (${index + 1})${extension.slice(0, 60)}` : name;
    try {
      await copyFile(source, join(directory, candidate), constants.COPYFILE_EXCL);
      return candidate;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

async function writeSection(path, body) {
  const section = `${start}\n${body}\n${end}`;
  const info = await entry(path);
  if (!info) {
    await writeFile(path, section + "\n", { flag: "wx" });
    return;
  }
  if (!info.isFile()) throw new Error(`« ${basename(path)} » doit être un fichier ordinaire du projet.`);
  const bytes = await readFile(path);
  const existing = bytes.toString("utf8");
  if (!bytes.equals(Buffer.from(existing, "utf8"))) throw new Error(`« ${basename(path)} » doit être encodé en UTF-8.`);
  const from = existing.indexOf(start);
  const to = existing.indexOf(end);
  if ((from === -1) !== (to === -1) || (from !== -1 && (to < from ||
      existing.indexOf(start, from + start.length) !== -1 || existing.indexOf(end, to + end.length) !== -1))) {
    throw new Error(`La section Projet Hub dans « ${basename(path)} » est incomplète ou répétée.`);
  }
  const updated = from === -1
    ? existing + (existing ? "\n\n" : "") + section + "\n"
    : existing.slice(0, from) + section + existing.slice(to + end.length);
  if (existing === updated) return;
  const temporary = path + "." + randomUUID() + ".tmp";
  await writeFile(temporary, updated, { flag: "wx" });
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function githubRepository(input) {
  if (typeof input !== "string" || input.length > 300) return null;
  const match = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([a-z0-9](?:[a-z0-9-]*))\/([a-z0-9_.-]+)\/?$/i.exec(input.trim());
  if (!match) return null;
  const repo = match[2].replace(/\.git$/i, "");
  if (!repo || repo === "." || repo === "..") return null;
  return `https://github.com/${match[1].toLowerCase()}/${repo.toLowerCase()}`;
}

function referenceLink(value) {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
      !(url.hostname.toLowerCase() === "github.com" && url.search) ? url.href : null;
  } catch {
    return null;
  }
}

function markdownText(value) {
  return value.replaceAll("<!--", "&lt;!--");
}

async function syncProjectContext(folder, context) {
  if (!context || typeof context.name !== "string" || context.name.length > 100 || /[\r\n\0]/.test(context.name) ||
      !Array.isArray(context.links) || context.links.length > 100) throw new Error("La fiche de contexte est invalide.");
  const sections = Object.entries(headings).map(([key, label]) => {
    const value = context[key];
    if (typeof value !== "string" || value.length > 12000 || value.includes("\0")) throw new Error(`Le champ « ${label} » est invalide.`);
    return `## ${label}\n\n${markdownText(value.trim()) || "À renseigner."}`;
  });
  const repository = context.repository ? githubRepository(context.repository) : "";
  if (context.repository && !repository) throw new Error("Indiquez une adresse de dépôt GitHub sans identifiant ni jeton.");
  const links = [...new Set([repository, ...context.links.map(referenceLink)].filter(Boolean))];
  const refs = await listReferences(folder);
  const resources = refs.map(name =>
    `- [${markdownText(name.replace(/[\\[\]]/g, "\\$&"))}](docs/references/${encodeURIComponent(name).replaceAll("(", "%28").replaceAll(")", "%29")})`);
  const content = [
    `# Contexte de ${markdownText(context.name)}`,
    ...sections,
    "## Liens\n\n" + (links.map(link => `- <${link}>`).join("\n") || "Aucun lien renseigné."),
    "## Références\n\n" + (resources.join("\n") || "Aucun fichier dans `docs/references/`.")
  ].join("\n\n");
  await writeSection(join(folder, "PROJECT_CONTEXT.md"), content);
  await writeSection(join(folder, "AGENTS.md"), instructions);
  return refs;
}

async function findGit() {
  const name = process.platform === "win32" ? "git.exe" : "git";
  const directories = (process.env.PATH || "").split(delimiter).map(path => path.trim().replace(/^"(.*)"$/, "$1"));
  if (process.platform === "win32") {
    for (const folder of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (folder) directories.push(join(folder, "Git", "cmd"));
    }
    if (process.env.LOCALAPPDATA) directories.push(join(process.env.LOCALAPPDATA, "Programs", "Git", "cmd"));
  }
  for (const directory of directories.filter(isAbsolute)) {
    const path = join(directory, name);
    if ((await entry(path).catch(() => null))?.isFile()) return path;
  }
  return null;
}

async function checkRepository(folder, address) {
  if (!address) return { status: "unlinked" };
  const expected = githubRepository(address);
  if (!expected) return { status: "invalid" };
  const git = await findGit();
  if (!git) return { status: "noGit", expected };
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_CONFIG", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS"]) delete env[key];
  try {
    const { stdout } = await execute(git, ["-C", folder, "remote", "-v"], { env, windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024 });
    const remotes = stdout.split(/\r?\n/).map(line => /^([^\t]+)\t(.+) \((fetch|push)\)$/.exec(line)).filter(Boolean);
    const selected = remotes.some(([, name]) => name === "origin") ? remotes.filter(([, name]) => name === "origin") : remotes;
    const addresses = [...new Set(selected.map(([, , url]) => githubRepository(url)))];
    return {
      status: !addresses.length ? "noRemote" : addresses.every(url => url === expected) ? "match" : "mismatch",
      expected,
      remotes: addresses.map(url => url || "Adresse non GitHub ou contenant des identifiants")
    };
  } catch {
    return { status: "unavailable", expected };
  }
}

module.exports = { checkRepository, importReferences, listReferences, syncProjectContext };
