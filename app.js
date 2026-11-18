"use strict";

const storageKey = "projet-hub-v1";
const lastProjectKey = "projet-hub-last-project";
const projectStatuses = ["À planifier", "En cours", "Terminé"];
const projectTypes = ["Site web", "Application Windows", "Jeu Roblox", "Projet Minecraft", "Autre"];
const createFolderMode = "Créer un dossier";
const associateFolderMode = "Associer un dossier existant";
const taskStatuses = ["À faire", "En cours", "Terminé"];
const priorities = ["Basse", "Normale", "Haute"];
const toolTypes = ["Discussion ChatGPT", "Codex", "Site web ou aperçu", "Dépôt GitHub", "Autre lien"];
const pages = {
  tableau: ["Tableau de bord", "▦"],
  contexte: ["Contexte", "▤"],
  taches: ["Tâches", "☑"],
  discussions: ["Discussions", "◫"],
  outils: ["Outils", "↗"],
  fichiers: ["Fichiers et notes", "▤"],
  parametres: ["Paramètres du projet", "⚙"]
};
const contextFields = {
  objective: "Objectif",
  needs: "Besoins",
  style: "Style",
  constraints: "Contraintes",
  state: "État actuel",
  nextSteps: "Prochaines étapes"
};
const contextLimit = 12000;
const linkLimit = 100;
const unspecifiedType = "Non renseigné";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const activityDateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const activityLabels = {
  projectCreated: "Projet créé",
  projectEdited: "Projet modifié",
  folderChanged: "Dossier associé",
  taskAdded: "Tâche ajoutée",
  taskCompleted: "Tâche terminée",
  noteAdded: "Note ajoutée",
  fileAdded: "Fichier ajouté",
  codexLaunched: "Codex lancé"
};
const main = document.querySelector("#main");
const dialog = document.querySelector("#dialog");
const form = document.querySelector("#form");
const formError = document.querySelector("#form-error");
const windows = window.projetHubWindows;
let projects = [];
let lastProjectId;
let storageAvailable = true;
let pendingAction;
let toastTimeout;
let successMessage;

try {
  const saved = localStorage.getItem(storageKey);
  lastProjectId = localStorage.getItem(lastProjectKey);
  if (saved) {
    projects = JSON.parse(saved);
  } else {
    const now = new Date().toISOString();
    projects = [
      { name: "Site vitrine", description: "Préparer le contenu, le design et la mise en ligne du nouveau site.", status: "En cours" },
      { name: "Identité visuelle", description: "Rassembler les références et définir la palette, la typographie et les usages.", status: "À planifier" },
      { name: "Kit de lancement", description: "Centraliser les ressources et les documents nécessaires au lancement.", status: "Terminé" }
    ].map((project, index) => ({
      ...project, id: String(index + 1), updated: now, tools: [], notes: [], discussions: [], files: [], tasks: []
    }));
    projects[0].tasks.push(
      { id: "1", title: "Valider la structure du site", description: "", status: "En cours", priority: "Haute" },
      { id: "2", title: "Recenser les pages existantes", description: "", status: "Terminé", priority: "Normale" }
    );
    localStorage.setItem(storageKey, JSON.stringify(projects));
  }
} catch {
  storageAvailable = false;
}

