"use strict";

const { execFile, spawn } = require("node:child_process");
const { stat, mkdtemp, writeFile, unlink, rmdir } = require("node:fs/promises");
const { join, win32: path } = require("node:path");
const { tmpdir } = require("node:os");
const { createInterface } = require("node:readline");
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

const taskOutputSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["completed", "incomplete"] },
    summary: { type: "string" }
  },
  required: ["status", "summary"],
  additionalProperties: false
};

function taskOutcome(turn, code, message, failure) {
  if (turn === "failed" || (code !== null && code !== 0)) return { state: "failed", summary: failure };
  if (turn !== "completed" || code !== 0) return { state: "interrupted", summary: "" };
  try {
    const report = JSON.parse(message);
    if (taskOutputSchema.properties.status.enum.includes(report?.status) &&
        typeof report.summary === "string" && report.summary.trim()) {
      return { state: report.status, summary: report.summary.trim().slice(0, 4000) };
    }
  } catch {
    // An older CLI or an incomplete response can still supply readable text.
  }
  return { state: "unconfirmed", summary: message.slice(0, 4000) };
}

async function launchTaskCodex(folder, task) {
  if (process.platform !== "win32") throw new Error("Le lancement de Codex depuis Projet Hub est disponible sous Windows.");
  const executable = await findCodex();
  const temporary = await mkdtemp(join(tmpdir(), "projet-hub-codex-"));
  const schema = join(temporary, "result.json");
  const cleanup = async () => {
    await unlink(schema).catch(() => {});
    await rmdir(temporary).catch(() => {});
  };
  try {
    await writeFile(schema, JSON.stringify(taskOutputSchema), { flag: "wx" });
    const prompt = [
      "Travaille sur la tâche Projet Hub décrite ci-dessous, dans les limites de la lecture seule.",
      "Réponds en français. Dans le résultat final, utilise completed seulement si la demande a été accomplie et vérifiée. Utilise incomplete pour un résultat partiel ou bloqué. Résume ce qui a été fait et ce qui reste.",
      JSON.stringify(task)
    ].join("\n\n");
    const child = spawn(executable, ["-c", 'approval_policy="never"', "exec", "--sandbox", "read-only",
      "--skip-git-repo-check", "--json", "--output-schema", schema, "-"], {
      cwd: folder, windowsHide: true, stdio: ["pipe", "pipe", "ignore"]
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let turn;
    let message = "";
    let failure = "";
    let start;
    const started = new Promise(resolve => { start = resolve; });
    lines.on("line", line => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      if (event?.type === "thread.started") start(new Date().toISOString());
      if (event?.type === "item.completed" && event.item?.type === "agent_message" &&
          typeof event.item.text === "string") message = event.item.text.slice(0, 16000);
      if (event?.type === "turn.completed") turn = "completed";
      if (event?.type === "turn.failed") turn = "failed";
      if (event?.type === "error" || event?.type === "turn.failed") {
        const detail = event.error?.message ?? event.message;
        if (typeof detail === "string") failure = detail.slice(0, 4000);
      }
    });
    child.on("error", () => { turn = "failed"; });
    child.stdin.on("error", () => {});
    const result = new Promise(resolve => {
      child.once("close", async code => {
        start(null);
        await cleanup();
        resolve(taskOutcome(turn, code, message, failure));
      });
    });
    child.stdin.end(prompt);
    const at = await started;
    if (!at) {
      const outcome = await result;
      throw new Error(outcome.summary || "Codex n’a pas démarré de session. Vérifiez la connexion et la version de Codex CLI.");
    }
    return { at, result, stop: () => child.kill() };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

module.exports = { launchCodex, launchTaskCodex };
