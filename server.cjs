"use strict";

const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const routes = new Map([
  ["/", ["index.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/app.js", ["app.js", "text/javascript"]]
]);
const host = "127.0.0.1";
const port = Number(process.env.PROJET_HUB_PORT || 4173);

createServer(async (request, response) => {
  const route = routes.get(request.url.split("?")[0]);
  if (!route) {
    response.writeHead(404).end("Page introuvable");
    return;
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const [file, type] = route;
    const content = await readFile(join(__dirname, file));
    response.writeHead(200, {
      "Content-Type": type + "; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    }).end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(500).end("Impossible de lire la page.");
  }
}).on("error", error => {
  console.error("Démarrage impossible :", error.message);
  process.exitCode = 1;
}).listen(port, host, () => console.log("Projet Hub est disponible sur http://" + host + ":" + port));