function escapeHtml(value = "") {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function route() {
  const [, id, section] = location.hash.split("/");
  const project = projects.find(item => item.id === id);
  return { project, section: Object.hasOwn(pages, section) ? section : "tableau" };
}

function projectUrl(project, section = "tableau") {
  return `#projet/${project.id}/${section}`;
}

function symbol(icon) {
  return `<span class="symbol" aria-hidden="true">${icon}</span>`;
}

function badge(label, tone = "") {
  return `<span class="badge ${tone}">${escapeHtml(label)}</span>`;
}

function statusBadge(status) {
  return badge(status, { "En cours": "gold", "Terminé": "green" }[status]);
}

function button(action, label, id = "", kind = "secondary") {
  return `<button type="button" class="button ${kind}" data-action="${action}" data-id="${escapeHtml(id)}">${label}</button>`;
}

function iconButton(action, icon, label, id) {
  return `<button type="button" class="icon-button" data-action="${action}" data-id="${escapeHtml(id)}" aria-label="${label}" title="${label}">${symbol(icon)}</button>`;
}

function navLink(url, label, icon, active = false) {
  return `<a class="nav-link" href="${url}" ${active ? 'aria-current="page"' : ""}>${symbol(icon)}${escapeHtml(label)}</a>`;
}

function empty(message) {
  return `<p class="empty">${message}</p>`;
}

function stat(icon, tone, count, label) {
  return `<div class="stat"><span class="tile ${tone}">${symbol(icon)}</span><div><strong>${count}</strong><small>${label}</small></div></div>`;
}

function projectCard(project, index) {
  const tone = ["", "blue", "gold"][index % 3];
  return `<article class="card">
    <div class="card-top"><span class="tile ${tone}">${symbol(["▣", "◈", "▤"][index % 3])}</span>${statusBadge(project.status)}</div>
    <h3><a href="${projectUrl(project)}">${escapeHtml(project.name)}</a></h3>
    <p class="muted wrap">${escapeHtml(project.description || "Aucune description.")}</p>
    <div class="card-foot">
      <time datetime="${project.updated}" title="Dernière modification">Modifié le ${dateFormat.format(new Date(project.updated))}</time>
      <div class="card-actions">
        ${iconButton("project-edit", "✎", "Modifier le projet", project.id)}
        ${iconButton("project-delete", "×", "Supprimer le projet", project.id)}
      </div>
    </div>
  </article>`;
}

function home() {
  const sorted = [...projects].sort((first, second) => second.updated.localeCompare(first.updated));
  const lastProject = projects.find(project => project.id === lastProjectId);
  return `<section class="hero">
      <div><h1>Vos projets</h1><p class="muted">Retrouvez vos tâches, fichiers et outils dans un espace dédié à chaque projet.</p></div>
      <div class="actions">
        ${lastProject ? `<a class="button secondary" href="${projectUrl(lastProject)}" aria-label="Reprendre le projet ${escapeHtml(lastProject.name)}">Reprendre</a>` : ""}
        ${button("project-edit", "+ Nouveau projet", "", "primary")}
      </div>
    </section>
    <section class="stats" aria-label="État de vos projets">
      ${stat("▣", "", projects.length, "Projets au total")}
      ${stat("◷", "gold", projects.filter(project => project.status === "En cours").length, "En cours")}
      ${stat("✓", "blue", projects.filter(project => project.status === "Terminé").length, "Terminés")}
    </section>
    <div class="section-heading"><h2>Tous les projets</h2><div class="card-actions">
      ${button("backup-export", "Exporter les projets")}
      ${windows ? button("backup-import", "Importer des projets") : ""}
    </div></div>
    <section class="project-grid" aria-label="Tous les projets">
      ${sorted.length ? sorted.map(projectCard).join("") : empty("Créez votre premier projet avec le bouton « Nouveau projet ».")}
    </section>`;
}

function taskCard(task) {
  return `<article class="panel">
    <div class="item-top"><h3>${escapeHtml(task.title)}</h3><div class="tags">
      ${statusBadge(task.status)}${badge(`Priorité ${task.priority.toLowerCase()}`, task.priority === "Haute" ? "red" : "")}
    </div></div>
    ${task.description ? `<p class="muted wrap">${escapeHtml(task.description)}</p>` : ""}
    <div class="form-actions">
      ${task.status !== "Terminé" ? button("tasks-complete", "Terminer", task.id) : ""}
      ${button("tasks-edit", "Modifier", task.id)}
      ${button("tasks-delete", "Supprimer", task.id, "secondary danger")}
    </div>
  </article>`;
}

function addActivity(project, type, detail = "", at = new Date().toISOString()) {
  (project.activity ??= []).unshift({ id: crypto.randomUUID(), type, detail, at });
}

function recentActivity(project) {
  const activity = [...(project.activity ?? [])].sort((first, second) => second.at.localeCompare(first.at));
  return `<section class="panel activity">
    <h2>Activité récente</h2>
    ${activity.length ? `<ol>${activity.map(({ type, detail, at }) => `<li>
      <div class="item-top"><strong>${activityLabels[type]}</strong>
        <time datetime="${escapeHtml(at)}">${activityDateFormat.format(new Date(at))}</time></div>
      ${type === "codexLaunched"
        ? `<p class="wrap">${detail ? `Consigne envoyée\n${escapeHtml(detail)}` : "Aucune consigne envoyée."}</p>`
        : `<p class="wrap">${escapeHtml(detail)}</p>`}
    </li>`).join("")}</ol>` : empty("Aucune activité enregistrée pour ce projet.")}
  </section>`;
}

function dashboard(project) {
  const completed = project.tasks.filter(task => task.status === "Terminé").length;
  const percent = project.tasks.length ? Math.round(completed / project.tasks.length * 100) : 0;
  const important = project.tasks.filter(task => task.priority === "Haute" && task.status !== "Terminé");
  return `<section class="panel"><div class="item-top"><h2>À propos du projet</h2>${statusBadge(project.status)}</div>
      ${project.type ? `<p>${escapeHtml(project.type)}</p>` : ""}
      <p class="muted wrap">${escapeHtml(project.description || "Ajoutez une description dans les paramètres du projet.")}</p>
    </section>
    <section class="panel"><div class="item-top"><h2>Avancement</h2><strong>${percent} %</strong></div>
      <progress aria-label="Avancement des tâches" value="${percent}" max="100"></progress>
      <p class="muted">${completed} / ${project.tasks.length} tâches terminées</p>
    </section>
    <div class="section-heading"><h2>Tâches importantes</h2><a class="button secondary" href="${projectUrl(project, "taches")}">Voir les tâches →</a></div>
    <div class="stack">${important.map(taskCard).join("") || empty("Aucune tâche de priorité haute à terminer.")}</div>
    ${recentActivity(project)}`;
}

function tasksPage(project) {
  return taskStatuses.map(status => {
    const tasks = project.tasks.filter(task => task.status === status);
    return `<section class="group"><h2>${status} ${badge(tasks.length)}</h2><div class="stack">
      ${tasks.map(taskCard).join("") || empty("Aucune tâche dans cette catégorie.")}
    </div></section>`;
  }).join("");
}

function itemList(items, collection, message) {
  return `<div class="stack">${items.map(item => {
    const title = escapeHtml(item.title);
    let content = `<p class="muted wrap">${escapeHtml(item.content)}</p>`;
    let extra = button(`${collection}-edit`, "Modifier", item.id);
    if (collection === "tools") {
      const url = safeUrl(item.url);
      content = `<p class="muted wrap">${escapeHtml(item.type)} · ${escapeHtml(url)}</p>`;
      extra = (url ? `<a class="button secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>` : "") + extra;
    } else if (collection === "files") {
      content = `<p class="muted">${new Intl.NumberFormat("fr-FR").format(item.size)} octets</p>`;
      extra = button("files-download", "Télécharger", item.id);
    }
    return `<article class="panel"><h3>${title}</h3>${content}<div class="form-actions">
      ${extra}${button(`${collection}-delete`, "Supprimer", item.id, "secondary danger")}
    </div></article>`;
  }).join("") || empty(message)}</div>`;
}

function githubAddress(value) {
  const match = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([a-z0-9][a-z0-9-]*)\/([a-z0-9_.-]+)\/?$/i.exec(value);
  if (!match || value.length > 300) return "";
  const repo = match[2].replace(/\.git$/i, "");
  return repo && repo !== "." && repo !== ".." ? `https://github.com/${match[1].toLowerCase()}/${repo.toLowerCase()}` : "";
}

