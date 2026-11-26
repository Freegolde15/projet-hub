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
  codexLaunched: "Codex lancé",
  taskCodexLaunched: "Session Codex lancée depuis une tâche"
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
const activeTaskCodex = new Set();
const unsavedCodexResults = new Map();
const codexResultLabels = {
  completed: "Codex indique que la demande a été accomplie.",
  incomplete: "Codex indique que le travail reste incomplet.",
  failed: "La session Codex a échoué.",
  interrupted: "La session Codex s’est arrêtée avant de fournir un résultat final.",
  unconfirmed: "Codex a répondu sans confirmer l’état de la tâche."
};
const taskFilters = { deadline: "Toutes", status: "Tous", priority: "Toutes", sort: "Échéance" };

try {
  const saved = localStorage.getItem(storageKey);
  lastProjectId = localStorage.getItem(lastProjectKey);
  if (saved) {
    const state = readState(saved);
    projects = state.projects;
    lastProjectId = state.lastProjectId;
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
  const [page, id, section, anchor] = location.hash.split("/");
  const project = projects.find(item => item.id === id);
  return { project, anchor, settings: page === "#parametres", section: Object.hasOwn(pages, section) ? section : "tableau" };
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
    <section class="panel">
      <label>Rechercher dans Projet Hub<input type="search" id="global-search" placeholder="Projet, tâche, note, lien…" autocomplete="off" aria-controls="search-results"></label>
      <div id="search-results" aria-live="polite"></div>
    </section>
    ${deadlineSummary()}
    <div class="section-heading"><h2>Tous les projets</h2><div class="card-actions">
      <a class="button secondary" href="#parametres">Sauvegarde et restauration</a>
    </div></div>
    <section class="project-grid" aria-label="Tous les projets">
      ${sorted.length ? sorted.map(projectCard).join("") : empty("Créez votre premier projet avec le bouton « Nouveau projet ».")}
    </section>`;
}

function settingsPage() {
  return `<div class="page-heading"><h1>Paramètres</h1></div>
    <section class="panel"><h2>Sauvegarde et restauration</h2>
      <p>La sauvegarde JSON contient vos projets, leurs pièces jointes et vos paramètres. Les dossiers de code sont référencés par leur chemin.</p>
      <p>${windows ? "Vous choisissez où enregistrer le fichier." : "Le fichier est enregistré dans les téléchargements de votre navigateur ou à l’emplacement que vous choisissez."}
        Pour restaurer vos données sur un autre PC, copiez le fichier JSON, puis ouvrez ces paramètres et choisissez « Importer une sauvegarde ».</p>
      <div class="actions">${button("backup-export", "Exporter une sauvegarde", "", "primary")}
        ${button("backup-import", "Importer une sauvegarde")}</div>
      <p id="backup-location" class="wrap" role="status" hidden></p>
    </section>`;
}

function searchText(value) {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
}

function searchResults(query) {
  const words = searchText(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const results = [];
  const collections = [
    ["tasks", "taches", "Tâche"], ["notes", "fichiers", "Note"],
    ["discussions", "discussions", "Discussion"], ["tools", "outils", "Lien"],
    ["files", "fichiers", "Fichier"]
  ];
  for (const project of projects) {
    const add = (section, label, title, details, anchor = "") => {
      const searchable = searchText([title, ...details].join(" "));
      if (words.every(word => searchable.includes(word))) {
        results.push(`<li><a href="${projectUrl(project, section)}${anchor}">${escapeHtml(title)}</a>
          <span class="muted"> · ${label}${section === "tableau" ? "" : " · " + escapeHtml(project.name)}</span></li>`);
      }
    };
    add("tableau", "Projet", project.name, [project.description, project.status, project.type, project.folderReference]);
    for (const [collection, section, label] of collections) {
      for (const item of project[collection]) {
        add(section, label, item.title, [item.description, item.content, item.url, item.codexInstructions], `/${collection}-${item.id}`);
      }
    }
    for (const url of project.context?.links ?? []) add("contexte", "Lien", url, []);
    if (project.context?.repository) add("contexte", "Dépôt GitHub", project.context.repository, []);
  }
  return results.length ? `<ul class="result-list">${results.join("")}</ul>` : empty("Aucun résultat ne correspond à cette recherche.");
}

function validDeadline(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function localToday() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part, index) =>
    String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
}

function deadlineGroup(deadline, today) {
  if (!validDeadline(deadline)) return "Sans échéance";
  if (deadline < today) return "En retard";
  return deadline === today ? "Aujourd’hui" : "À venir";
}

const deadlineGroups = ["En retard", "Aujourd’hui", "À venir", "Sans échéance"];
const deadlineFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

function compareDeadlines(first, second) {
  return (first.deadline || "9999-99-99").localeCompare(second.deadline || "9999-99-99");
}

function deadlineSummary() {
  const today = localToday();
  const dated = projects.flatMap(project => project.tasks
    .filter(task => task.status !== "Terminé" && validDeadline(task.deadline))
    .map(task => ({ project, task }))).sort((a, b) => compareDeadlines(a.task, b.task));
  return `<section class="panel"><h2>Échéances des tâches</h2>
    <div class="deadline-grid">${deadlineGroups.slice(0, 3).map(label => {
      const items = dated.filter(({ task }) => deadlineGroup(task.deadline, today) === label);
      return `<div><h3>${label} ${badge(items.length)}</h3>
        ${items.length ? `<ul class="result-list">${items.map(({ project, task }) =>
          `<li><a href="${projectUrl(project, "taches")}/tasks-${task.id}">${escapeHtml(task.title)}</a>
            <span class="muted"> · ${escapeHtml(project.name)} · ${deadlineFormat.format(new Date(task.deadline))}</span></li>`).join("")}</ul>`
          : '<p class="muted">Aucune tâche.</p>'}</div>`;
    }).join("")}</div>
  </section>`;
}

function taskCard(project, task) {
  const key = project.id + "/" + task.id;
  const running = activeTaskCodex.has(key);
  const result = unsavedCodexResults.get(key) ?? task.codexResult;
  const actions = result?.pending && !running ? `<div class="actions">
    ${button("tasks-codexcomplete", "Marquer comme terminée", task.id, result.state === "completed" ? "primary" : "secondary")}
    ${button("tasks-codexkeep", "Laisser en cours", task.id, result.state === "completed" ? "secondary" : "primary")}
  </div>` : "";
  const report = result && !running ? `<details ${result.pending ? "open" : ""}>
    <summary>Résultat Codex</summary>
    <p class="muted">${codexResultLabels[result.state]}</p>
    ${result.summary ? `<p class="wrap">${escapeHtml(result.summary)}</p>` : ""}
    ${actions}
  </details>` : "";
  return `<article class="panel" id="tasks-${task.id}" tabindex="-1">
    <div class="item-top"><h3>${escapeHtml(task.title)}</h3><div class="tags">
      ${statusBadge(task.status)}${badge(`Priorité ${task.priority.toLowerCase()}`, task.priority === "Haute" ? "red" : "")}
    </div></div>
    ${validDeadline(task.deadline) ? `<p class="muted">Échéance · <time datetime="${task.deadline}">${deadlineFormat.format(new Date(task.deadline))}</time></p>` : ""}
    ${task.description ? `<p class="muted wrap">${escapeHtml(task.description)}</p>` : ""}
    ${running ? '<p class="muted" role="status">Session Codex en cours…</p>' : report}
    <div class="form-actions">
      ${windows && !running && !result?.pending ? button("tasks-codex", "Travailler avec Codex", task.id) : ""}
      ${task.status !== "Terminé" && !result?.pending ? button("tasks-complete", "Terminer", task.id) : ""}
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
    <div class="stack">${important.map(task => taskCard(project, task)).join("") || empty("Aucune tâche de priorité haute à terminer.")}</div>
    ${recentActivity(project)}`;
}

function taskList(project, anchor) {
  const today = localToday();
  const tasks = project.tasks.filter(task =>
    anchor === `tasks-${task.id}` ||
    ((taskFilters.deadline === "Toutes" || deadlineGroup(task.deadline, today) === taskFilters.deadline) &&
     (taskFilters.status === "Tous" || task.status === taskFilters.status) &&
     (taskFilters.priority === "Toutes" || task.priority === taskFilters.priority)));
  const comparators = {
    Échéance: compareDeadlines,
    Statut: (a, b) => taskStatuses.indexOf(a.status) - taskStatuses.indexOf(b.status),
    Priorité: (a, b) => priorities.indexOf(b.priority) - priorities.indexOf(a.priority)
  };
  tasks.sort(comparators[taskFilters.sort]);
  return tasks.map(task => taskCard(project, task)).join("") || empty("Aucune tâche ne correspond aux filtres.");
}

function tasksPage(project) {
  return `<div class="panel deadline-grid" id="task-filters">
    ${field("deadline", "Échéance", taskFilters.deadline, { choices: ["Toutes", ...deadlineGroups] })}
    ${field("status", "Statut", taskFilters.status, { choices: ["Tous", ...taskStatuses] })}
    ${field("priority", "Priorité", taskFilters.priority, { choices: ["Toutes", ...priorities] })}
    ${field("sort", "Trier par", taskFilters.sort, { choices: ["Échéance", "Statut", "Priorité"] })}
  </div><div class="stack" id="task-list" aria-live="polite">${taskList(project, route().anchor)}</div>`;
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
    return `<article class="panel" id="${collection}-${item.id}" tabindex="-1"><h3>${title}</h3>${content}<div class="form-actions">
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
        ${project.folderReference ? `<section class="panel"><h2>Dossier référencé dans la sauvegarde</h2>
          <p class="muted wrap">${escapeHtml(project.folderReference)}</p>
          ${windows ? "<p>Utilisez « Associer un dossier existant » pour choisir son emplacement sur ce PC.</p>" : ""}
        </section>` : ""}
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
  const { project, section, settings } = route();
  document.title = project ? `${pages[section][0]} · ${project.name} · Projet Hub` : "Projet Hub";
  document.querySelector("#sidebar").innerHTML = `<a class="brand" href="#accueil"><span class="brand-mark" aria-hidden="true">▦</span>Projet Hub</a>
    <p class="nav-label">Espace de travail</p>
    <nav aria-label="Navigation principale">${navLink("#accueil", "Mes projets", "▣", !project && !settings)}
      ${navLink("#parametres", "Paramètres", pages.parametres[1], settings)}
      ${project ? Object.entries(pages).map(([key, [label, icon]]) => navLink(projectUrl(project, key), label, icon, key === section)).join("") : ""}
    </nav><p class="sidebar-foot">Données sur cet appareil</p>`;
  document.querySelector("#topbar").innerHTML = project
    ? `<a href="#accueil">Mes projets</a><span aria-hidden="true">›</span><strong>${escapeHtml(project.name)}</strong>`
    : `<strong>Espace de travail</strong><span aria-hidden="true">›</span><span>${settings ? "Paramètres" : "Mes projets"}</span>`;
  main.innerHTML = project ? projectPage(project, section) : settings ? settingsPage() : home();
  const folder = document.querySelector("#project-folder");
  if (project && folder) void updateFolder(project.id, folder);
  const contextStatus = document.querySelector("#context-status");
  if (project && contextStatus) void updateContextPage(project, contextStatus, document.querySelector("#context-references"));
}

function rememberOpenProject() {
  const { project } = route();
  if (!project || project.id === lastProjectId) return;
  try {
    changeProjects(() => project.id);
  } catch {
    // Keep the current session usable when storage is unavailable.
  }
}

function notify(message, url) {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimeout);
  toast.textContent = message;
  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = " Voir la tâche";
    toast.append(link);
  }
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 3800);
}

