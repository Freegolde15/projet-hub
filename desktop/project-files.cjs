"use strict";

const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const templates = {
  "Site web": {
    instructions: "Ouvrir index.html dans un navigateur.",
    files: {
      "index.html": '<!doctype html>\n<html lang="fr">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Mon site</title>\n<link rel="stylesheet" href="style.css">\n<main><h1>Bienvenue</h1></main>\n</html>\n',
      "style.css": "body { font-family: system-ui, sans-serif; margin: 2rem; }\n"
    }
  },
  "Application Windows": {
    instructions: "Installer le SDK .NET 8 et lancer `dotnet run` sous Windows.",
    files: {
      "Application.csproj": '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <OutputType>WinExe</OutputType>\n    <TargetFramework>net8.0-windows</TargetFramework>\n    <UseWindowsForms>true</UseWindowsForms>\n  </PropertyGroup>\n</Project>\n',
      "Program.cs": 'using System;\nusing System.Windows.Forms;\n\ninternal static class Program\n{\n    [STAThread]\n    private static void Main()\n    {\n        Application.EnableVisualStyles();\n        Application.Run(new Form { Text = "Mon application" });\n    }\n}\n'
    }
  },
  "Jeu Roblox": {
    instructions: "Depuis ce dossier, lancer `rojo serve` et connecter le plugin Rojo dans Roblox Studio.",
    files: {
      "default.project.json": JSON.stringify({
        name: "Jeu Roblox",
        tree: { $className: "DataModel", ServerScriptService: { $path: "src" } }
      }, null, 2) + "\n",
      "src/Main.server.luau": 'print("Bienvenue dans le jeu !")\n'
    }
  },
  "Projet Minecraft": {
    instructions: "Le fichier src/bienvenue.mcfunction contient une fonction de départ pour Minecraft Java. Intégrer cette fonction à un datapack correspondant à la version du jeu ciblée.",
    files: {
      "src/bienvenue.mcfunction": "say Bienvenue dans le projet !\n"
    }
  },
  "Autre": {
    instructions: "Utiliser le dossier src pour les fichiers de travail et compléter le README au fil du projet.",
    files: {
      "src/.gitkeep": ""
    }
  }
};

function validateProject({ name, type, description }) {
  if (typeof name !== "string" || !name.trim() || name.length > 100 ||
      /[<>:"/\\|?*\x00-\x1f]|[. ]$|^\s/.test(name) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)(?:\s*\.|$)/i.test(name)) {
    throw new Error("Choisissez un nom de dossier Windows valide, de 100 caractères maximum.");
  }
  if (typeof type !== "string" || !Object.hasOwn(templates, type) ||
      typeof description !== "string" || description.length > 500 || description.includes("\0")) {
    throw new Error("Le type ou la description du projet est invalide.");
  }
}

async function writeProjectFiles(folder, { name, type, description }) {
  const { instructions, files } = templates[type];
  const context = `Type de projet : ${type}\n\n${description || "Description à compléter."}\n`;
  const projectFiles = {
    "README.md": `# ${name}\n\n${context}\n## Démarrage\n\n${instructions}\n`,
    "AGENTS.md": `# Consignes Codex pour ${name}\n\n## Contexte\n\n${context}\n## Travail dans ce dossier\n\n- Lire le README.md pour connaître le point de départ.\n- Respecter le type et les objectifs du projet, ainsi que les consignes de l’utilisateur.\n- Vérifier les modifications avec les outils du projet et indiquer les vérifications effectuées.\n`,
    ...files
  };
  if (Object.keys(files).some(file => file.startsWith("src/"))) await mkdir(join(folder, "src"));
  for (const [file, content] of Object.entries(projectFiles)) {
    await writeFile(join(folder, file), content, { flag: "wx" });
  }
}

module.exports = { validateProject, writeProjectFiles };