function contextLink(value) {
  if (typeof value !== "string" || value.length > 4000) return "";
  const address = safeUrl(value);
  if (!address) return "";
  const url = new URL(address);
  return url.username || url.password || (url.hostname === "github.com" && url.search) ? "" : address;
}

function projectContext(project) {
  const data = project.context || {};
  const links = [...(data.links || []), ...project.tools.map(tool => tool.url)];
  const tasks = project.tasks.filter(task => task.status !== "Terminé");
  return {
    name: project.name,
    objective: data.objective || project.description,
    type: project.type || "",
    needs: data.needs || "",
    style: data.style || "",
    constraints: data.constraints || "",
    state: data.state || project.status,
    nextSteps: data.nextSteps || tasks.map(task => "- " + task.title).join("\n").slice(0, contextLimit),
    repository: typeof data.repository === "string" ? githubAddress(data.repository) : "",
    links: [...new Set(links.map(contextLink).filter(Boolean))].slice(0, linkLimit)
  };
}

function contextPage(project) {
  const context = projectContext(project);
  return `<section class="panel">
    <dl class="context-details">
      ${Object.entries({ objective: "Objectif", type: "Type", ...contextFields }).map(([key, label]) =>
        `<dt>${label}</dt><dd class="wrap">${escapeHtml(context[key] || "À renseigner.")}</dd>`).join("")}
      <dt>Dépôt GitHub</dt><dd class="wrap">${context.repository
        ? `<a href="${escapeHtml(context.repository)}" target="_blank" rel="noopener noreferrer">${escapeHtml(context.repository)}</a>`
        : "Aucun dépôt lié."}</dd>
      <dt>Liens</dt><dd class="wrap">${context.links.map(url =>
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`).join("\n") || "Aucun lien renseigné."}</dd>
    </dl>
  </section>
  <section class="panel">
    <div class="item-top"><h2>Références</h2>${windows ? button("windows-references", "Importer des références") : ""}</div>
    ${windows
      ? '<p id="context-status" class="muted wrap" role="status">Vérification du dossier associé…</p><ul id="context-references" class="wrap" hidden></ul>'
      : '<p class="muted">L’import dans le dossier du projet est disponible dans l’application Windows.</p>'}
  </section>`;
}

function projectPage(project, section) {
  const layouts = {
    tableau: [project.name, "Tableau de bord du projet", windows ? button("windows-codex", "Ouvrir Codex", "", "primary") : "", () => dashboard(project)],
    contexte: ["Contexte", "", button("context-edit", "Modifier le contexte", "", "primary"), () => contextPage(project)],
    taches: ["Tâches", "", button("tasks-edit", "+ Nouvelle tâche", "", "primary"), () => tasksPage(project)],
    discussions: ["Discussions", "Consignez ici les échanges et décisions liés à ce projet.", button("discussions-edit", "+ Nouveau message", "", "primary"),
      () => itemList(project.discussions, "discussions", "Aucun message pour ce projet.")],
    outils: ["Outils", windows ? "Les liens externes s’ouvrent dans votre navigateur." : "Les liens externes s’ouvrent dans un nouvel onglet.", button("tools-edit", "+ Nouveau lien", "", "primary"),
      () => itemList(project.tools, "tools", "Aucun lien enregistré pour ce projet.")],
    fichiers: ["Fichiers et notes", "Les fichiers sont enregistrés sur cet appareil. Limite de 1 Mio par fichier, dans la limite de l’espace disponible.", "",
      () => `<div class="section-heading"><h2>Fichiers</h2>${button("files-edit", "+ Ajouter un fichier", "", "primary")}</div>
        ${itemList(project.files, "files", "Aucun fichier ajouté à ce projet.")}
        <div class="section-heading"><h2>Notes</h2>${button("notes-edit", "+ Nouvelle note", "", "primary")}</div>
        ${itemList(project.notes, "notes", "Aucune note pour ce projet.")}`],
    parametres: ["Paramètres du projet", "Modifiez les informations de votre projet.", "",
      () => `<section class="panel"><h2>Informations du projet</h2><p class="muted wrap">${escapeHtml(project.name)} · ${escapeHtml(project.status)}</p>
        <div class="form-actions">${button("project-edit", "Modifier le projet", project.id, "primary")}
        ${button("project-delete", "Supprimer le projet", project.id, "secondary danger")}</div></section>
        ${windows ? `<section class="panel">
          <h2>Dossier du projet sur le PC</h2>
          <p id="project-folder" class="muted wrap" role="status">Chargement du dossier…</p>
          <div class="form-actions">${button("windows-folder", "Associer un dossier existant")}</div>
        </section>` : ""}`]
  };
  const [title, description, action, content] = layouts[section];
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1>
    ${description ? `<p class="muted">${description}</p>` : ""}</div>${action}</div>${content()}`;
}