function readState(saved) {
  const state = JSON.parse(saved);
  return Array.isArray(state) ? { projects: state, lastProjectId: localStorage.getItem(lastProjectKey) } : state;
}

function changeProjects(change) {
  if (!storageAvailable) throw new Error("Le stockage du navigateur est inaccessible.");
  const saved = localStorage.getItem(storageKey);
  const state = saved ? readState(saved) : { projects, lastProjectId };
  const next = structuredClone(state.projects);
  const nextLast = change(next, state.lastProjectId) ?? state.lastProjectId;
  const selected = next.some(project => project.id === nextLast) ? nextLast : null;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ projects: next, lastProjectId: selected }));
  } catch {
    throw new Error("Enregistrement impossible. Vérifiez l’espace disponible dans ce navigateur.");
  }
  projects = next;
  lastProjectId = selected;
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

async function downloadBackup(state = { projects, lastProjectId }, recovery = false) {
  if (!storageAvailable) throw new Error("Les données locales sont inaccessibles.");
  const portable = await Promise.all(state.projects.map(async project => {
    const folderReference = (windows && await windowsAction("folder", project.id)) || project.folderReference;
    return { ...project, folderReference };
  }));
  const backup = {
    format: "projet-hub", version: 2, projects: portable,
    settings: { lastProjectId: portable.some(project => project.id === state.lastProjectId) ? state.lastProjectId : null }
  };
  const content = JSON.stringify(backup);
  const filename = `projet-hub-${recovery ? "avant-restauration-" : ""}${localToday()}.json`;
  if (windows) {
    const path = await windowsAction("saveBackup", filename, content);
    if (path) {
      const status = document.querySelector("#backup-location");
      if (status) {
        status.textContent = `Sauvegarde enregistrée dans ${path}`;
        status.hidden = false;
      }
      notify(`Sauvegarde enregistrée dans ${path}`);
    }
    return Boolean(path);
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  notify(`Téléchargement lancé pour ${filename}.`);
  return true;
}

function readBackup(backup) {
  if (backup?.format !== "projet-hub" || ![1, 2].includes(backup.version) || !Array.isArray(backup.projects)) {
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
  const imported = unique(backup.projects, project => {
    const fields = validate(project, {
      name: "string", description: "string", status: projectStatuses,
      updated: value => typeof value === "string" && Number.isFinite(Date.parse(value))
    });
    fields.updated = new Date(fields.updated).toISOString();
    if (project.folderReference !== undefined) {
      Object.assign(fields, validate(project, {
        folderReference: value => typeof value === "string" && value.length <= 32767 && !value.includes("\0")
      }));
    }
    if (project.type !== undefined) Object.assign(fields, validate(project, { type: projectTypes }));
    for (const [collection, schema] of Object.entries(schemas)) {
      fields[collection] = unique(project[collection], item => {
        const entry = validate(item, { title: "string", ...schema });
        if (collection === "tasks" && item.deadline !== undefined && item.deadline !== "") {
          Object.assign(entry, validate(item, { deadline: validDeadline }));
        }
        if (collection === "tasks" && item.codexInstructions !== undefined) {
          Object.assign(entry, validate(item, {
            codexInstructions: value => typeof value === "string" && value.length <= 4000 && !value.includes("\0")
          }));
        }
        if (collection === "tasks" && item.codexResult !== undefined) {
          entry.codexResult = validate(item.codexResult, {
            state: Object.keys(codexResultLabels),
            summary: value => typeof value === "string" && value.length <= 4000,
            pending: "boolean"
          });
        }
        if (collection === "files") {
          const encoded = entry.data.slice(entry.data.indexOf(",") + 1);
          let decodedSize;
          try {
            decodedSize = atob(encoded).length;
          } catch {
            throw new Error("La sauvegarde contient une pièce jointe illisible.");
          }
          if (decodedSize !== entry.size) throw new Error("La sauvegarde contient une pièce jointe de taille incorrecte.");
        }
        return entry;
      });
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
  const lastProjectId = backup.version === 2 ? backup.settings?.lastProjectId : null;
  if (backup.version === 2 && lastProjectId !== null && !imported.some(project => project.id === lastProjectId)) {
    throw new Error("Le dernier projet ouvert indiqué dans la sauvegarde est invalide.");
  }
  return { projects: imported, lastProjectId };
}

function mergeBackup(next, imported) {
  const ids = new Map();
  const signature = project => {
    const [{ id, folderReference, ...content }] = readBackup({ format: "projet-hub", version: 1, projects: [project] }).projects;
    return JSON.stringify(content);
  };
  const byId = new Map(next.map(project => [project.id, project]));
  const byContent = new Map(next.map(project => [signature(project), project]));
  for (const project of imported) {
    const key = signature(project);
    const sameId = byId.get(project.id);
    const match = sameId && (signature(sameId) === key || sameId.name === project.name || project.id.includes("-")) ? sameId : byContent.get(key);
    if (match) {
      ids.set(project.id, match.id);
      match.folderReference ||= project.folderReference;
      match.context ??= project.context;
      for (const collection of [...Object.keys(entries), "activity"]) {
        const items = match[collection] ??= [];
        const existingIds = new Set(items.map(item => item.id));
        items.push(...project[collection].filter(item => !existingIds.has(item.id)));
      }
      byContent.set(signature(match), match);
    } else {
      const addition = { ...project, id: sameId ? crypto.randomUUID() : project.id };
      next.push(addition);
      byId.set(addition.id, addition);
      byContent.set(key, addition);
      ids.set(project.id, addition.id);
    }
  }
  return ids;
}

function importProjects() {
  showForm("Importer une sauvegarde",
    '<label>Sauvegarde Projet Hub<input name="backup" type="file" accept=".json,application/json" required></label>',
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
      const counts = Object.keys(entries).map(key => imported.projects.reduce((total, project) => total + project[key].length, 0));
      const folders = imported.projects.filter(project => project.folderReference).length;
      const labels = ["tâches", "liens", "notes", "discussions", "pièces jointes"];
      dialog.close();
      showForm("Confirmer la restauration", `<p class="wrap"><strong>${escapeHtml(file.name)}</strong></p>
        <p>${imported.projects.length} projet(s) · ${counts.map((count, index) => count + " " + labels[index]).join(" · ")}
        · ${folders} dossier(s) référencé(s)</p>
        ${imported.lastProjectId ? "<p>La sauvegarde indique aussi le dernier projet ouvert.</p>" : ""}
        <p class="muted">La fusion conserve les éléments présents en cas de conflit. Le remplacement crée d’abord une sauvegarde de récupération.</p>
        ${field("mode", "Mode de restauration", "Fusionner les projets", { choices: ["Fusionner les projets", "Remplacer les données actuelles"] })}`,
        async selection => {
          if (dataText(selection, "mode") === "Remplacer les données actuelles") {
            const before = localStorage.getItem(storageKey);
            const state = before ? readState(before) : { projects, lastProjectId };
            if (!await downloadBackup(state, true)) return false;
            const restore = () => {
              if (before !== localStorage.getItem(storageKey)) {
                throw new Error("Les données ont changé pendant la sauvegarde. Relancez la restauration.");
              }
              changeProjects(next => {
                next.splice(0, next.length, ...imported.projects);
                return imported.lastProjectId || "";
              });
              successMessage = "Données restaurées. Retrouvez la sauvegarde de récupération dans le fichier projet-hub-avant-restauration.";
            };
            if (!windows) {
              dialog.close();
              showForm("Remplacer les données actuelles",
                '<p>Vérifiez que le téléchargement du fichier projet-hub-avant-restauration est terminé et que vous pouvez le retrouver.</p><label class="check-field"><input type="checkbox" required> La sauvegarde de récupération est enregistrée.</label>',
                restore);
              document.querySelector("#submit").textContent = "Remplacer les données";
              return false;
            }
            restore();
          } else {
            changeProjects((next, selected) => {
              if (!imported.projects.length) return selected;
              const ids = mergeBackup(next, imported.projects);
              return selected || ids.get(imported.lastProjectId) || "";
            });
            successMessage = "Fusion terminée.";
          }
        });
      document.querySelector("#submit").textContent = "Restaurer";
      return false;
    });
  document.querySelector("#submit").textContent = "Vérifier le fichier";
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

function updateCodexTask(project, taskId, update) {
  changeEntry(project, "tasks", (tasks, currentProject) => {
    const current = tasks.find(task => task.id === taskId);
    if (!current) throw new Error("Cette tâche a déjà été supprimée.");
    update(current, currentProject);
  });
}

async function workWithCodex(project, task) {
  const key = project.id + "/" + task.id;
  if (activeTaskCodex.has(key) || task.codexResult?.pending || unsavedCodexResults.has(key)) return;
  if (!storageAvailable) {
    notify("Le stockage des projets est inaccessible.");
    return;
  }
  activeTaskCodex.add(key);
  render();
  const taskUrl = `${projectUrl(project, "taches")}/tasks-${task.id}`;
  try {
    const session = await windowsAction("openTaskCodex", project.id, task.id, {
      title: task.title, description: task.description, instructions: task.codexInstructions ?? ""
    });
    const waiting = windowsAction("taskCodexResult", project.id, task.id, session.id);
    let activityId;
    try {
      updateCodexTask(project, task.id, (current, currentProject) => {
        current.status = "En cours";
        addActivity(currentProject, "taskCodexLaunched", current.title, session.at);
        activityId = currentProject.activity[0].id;
      });
      notify("Session Codex lancée.", taskUrl);
    } catch (error) {
      activityId = undefined;
      notify(`Codex a démarré. ${error.message}`, taskUrl);
    }
    if (route().project?.id === project.id) render();
    const result = await waiting;
    const review = { ...result, pending: true };
    try {
      updateCodexTask(project, task.id, (current, currentProject) => {
        if (activityId && !currentProject.activity?.some(event => event.id === activityId)) {
          throw new Error("La tâche a changé depuis le lancement.");
        }
        current.codexResult = review;
      });
      notify("Résultat Codex disponible.", taskUrl);
    } catch (error) {
      const currentProject = projects.find(item => item.id === project.id);
      if (currentProject?.tasks.some(item => item.id === task.id) &&
          (!activityId || currentProject.activity?.some(event => event.id === activityId))) {
        unsavedCodexResults.set(key, review);
        notify(`Résultat Codex disponible pour cette ouverture. ${error.message}`, taskUrl);
      } else {
        notify(`Session Codex terminée. ${error.message}`);
      }
    }
  } catch (error) {
    notify(error.message);
  } finally {
    activeTaskCodex.delete(key);
    if (route().project?.id === project.id) render();
  }
}

function reviewCodexTask(project, taskId, complete) {
  const key = project.id + "/" + taskId;
  if (activeTaskCodex.has(key)) return;
  try {
    updateCodexTask(project, taskId, (task, currentProject) => {
      const result = unsavedCodexResults.get(key) ?? task.codexResult;
      if (!result?.pending) return;
      if (complete && task.status !== "Terminé") {
        addActivity(currentProject, "taskCompleted", task.title, currentProject.updated);
      }
      task.status = complete ? "Terminé" : "En cours";
      task.codexResult = { ...result, pending: false };
    });
    unsavedCodexResults.delete(key);
    render();
    notify(complete ? "Tâche terminée." : "Tâche laissée en cours.");
  } catch (error) {
    notify(error.message);
  }
}

function editEntry(project, collection, item) {
  let fields = field("title", "Titre", item?.title);
  if (collection === "tasks") {
    fields += field("description", "Description", item?.description, { type: "textarea", required: false, limit: 4000 }) +
      field("codexInstructions", "Consignes pour Codex (facultatives)", item?.codexInstructions, { type: "textarea", required: false, limit: 4000 }) +
      field("priority", "Priorité", item?.priority ?? "Normale", { choices: priorities }) +
      field("status", "Statut", item?.status, { choices: taskStatuses }) +
      field("deadline", "Date limite (facultative)", item?.deadline, { type: "date", required: false });
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
        values.codexInstructions = dataText(data, "codexInstructions");
        values.priority = dataText(data, "priority");
        values.status = dataText(data, "status");
        values.deadline = dataText(data, "deadline");
        if (values.deadline && !validDeadline(values.deadline)) throw new Error("Saisissez une date limite valide.");
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
      if (action === "export") void downloadBackup().catch(error => notify(error.message));
      if (action === "import") importProjects();
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
    } else if (collection === "tasks" && action === "codex" && windows) {
      void workWithCodex(project, item);
    } else if (collection === "tasks" && (action === "codexcomplete" || action === "codexkeep")) {
      reviewCodexTask(project, item.id, action === "codexcomplete");
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

document.addEventListener("input", event => {
  if (event.target.id === "global-search") {
    document.querySelector("#search-results").innerHTML = searchResults(event.target.value);
  }
});

document.addEventListener("change", event => {
  if (!event.target.closest("#task-filters")) return;
  taskFilters[event.target.name] = event.target.value;
  const { project } = route();
  document.querySelector("#task-list").innerHTML = taskList(project);
});

function focusResult() {
  const { anchor } = route();
  const result = anchor && document.getElementById(anchor);
  if (result) {
    result.focus({ preventScroll: true });
    result.scrollIntoView({ block: "center" });
  }
}

document.addEventListener("keydown", event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k" || dialog.open) return;
  event.preventDefault();
  if (!document.querySelector("#global-search")) {
    window.addEventListener("hashchange", () => document.querySelector("#global-search")?.focus(), { once: true });
    location.hash = "#accueil";
  } else {
    document.querySelector("#global-search").focus();
  }
});

window.addEventListener("hashchange", () => {
  rememberOpenProject();
  render();
  window.scrollTo(0, 0);
  focusResult();
});
window.addEventListener("storage", event => {
  if (event.key === storageKey && event.newValue) {
    const state = readState(event.newValue);
    projects = state.projects;
    lastProjectId = state.lastProjectId;
    if (dialog.open && !document.querySelector("#submit").disabled) dialog.close();
    render();
  }
});
rememberOpenProject();
render();
focusResult();
if (!storageAvailable) notify("Les données locales sont inaccessibles. Vérifiez les paramètres de stockage du navigateur.");
