"use strict";

const { execFile } = require("node:child_process");
const { stat } = require("node:fs/promises");
const { win32: path } = require("node:path");
const { promisify } = require("node:util");

const execute = promisify(execFile);
const startConsole = Buffer.from([
  "$ErrorActionPreference = 'Stop'",
  "try {",
  "  $process = Start-Process -FilePath $env:PROJET_HUB_CODEX_EXE -ArgumentList $env:PROJET_HUB_CODEX_ARGS -WorkingDirectory $env:PROJET_HUB_CODEX_DIR -PassThru",
  "  if ($process.WaitForExit(1500) -and $process.ExitCode -ne 0) { exit 1 }",
  "} catch { exit 1 }"
].join("\n"), "utf16le").toString("base64");

async function findCodex() {
  const directories = (process.env.PATH || "").split(";").map(entry => entry.trim().replace(/^"(.*)"$/, "$1"));
  if (process.env.APPDATA) directories.push(path.join(process.env.APPDATA, "npm"));
  for (const directory of directories.filter(entry => /^[a-z]:[\\/]/i.test(entry))) {
    const npmScope = path.join(directory, "node_modules", "@openai");
    const candidates = [path.join(directory, "codex.exe")];
    for (const [arch, target] of [["x64", "x86_64"], ["arm64", "aarch64"]]) {
      const binary = [target + "-pc-windows-msvc", "bin", "codex.exe"];
      const platformPackage = "codex-win32-" + arch;
      candidates.push(
        path.join(npmScope, "codex", "node_modules", "@openai", platformPackage, "vendor", ...binary),
        path.join(npmScope, platformPackage, "vendor", ...binary),
        path.join(npmScope, "codex", "vendor", ...binary)
      );
    }
    for (const candidate of candidates) {
      if ((await stat(candidate).catch(() => null))?.isFile()) return candidate;
    }
  }
  throw new Error("Codex CLI est introuvable. Installez-le avec npm install -g @openai/codex, puis relancez Projet Hub.");
}

// Start-Process accepts a Windows command line. Escape backslashes before
// each quote and double trailing backslashes before the closing quote.
function quoteArgument(value) {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/, "$&$&") + '"';
}

async function launchCodex(folder, prompt) {
  if (process.platform !== "win32") throw new Error("Le lancement de Codex depuis Projet Hub est disponible sous Windows.");
  const executable = await findCodex();
  const args = ["--sandbox", "read-only", "--ask-for-approval", "on-request"];
  if (prompt) args.push("--", prompt);
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    // The script is constant. User input travels only as data, and the
    // console starts the resolved executable directly with its own stdio.
    await execute(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", startConsole], {
      windowsHide: true,
      timeout: 10000,
      env: {
        ...process.env,
        PROJET_HUB_CODEX_EXE: executable,
        PROJET_HUB_CODEX_ARGS: args.map(quoteArgument).join(" "),
        PROJET_HUB_CODEX_DIR: folder
      }
    });
  } catch {
    throw new Error("Impossible de lancer Codex CLI. Vérifiez son installation avec codex --version, puis essayez de l’ouvrir dans un terminal.");
  }
}

module.exports = { launchCodex };