function render() {
  const { project, section } = route();
  document.title = project ? `${pages[section][0]} · ${project.name} · Projet Hub` : "Projet Hub";
  document.querySelector("#sidebar").innerHTML = `<a class="brand" href="#accueil"><span class="brand-mark" aria-hidden="true">▦</span>Projet Hub</a>
    <p class="nav-label">Espace de travail</p>
    <nav aria-label="Navigation principale">${navLink("#accueil", "Mes projets", "▣", !project)}
      ${project ? Object.entries(pages).map(([key, [label, icon]]) => navLink(projectUrl(project, key), label, icon, key === section)).join("") : ""}
    </nav><p class="sidebar-foot">Données sur cet appareil</p>`;
  document.querySelector("#topbar").innerHTML = project
    ? `<a href="#accueil">Mes projets</a><span aria-hidden="true">›</span><strong>${escapeHtml(project.name)}</strong>`
    : `<strong>Espace de travail</strong><span aria-hidden="true">›</span><span>Mes projets</span>`;
  main.innerHTML = project ? projectPage(project, section) : home();
  const folder = document.querySelector("#project-folder");
  if (project && folder) void updateFolder(project.id, folder);
  const contextStatus = document.querySelector("#context-status");
  if (project && contextStatus) void updateContextPage(project, contextStatus, document.querySelector("#context-references"));
}

function rememberOpenProject() {
  const { project } = route();
  if (!project) return;
  lastProjectId = project.id;
  try {
    localStorage.setItem(lastProjectKey, lastProjectId);
  } catch {
    // Keep the current session usable when storage is unavailable.
  }
}

function notify(message) {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 3800);
}

function changeProjects(change) {
  if (!storageAvailable) throw new Error("Le stockage du navigateur est inaccessible.");
  const saved = localStorage.getItem(storageKey);
  const next = saved ? JSON.parse(saved) : structuredClone(projects);
  change(next);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    throw new Error("Enregistrement impossible. Vérifiez l’espace disponible dans ce navigateur.");
  }
  projects = next;
}

