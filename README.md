# Projet Hub

Application locale de gestion de projets en français.

## Démarrer

1. Dans ce dossier, exécuter `node server.cjs` avec Node.js 18 ou une version ultérieure.
2. Ouvrir [Projet Hub](http://127.0.0.1:4173/) dans un navigateur récent.
3. Créer son premier projet ou explorer les trois projets d’exemple, qui peuvent être modifiés et supprimés.

Pour arrêter le serveur, utiliser `Ctrl+C` dans le terminal.

## Données

Les projets sont enregistrés dans le navigateur. Pour les retrouver, rouvrir l’application avec la même adresse et le même profil de navigateur. Effacer les données du site efface aussi les projets. Les discussions servent à consigner des échanges et des décisions dans le projet. Les outils ouvrent des liens externes dans un nouvel onglet.

Chaque fichier peut peser jusqu’à 1 Mio. La capacité totale dépend de l’espace de stockage disponible dans le navigateur.

## Application Windows

Dans PowerShell, depuis le dossier du projet, avec Node.js 22.12 ou une version ultérieure et npm :

```powershell
npm.cmd install
npm.cmd run desktop
```

La version web se lance toujours avec `node server.cjs` ou `npm.cmd start`. L’application Windows garde ses données et les dossiers associés dans son profil Electron, sous `%APPDATA%\Projet Hub`.

### Créer ou associer un dossier de projet

Dans l’application Windows, cliquer sur **Nouveau projet**, puis renseigner le nom, le type et la description. Par défaut, Projet Hub crée un dossier au nom du projet sous **Documents\Projet Hub**. Le bouton **Choisir un autre emplacement** permet de sélectionner le dossier parent. Projet Hub ajoute les fichiers de départ du type choisi, un `README.md` et un `AGENTS.md`.

Si le dossier existe déjà, le dialogue permet de l’ouvrir et de l’associer tel quel, ou de sélectionner un autre emplacement. L’option **Associer un dossier existant** permet également de choisir directement le dossier d’un nouveau projet ou celui d’un projet déjà enregistré, via ses paramètres.

### Sauvegarder et restaurer les données

1. Ouvrir **Paramètres → Exporter une sauvegarde**. Sous Windows, choisir le dossier de destination. Dans le navigateur, retrouver le fichier JSON dans les téléchargements ou dans le dossier choisi.
2. Sur l'autre PC, ouvrir **Paramètres → Importer une sauvegarde** et sélectionner le JSON. Après vérification, le résumé indique le contenu du fichier.
3. Choisir **Fusionner les projets** pour compléter les données locales ou **Remplacer les données actuelles** pour restaurer l'ensemble du fichier. En cas de conflit, la fusion conserve la version locale. Le remplacement demande d'enregistrer d'abord une sauvegarde de récupération.

Le JSON comprend les projets, les pièces jointes, les paramètres et les chemins des dossiers associés. Les dossiers et leurs fichiers de code se transfèrent séparément. Pour retrouver un dossier sur le nouveau PC, utiliser **Paramètres du projet → Associer un dossier existant**. Les anciens exports JSON de Projet Hub restent importables.

### Rechercher et suivre les échéances

La recherche se trouve dans **Mes projets** et s'ouvre aussi avec **Ctrl+K**. Sélectionner un résultat ouvre le projet et la rubrique correspondante.

Dans **Tâches**, renseigner la **Date limite** à la création ou à la modification. Les filtres et le tri couvrent l'échéance, le statut et la priorité. L'accueil récapitule les tâches ouvertes en retard, prévues aujourd'hui et à venir. Le filtre **Sans échéance** retrouve les tâches sans date.

### Ouvrir Codex

Vérifier dans PowerShell que `codex --version` fonctionne. Au besoin, exécuter `npm.cmd install -g @openai/codex`, ouvrir un nouveau terminal et lancer `codex` pour se connecter. Projet Hub repère `codex.exe` sur le PATH ou dans l’installation npm globale standard.

Sur le tableau de bord d’un projet disposant d’un dossier associé, cliquer sur **Ouvrir Codex**. Le dialogue permet de sélectionner un fichier situé dans le dossier du projet et de saisir une consigne. Le chemin relatif du fichier est transmis à Codex dans la consigne. Les deux champs sont facultatifs. Codex s’ouvre dans une console Windows avec le dossier du projet comme répertoire de travail, en lecture seule avec demandes d’approbation dans la CLI. Projet Hub transmet la consigne comme un argument texte.

### Travailler sur une tâche avec Codex

Dans **Tâches**, le formulaire permet d’ajouter des **Consignes pour Codex**. L’action **Travailler avec Codex** transmet le titre, la description et les consignes à Codex CLI depuis le dossier associé au projet. Cette session s’exécute en arrière-plan, en lecture seule. Le bouton **Ouvrir Codex** du tableau de bord reste disponible pour une session interactive.

Quand Codex démarre, la tâche passe à **En cours** et le lancement apparaît dans l’activité. Laissez Projet Hub ouvert pendant la session. Son résultat et la proposition de Codex sont ensuite consultables sur la tâche, où vous pouvez choisir **Marquer comme terminée** ou **Laisser en cours**.

### Préparer le contexte d’un projet

Dans **Contexte**, renseigner l’objectif, le type, les besoins, le style, les contraintes, l’état actuel, les prochaines étapes et les liens. La description du projet, son statut et ses tâches ouvertes servent de valeurs initiales pour l’objectif, l’état et les prochaines étapes. La fiche reprend aussi les liens de l’onglet **Outils**.

Dans l’application Windows, associer un dossier dans les paramètres du projet. Projet Hub y écrit sa section dans `PROJECT_CONTEXT.md` et ajoute à `AGENTS.md` une consigne de lecture de la fiche et des ressources pertinentes. Pour un projet déjà associé, ouvrir **Contexte** ou **Ouvrir Codex** pour initialiser sa fiche. Les contenus existants en dehors des sections Projet Hub sont conservés. **Importer des références** copie les documents et les images dans `docs/references/`. Le JSON de sauvegarde inclut les champs de la fiche. Les références restent dans le dossier local du projet.

Le champ **Dépôt GitHub** accepte une adresse HTTPS ou SSH de GitHub. Si Git est installé, Projet Hub compare cette adresse avec `origin` quand il existe et examine les autres distants en l’absence d’`origin`. La comparaison utilise la configuration locale et n’accède pas à GitHub. Le dépôt d’un projet se renseigne dans sa fiche. La destination des publications de l’application se configure dans GitHub Actions.

### Créer l’installateur Windows

Après `npm.cmd install`, exécuter :

```powershell
npm.cmd run build:win
```

La commande produit un installateur NSIS `.exe` dans `dist\`. Le premier build télécharge Electron et les outils NSIS. Exécuter l’installateur sur un PC Windows de même architecture pour installer Projet Hub pour le compte courant. L’installateur local est non signé. Codex CLI s’installe séparément.

Cette compilation locale ne publie rien et ne configure aucun flux de mise à jour.

### Activer les publications GitHub

1. Mettre le code de Projet Hub dans un dépôt GitHub public et activer GitHub Actions.
2. Dans **Settings → Secrets and variables → Actions → Variables**, créer la variable `RELEASE_REPOSITORY` avec le nom complet de ce dépôt (`propriétaire/dépôt`). Le workflow publie dans ce même dépôt. Il demande la permission `contents: write` et utilise le jeton temporaire fourni par GitHub Actions. Si une politique d’organisation empêche cette permission, la publication échouera.

Les postes Windows lisent les Releases publiques sans authentification. Un dépôt privé demanderait une autre solution de distribution. Aucune mise à jour automatique n’est disponible tant que la destination n’a pas été configurée et qu’un premier installateur issu de ce workflow n’a pas été installé.

### Créer et publier une version Windows

Depuis une branche propre, choisir une version stable supérieure à la précédente. Exemple pour la première version avec mises à jour, en supposant que la branche suit déjà le dépôt distant.

```powershell
npm.cmd version 0.2.0
git push
git push origin v0.2.0
```

`npm version` met à jour `package.json` et `package-lock.json`, puis crée le commit et le tag. L’envoi du tag lance le workflow Windows. Il génère et publie ensemble l’installateur x64, sa `.blockmap` et `latest.yml`. Conserver les noms produits et laisser GitHub publier la version comme stable. Les exécutables publiés par cette configuration sont non signés.

Installer manuellement le premier installateur téléchargé depuis **Releases**, par-dessus l’installation existante. Il utilise le même profil Electron, ce qui permet de retrouver les projets, les dossiers associés et les paramètres. Ensuite, ouvrir Projet Hub depuis le raccourci du Bureau. L’application vérifie les versions au démarrage, télécharge en arrière-plan et propose **Redémarrer et installer** ou **Plus tard**. Choisir **Plus tard** reporte la proposition à la prochaine ouverture.

Pour vérifier la distribution de bout en bout, installer une première version issue de GitHub Releases sur un poste de test, créer un projet et y associer un dossier, puis publier une version supérieure. Rouvrir Projet Hub, choisir **Plus tard**, puis rouvrir l’application et choisir **Redémarrer et installer**. Vérifier la nouvelle version et l’accès aux données du projet, ainsi que le raccourci du Bureau.