function field(name, label, value = "", options = {}) {
  const { choices, type = "text", required = true, limit = 200 } = options;
  const attributes = `name="${name}" ${required ? "required" : ""}`;
  let input;
  if (choices) {
    input = `<select ${attributes}>${choices.map(choice =>
      `<option ${choice === value ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}</select>`;
  } else if (type === "textarea") {
    input = `<textarea ${attributes} maxlength="${limit}">${escapeHtml(value)}</textarea>`;
  } else {
    input = `<input ${attributes} type="${type}" maxlength="${limit}" value="${escapeHtml(value)}">`;
  }
  return `<label>${label}${input}</label>`;
}

function showForm(title, fields, action, removing = false) {
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#fields").innerHTML = fields;
  const submit = document.querySelector("#submit");
  submit.textContent = removing ? "Supprimer" : "Enregistrer";
  submit.classList.toggle("danger", removing);
  formError.hidden = true;
  pendingAction = action;
  successMessage = "";
  dialog.showModal();
}

function dataText(data, key) {
  return String(data.get(key) ?? "").trim();
}

function requiredText(data, key, label) {
  const value = dataText(data, key);
  if (!value) throw new Error(`Renseignez le champ « ${label} ».`);
  return value;
}

function editProject(project) {
  const id = project?.id ?? crypto.randomUUID();
  const createOnDisk = !project && windows;
  let parent = "";
  let preparedFolder;
  let parentLabel;
  let defaultLocation = "Documents\\Projet Hub";
  showForm(project ? "Modifier le projet" : "Nouveau projet",
    field("name", "Nom", project?.name, { limit: 100 }) +
    (project ? "" : field("type", "Type", "", { choices: projectTypes })) +
    field("description", "Description", project?.description, { type: "textarea", required: false, limit: 500 }) +
    field("status", "Statut", project?.status, { choices: projectStatuses }) +
    (createOnDisk ? field("folderMode", "Dossier du projet", "", { choices: [createFolderMode, associateFolderMode] }) +
      `<div id="new-project-location"><p id="new-project-parent" class="muted wrap" role="status"></p>
      <div class="form-actions">${button("project-parent", "Choisir un autre emplacement")}</div></div>` : ""),
    async data => {
      const values = {
        name: requiredText(data, "name", "Nom"),
        description: dataText(data, "description"),
        status: dataText(data, "status"),
        updated: new Date().toISOString()
      };
      if (!project) values.type = dataText(data, "type");
      if (createOnDisk) {
        if (!storageAvailable) throw new Error("Le stockage des projets est inaccessible.");
        const mode = dataText(data, "folderMode");
        const details = { name: values.name, type: values.type, description: values.description };
        const folderRequest = JSON.stringify([mode, parent, details]);
        if (preparedFolder !== folderRequest) {
          if (mode === associateFolderMode) {
            if (!await windowsAction("chooseFolder", id)) return false;
          } else {
            const result = await windowsAction("createFolder", id, details, parent);
            if (!result?.folder) {
              if (result?.parent) {
                parent = result.parent;
                parentLabel.textContent = parent;
              }
              return false;
            }
          }
          preparedFolder = folderRequest;
        }
      }
      changeProjects(next => {
        if (project) {
          const current = next.find(item => item.id === id);
          if (!current) throw new Error("Ce projet a déjà été supprimé.");
          Object.assign(current, values);
          addActivity(current, "projectEdited", current.name, current.updated);
        } else {
          const created = { ...values, id, tasks: [], tools: [], notes: [], discussions: [], files: [] };
          addActivity(created, "projectCreated", created.name, created.updated);
          next.push(created);
        }
      });
      if (!project) location.hash = projectUrl({ id });
      if (windows) successMessage = await syncSavedContext(projects.find(item => item.id === id));
    });
  if (!project) document.querySelector("#submit").textContent = "Créer le projet";
  if (!createOnDisk) return;

  const locationField = document.querySelector("#new-project-location");
  parentLabel = document.querySelector("#new-project-parent");
  parentLabel.textContent = defaultLocation;
  form.elements.folderMode.addEventListener("change", event => {
    locationField.hidden = event.target.value !== createFolderMode;
  });
  windowsAction("defaultParent", id).then(folder => {
    defaultLocation = folder;
    if (!parent) parentLabel.textContent = defaultLocation;
  }).catch(() => {});

  locationField.querySelector("button").addEventListener("click", async () => {
    const submit = document.querySelector("#submit");
    if (submit.disabled) return;
    submit.disabled = true;
    formError.hidden = true;
    try {
      const selected = await windowsAction("chooseParent", id);
      if (selected) parentLabel.textContent = parent = selected;
    } catch (error) {
      formError.textContent = error.message;
      formError.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

const entries = {
  tasks: ["Nouvelle tâche", "Modifier la tâche", "cette tâche"],
  tools: ["Nouveau lien externe", "Modifier le lien", "ce lien"],
  notes: ["Nouvelle note", "Modifier la note", "cette note"],
  discussions: ["Nouveau message", "Modifier le message", "ce message"],
  files: ["Ajouter un fichier", "", "ce fichier"]
};

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Ce fichier n’a pas pu être lu."));
    reader.readAsDataURL(file);
  });
}

function downloadBackup() {
  if (!storageAvailable) throw new Error("Les données locales sont inaccessibles.");
  const backup = { format: "projet-hub", version: 1, projects };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `projet-hub-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function readBackup(backup) {
  if (backup?.format !== "projet-hub" || backup.version !== 1 || !Array.isArray(backup.projects)) {
    throw new Error("Ce fichier n’est pas une sauvegarde Projet Hub compatible.");
  }
  const schemas = {
    tasks: { description: "string", status: taskStatuses, priority: priorities },
    tools: { type: toolTypes, url: value => Boolean(safeUrl(value)) },
    notes: { content: "string" },
    discussions: { content: "string" },
    files: {
      size: value => Number.isInteger(value) && value >= 0 && value <= 1024 * 1024,
      data: value => typeof value === "string" && /^data:[^,\r\n]*;base64,[a-z0-9+/]*={0,2}$/i.test(value)
    }
  };
  function validate(object, schema) {
    return Object.fromEntries(Object.entries(schema).map(([key, rule]) => {
      const value = object?.[key];
      const valid = Array.isArray(rule) ? rule.includes(value) : typeof rule === "function" ? rule(value) : typeof value === rule;
      if (!valid) throw new Error("La sauvegarde contient des données invalides.");
      return [key, value];
    }));
  }
  function unique(items, convert) {
    if (!Array.isArray(items)) throw new Error("La sauvegarde contient une liste invalide.");
    const ids = new Set();
    return items.map(item => {
      if (typeof item?.id !== "string" || ids.has(item.id) || !/^[a-z0-9-]{1,80}$/.test(item.id)) {
        throw new Error("La sauvegarde contient des identifiants invalides ou répétés.");
      }
      ids.add(item.id);
      return { id: item.id, ...convert(item) };
    });
  }
  return unique(backup.projects, project => {
    const fields = validate(project, {
      name: "string", description: "string", status: projectStatuses,
      updated: value => typeof value === "string" && Number.isFinite(Date.parse(value))
    });
    fields.updated = new Date(fields.updated).toISOString();
    if (project.type !== undefined) Object.assign(fields, validate(project, { type: projectTypes }));
    for (const [collection, schema] of Object.entries(schemas)) {
      fields[collection] = unique(project[collection], item => validate(item, { title: "string", ...schema }));
    }
    fields.activity = unique(project.activity === undefined ? [] : project.activity, item => {
      const event = validate(item, {
        type: Object.keys(activityLabels), detail: "string",
        at: value => typeof value === "string" && Number.isFinite(Date.parse(value))
      });
      event.at = new Date(event.at).toISOString();
      return event;
    });
    if (project.context !== undefined) {
      const textRule = value => typeof value === "string" && value.length <= contextLimit && !value.includes("\0");
      fields.context = validate(project.context, {
        ...Object.fromEntries(Object.keys(contextFields).map(key => [key, textRule])),
        repository: value => value === "" || (typeof value === "string" && Boolean(githubAddress(value))),
        links: value => Array.isArray(value) && value.length <= linkLimit &&
          value.every(link => typeof link === "string" && Boolean(contextLink(link)))
      });
      fields.context.repository = githubAddress(fields.context.repository);
      fields.context.links = fields.context.links.map(contextLink);
    }
    return fields;
  });
}

function importProjects() {
  showForm("Importer des projets", `<p>Les projets de la sauvegarde seront ajoutés à ceux de cet appareil.</p>
    <label>Sauvegarde Projet Hub<input name="backup" type="file" accept=".json,application/json" required></label>`,
  async data => {
    const file = data.get("backup");
    if (!file?.name || file.size > 32 * 1024 * 1024) throw new Error("Choisissez une sauvegarde JSON de 32 Mio maximum.");
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      throw new Error("Impossible de lire cette sauvegarde JSON.");
    }
    const imported = readBackup(backup);
    const existing = readBackup({ format: "projet-hub", version: 1, projects });
    const signature = ({ id, ...content }) => JSON.stringify(content);
    const known = new Map();
    for (const project of existing) {
      const key = signature(project);
      known.set(key, (known.get(key) ?? 0) + 1);
    }
    const additions = imported.filter(project => {
      const key = signature(project);
      const copies = known.get(key) ?? 0;
      if (copies === 0) return true;
      known.set(key, copies - 1);
      return false;
    });
    if (additions.length) {
      changeProjects(next => next.push(...additions.map(project => ({ ...project, id: crypto.randomUUID() }))));
    }
    successMessage = additions.length ? `Projets importés : ${additions.length}.` : "Aucun nouveau projet à importer.";
  });
  document.querySelector("#submit").textContent = "Importer";
}

async function windowsAction(method, ...args) {
  const result = await windows[method](...args);
  if (result.error) throw new Error(result.error);
  return result.value;
}

async function updateFolder(id, field) {
  try {
    field.textContent = await windowsAction("folder", id) || "Aucun dossier associé.";
  } catch (error) {
    field.textContent = error.message;
  }
}

async function syncSavedContext(project) {
  try {
    if (project && await windowsAction("folder", project.id)) {
      await windowsAction("syncContext", project.id, projectContext(project));
    }
  } catch (error) {
    return "Enregistré dans Projet Hub. Fiche sur disque : " + error.message;
  }
  return "";
}

async function updateContextPage(project, status, list) {
  try {
    if (!await windowsAction("folder", project.id)) {
      status.textContent = "Associez un dossier au projet dans ses paramètres pour y enregistrer la fiche et les références.";
      return;
    }
    let files;
    try {
      files = await windowsAction("syncContext", project.id, projectContext(project));
      status.textContent = files.length ? "Fichiers dans docs/references" : "Aucune référence dans docs/references.";
    } catch (error) {
      status.textContent = "Synchronisation de la fiche impossible. " + error.message;
      files = await windowsAction("references", project.id).catch(() => []);
    }
    list.replaceChildren(...files.map(name => {
      const item = document.createElement("li");
      item.textContent = name;
      return item;
    }));
    list.hidden = !files.length;
  } catch (error) {
    status.textContent = error.message;
  }
}

function editContext(project, repositoryOnly = false) {
  const context = projectContext(project);
  const repoField = field("repository", "Adresse du dépôt GitHub", context.repository, { required: false, limit: 300 });
  const editFields = Object.entries(contextFields).map(([key, label]) =>
    field(key, label, context[key], { type: "textarea", required: false, limit: contextLimit })).join("");
  showForm(repositoryOnly ? "Lier un dépôt GitHub" : "Modifier le contexte", repositoryOnly ? repoField :
    field("type", "Type", project.type || unspecifiedType, { choices: [unspecifiedType, ...projectTypes] }) +
    editFields + field("links", "Liens supplémentaires (un par ligne)", (project.context?.links || []).join("\n"),
      { type: "textarea", required: false, limit: contextLimit }) + repoField,
  async data => {
    const address = dataText(data, "repository");
    const repository = githubAddress(address);
    if (address && !repository) throw new Error("Saisissez l’adresse d’un dépôt GitHub sans identifiant ni jeton.");
    const values = Object.fromEntries(Object.keys(contextFields).map(key => {
      const saved = project.context?.[key] || "";
      const input = dataText(data, key);
      return [key, repositoryOnly || (!saved && input === context[key]) ? saved : input];
    }));
    const links = repositoryOnly ? project.context?.links || [] : dataText(data, "links").split(/\r?\n/).map(link => link.trim()).filter(Boolean);
    if (links.length > linkLimit || links.some(link => !contextLink(link))) {
      throw new Error("Indiquez jusqu’à 100 liens HTTP ou HTTPS sans identifiants, à raison d’un par ligne.");
    }
    changeProject(project, current => {
      current.context = { ...values, repository, links: [...new Set(links.map(contextLink))] };
      if (!repositoryOnly) {
        const type = dataText(data, "type");
        if (type === unspecifiedType) delete current.type;
        else if (projectTypes.includes(type)) current.type = type;
      }
      current.updated = new Date().toISOString();
      addActivity(current, "projectEdited", "Contexte du projet", current.updated);
    });
    if (windows) successMessage = await syncSavedContext(projects.find(item => item.id === project.id));
  });
}

function repositoryNotice(result) {
  if (result.status === "unlinked") {
    return `<p class="muted">Aucun dépôt GitHub lié. Vous pouvez ouvrir Codex ou lier le projet.</p>
      <div class="form-actions">${button("context-link", "Lier un dépôt GitHub")}</div>`;
  }
  const messages = {
    match: "Le dépôt GitHub correspond au dépôt distant de ce dossier.",
    mismatch: "Différence détectée entre le dépôt GitHub lié et le dépôt distant de ce dossier.",
    noRemote: "Le dossier Git ne contient aucun dépôt distant.",
    noGit: "Git est introuvable sur ce PC. La correspondance n’a pas pu être vérifiée.",
    unavailable: "Impossible de lire les dépôts distants Git du dossier associé.",
    invalid: "L’adresse du dépôt GitHub lié est invalide."
  };
  return `<p class="wrap" role="status"><strong>${messages[result.status]}</strong>${
    result.expected ? `<br>Dépôt lié · ${escapeHtml(result.expected)}` : ""}${
    result.remotes?.length ? `<br>Distant local · ${result.remotes.map(escapeHtml).join(", ")}` : ""}</p>`;
}

async function openCodexForm(project) {
  const folder = await windowsAction("folder", project.id);
  if (!folder) throw new Error("Aucun dossier associé. Choisissez-en un dans les paramètres du projet.");
  const context = projectContext(project);
  const [repository, sync] = await Promise.allSettled([
    windowsAction("checkRepository", project.id, context.repository),
    windowsAction("syncContext", project.id, context)
  ]);
  if (route().project?.id !== project.id || dialog.open) return;
  const notice = repositoryNotice(repository.status === "fulfilled" ? repository.value : { status: "unavailable", expected: context.repository });
  const syncWarning = sync.status === "rejected" ? `<p class="wrap" role="status">Fiche de contexte non synchronisée. ${escapeHtml(sync.reason.message)}</p>` : "";
  let launched;
  showForm("Ouvrir Codex", `<p class="muted wrap">${escapeHtml(folder)}</p>
    ${notice}${syncWarning}
    <p class="muted wrap" id="codex-file" role="status">Aucun fichier sélectionné.</p>
    <div class="form-actions">${button("windows-file", "Choisir un fichier")}</div>
    <input type="hidden" name="fileToken">
    ${field("prompt", "Consigne (facultative)", "", { type: "textarea", required: false, limit: 4000 })}`,
  async data => {
    if (!launched) {
      if (!storageAvailable) throw new Error("Le stockage des projets est inaccessible.");
      const prompt = await windowsAction("openCodex", project.id, dataText(data, "prompt"), dataText(data, "fileToken"));
      launched = { prompt, at: new Date().toISOString() };
      for (const input of document.querySelectorAll("#fields button, #fields textarea")) input.disabled = true;
      document.querySelector("#submit").textContent = "Enregistrer le lancement";
    }
    changeProject(project, current => addActivity(current, "codexLaunched", launched.prompt, launched.at));
    successMessage = "Codex CLI a été ouvert.";
  });
  document.querySelector("#submit").textContent = "Ouvrir Codex";
}

async function handleWindows(action, project, control) {
  const submit = document.querySelector("#submit");
  control.disabled = true;
  try {
    if (action === "folder") {
      const folder = await windowsAction("chooseFolder", project.id);
      if (folder) {
        changeProject(project, current => {
          current.updated = new Date().toISOString();
          addActivity(current, "folderChanged", folder, current.updated);
        });
        const warning = await syncSavedContext(projects.find(item => item.id === project.id));
        render();
        if (warning) notify(warning);
      }
    } else if (action === "codex") {
      await openCodexForm(project);
    } else if (action === "references") {
      const { imported, errors } = await windowsAction("importReferences", project.id);
      if (imported.length) {
        try {
          changeProject(project, current => {
            current.updated = new Date().toISOString();
            for (const name of imported) addActivity(current, "fileAdded", name, current.updated);
          });
        } finally {
          render();
        }
      }
      if (errors.length) notify(errors.join(" "));
      else if (imported.length) notify(`${imported.length} référence(s) copiée(s).`);
    } else if (action === "file") {
      submit.disabled = true;
      formError.hidden = true;
      const selection = await windowsAction("chooseFile", project.id);
      if (selection) {
        form.elements.fileToken.value = selection.token;
        document.querySelector("#codex-file").textContent = selection.name;
      }
    }
  } catch (error) {
    if (action === "file") {
      formError.textContent = error.message;
      formError.hidden = false;
    } else {
      notify(error.message);
    }
  } finally {
    control.disabled = false;
    if (action === "file") submit.disabled = false;
  }
}

function changeProject(project, change) {
  changeProjects(next => {
    const current = next.find(item => item.id === project.id);
    if (!current) throw new Error("Ce projet a déjà été supprimé.");
    change(current);
  });
}

function changeEntry(project, collection, change) {
  changeProject(project, current => {
    current.updated = new Date().toISOString();
    change(current[collection], current);
  });
}

function editEntry(project, collection, item) {
  let fields = field("title", "Titre", item?.title);
  if (collection === "tasks") {
    fields += field("description", "Description", item?.description, { type: "textarea", required: false, limit: 4000 }) +
      field("priority", "Priorité", item?.priority ?? "Normale", { choices: priorities }) +
      field("status", "Statut", item?.status, { choices: taskStatuses });
  } else if (collection === "tools") {
    fields += field("type", "Type de lien", item?.type, { choices: toolTypes }) +
      field("url", "Adresse du lien", item?.url, { type: "url", limit: 4000 });
  } else if (collection === "files") {
    fields = '<label>Fichier (1 Mio maximum)<input name="file" type="file" required></label>';
  } else {
    fields += field("content", "Contenu", item?.content, { type: "textarea", limit: 10000 });
  }

  showForm(entries[collection][item ? 1 : 0], fields, async data => {
    const values = { id: item?.id ?? crypto.randomUUID() };
    if (collection === "files") {
      const file = data.get("file");
      if (!file?.name) throw new Error("Choisissez un fichier.");
      if (file.size > 1024 * 1024) throw new Error("Choisissez un fichier de 1 Mio maximum.");
      Object.assign(values, { title: file.name, size: file.size, data: await fileData(file) });
    } else {
      values.title = requiredText(data, "title", "Titre");
      if (collection === "tasks") {
        values.description = dataText(data, "description");
        values.priority = dataText(data, "priority");
        values.status = dataText(data, "status");
      } else if (collection === "tools") {
        values.type = dataText(data, "type");
        values.url = safeUrl(dataText(data, "url"));
        if (!values.url) throw new Error("Saisissez une adresse commençant par https:// ou http://.");
      } else {
        values.content = requiredText(data, "content", "Contenu");
      }
    }
    changeEntry(project, collection, (items, currentProject) => {
      const at = currentProject.updated;
      if (item) {
        const current = items.find(entry => entry.id === item.id);
        if (!current) throw new Error("Cet élément a déjà été supprimé.");
        if (collection === "tasks" && current.status !== "Terminé" && values.status === "Terminé") {
          addActivity(currentProject, "taskCompleted", values.title, at);
        }
        Object.assign(current, values);
      } else {
        items.push(values);
        const addedTypes = { tasks: "taskAdded", notes: "noteAdded", files: "fileAdded" };
        if (addedTypes[collection]) addActivity(currentProject, addedTypes[collection], values.title, at);
        if (collection === "tasks" && values.status === "Terminé") {
          addActivity(currentProject, "taskCompleted", values.title, at);
        }
      }
    });
  });
}

function confirmDelete(description, details, action) {
  showForm("Confirmer la suppression",
    `<p>Supprimer ${description} ? ${details}</p>`, action, true);
}

function removeItem(items, id) {
  const index = items.findIndex(item => item.id === id);
  if (index !== -1) items.splice(index, 1);
}

document.addEventListener("click", event => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const [collection, action] = control.dataset.action.split("-");
  const id = control.dataset.id;
  const { project } = route();

  if (collection === "close") {
    if (!document.querySelector("#submit").disabled) dialog.close();
  } else if (collection === "context" && project) {
    if (action === "link") dialog.close();
    editContext(project, action === "link");
  } else if (collection === "backup") {
    try {
      if (action === "export") downloadBackup();
      if (action === "import" && windows) importProjects();
    } catch (error) {
      notify(error.message);
    }
  } else if (collection === "windows" && windows && project) {
    void handleWindows(action, project, control);
  } else if (collection === "project") {
    const selected = projects.find(candidate => candidate.id === id);
    if (action === "edit") editProject(selected);
    if (action === "delete" && selected) {
      confirmDelete(`le projet « ${escapeHtml(selected.name)} »`, "Ses tâches, liens, discussions, notes, fichiers et son activité seront aussi supprimés.", () => {
        changeProjects(next => removeItem(next, id));
        if (selected.id === project?.id) location.hash = "#accueil";
      });
    }
  } else if (project && Object.hasOwn(entries, collection)) {
    const item = project[collection].find(candidate => candidate.id === id);
    if (action === "edit") editEntry(project, collection, item);
    if (!item) return;
    if (action === "delete") {
      confirmDelete(entries[collection][2], "", () => {
        changeEntry(project, collection, items => removeItem(items, id));
      });
    } else if (action === "complete") {
      try {
        changeEntry(project, collection, (items, currentProject) => {
          const current = items.find(entry => entry.id === id);
          if (!current) throw new Error("Cette tâche a déjà été supprimée.");
          if (current.status !== "Terminé") {
            current.status = "Terminé";
            addActivity(currentProject, "taskCompleted", current.title, currentProject.updated);
          }
        });
        render();
        notify("Tâche terminée.");
      } catch (error) {
        notify(error.message);
      }
    } else if (action === "download") {
      const link = document.createElement("a");
      link.href = item.data;
      link.download = item.title;
      link.click();
    }
  }
});

dialog.addEventListener("cancel", event => {
  if (document.querySelector("#submit").disabled) event.preventDefault();
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = document.querySelector("#submit");
  if (submit.disabled) return;
  submit.disabled = true;
  formError.hidden = true;
  try {
    if (await pendingAction(new FormData(form)) === false) return;
    dialog.close();
    render();
    notify(successMessage || (submit.classList.contains("danger") ? "Suppression effectuée." : "Modifications enregistrées."));
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener("hashchange", () => {
  rememberOpenProject();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("storage", event => {
  if (event.key === lastProjectKey) {
    lastProjectId = event.newValue;
    if (!route().project) render();
  }
  if (event.key === storageKey && event.newValue) {
    projects = JSON.parse(event.newValue);
    if (dialog.open && !document.querySelector("#submit").disabled) dialog.close();
    render();
  }
});
rememberOpenProject();
render();
if (!storageAvailable) notify("Les données locales sont inaccessibles. Vérifiez les paramètres de stockage du navigateur.");
