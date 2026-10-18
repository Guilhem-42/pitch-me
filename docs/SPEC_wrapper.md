---
titre: Spécification du wrapper Pitch-Me (brief pour Claude Code CLI)
version: 0.2
maj: 2026-10-18
statut: brouillon
---

# Spécification du wrapper Pitch-Me

Brief destiné à un agent de code (Claude Code CLI) travaillant sur le Mac d'un
membre de l'équipe, avec Screenpipe installé. Lire d'abord `CLAUDE.md`,
`README.md` et `docs/ARCHI_pitch-me.md`. Cette spécification fixe les données,
l'ordre des étapes et les critères de réussite. Elle ne fige pas le code.

## Objectif

Un outil en ligne de commande qui pilote Screenpipe pendant une **session
cadrée**, puis produit un bilan : timeline calculée par le code, analyse écrite
par un LLM, mini dashboard. Le bilan prépare la session suivante.

Principe : **le code calcule, le LLM interprète.** Aucun chiffre du rapport ne
doit être calculé ou inventé par le LLM : il reprend ceux de `timeline.json`.

## Stack

- Node 20 ou plus, modules ES, JavaScript (pas de TypeScript).
- `zod` pour valider les trois fichiers de données.
- `@anthropic-ai/sdk` pour le bilan. Le modèle vient de `ANTHROPIC_MODEL`
  (variable d'environnement), jamais écrit en dur.
- Serveur HTTP : module `node:http` ou `express`, au choix de l'agent.
- Dashboard : une page HTML statique, Chart.js depuis un CDN, aucun build.
- Tests : `node:test`. Pas de base de données.
- Configuration par `.env` (modèle : `.env.example`) : `ANTHROPIC_API_KEY`,
  `SCREENPIPE_API_KEY`, `SCREENPIPE_PORT` (3035 par défaut), `SESSIONS_DIR`
  (`./sessions` par défaut).

## Contraintes

Celles de `CLAUDE.md`, en particulier :

- Ne jamais lire, afficher ni committer le contenu de `sessions/` ou de
  `.screenpipe/`. Les tests utilisent des **données fictives** rangées dans
  `src/__fixtures__/`.
- Aucune clé dans le code ni dans git.
- Aucun chemin absolu en dur dans un fichier versionné.
- Avant l'enregistrement de l'audio ou de l'écran d'une autre personne, la CLI
  demande une confirmation explicite (voir `start`).
- Commits : `[portée] type: résumé`, une étape = un ou plusieurs commits.
- Branches : commits directement sur `main` (décision dans
  `docs/DECISIONS.md`). Faire `git pull --rebase` avant chaque push.

## Dossier d'une session

```
sessions/<id>/
  manifest.json      manifeste, repères, état
  timeline.json      calculé par le code
  report.json        produit par le LLM, validé par schéma
  screenpipe/        données brutes de l'instance dédiée (si lancée par le wrapper)
```

`<id>` : `AAAA-MM-JJ-sNN` (par exemple `2026-10-18-s01`).

## Schémas de données

Les durées sont en secondes, mesurées depuis `debut` (décalage), sauf mention
contraire. Les dates sont en ISO 8601 UTC.

### `manifest.json`

```json
{
  "id": "2026-10-18-s01",
  "titre": "Pitch v1 en visio",
  "objectif": "Présenter le squelette en 5 minutes sans quitter le cadre prévu",
  "criteres": ["durée entre 4 et 6 minutes", "aucune fenêtre hors cadre"],
  "duree_cible_s": 300,
  "fenetres_prevues": [
    { "app": "Google Chrome", "motif": "deck en plein écran" },
    { "app": "zoom.us", "motif": "visio" }
  ],
  "audio": true,
  "session_precedente": null,
  "checklist": [{ "id": "c1", "texte": "Fermer les notifications", "fait": false }],
  "reperes": [{ "t": "2026-10-18T14:03:12Z", "type": "blocage", "texte": "" }],
  "debut": null,
  "pret": null,
  "fin": null,
  "statut": "preparation"
}
```

- `statut` : `preparation`, `live`, `termine`, `analyse`.
- `reperes[].type` : `pret`, `blocage`, `ok`, `note`.
- `debut` : démarrage de la capture. `pret` : fin de la préparation (le live
  commence). `fin` : arrêt.

### `timeline.json`

```json
{
  "session_id": "2026-10-18-s01",
  "debut": "2026-10-18T14:00:00Z",
  "pret": "2026-10-18T14:02:10Z",
  "fin": "2026-10-18T14:07:40Z",
  "duree_s": 460,
  "duree_preparation_s": 130,
  "duree_live_s": 330,
  "fenetres": [
    { "app": "Google Chrome", "fenetre": "Deck - Slides", "debut_s": 0, "fin_s": 95, "duree_s": 95, "prevue": true }
  ],
  "temps_par_app": [{ "app": "Google Chrome", "duree_s": 280, "part": 0.61 }],
  "changements_fenetre": 14,
  "hors_cadre": [{ "app": "Slack", "fenetre": "general", "debut_s": 140, "fin_s": 152, "duree_s": 12 }],
  "silences": [{ "debut_s": 201, "fin_s": 205, "duree_s": 4 }],
  "parole": { "duree_s": 290, "mots": 640, "mots_par_min": 132 },
  "reperes": [{ "t_s": 140, "type": "blocage", "texte": "" }],
  "extraits_texte": [{ "t_s": 12, "app": "Google Chrome", "texte": "Take — Build Agents That Remember" }]
}
```

- `fenetres` : suite chronologique des fenêtres au premier plan. `prevue` vaut
  `true` si l'application figure dans `fenetres_prevues`.
- `silences` : trous de parole de 3 secondes ou plus pendant la phase live
  (seuil réglable). Absent si `audio` est faux.
- `parole` : absent si `audio` est faux.
- `extraits_texte` : texte à l'écran (accessibilité, sinon OCR), un extrait par
  changement de fenêtre au plus, **limité à 40 entrées et 300 caractères
  chacune** pour tenir dans le prompt.

### `report.json`

```json
{
  "session_id": "2026-10-18-s01",
  "resume": "Trois phrases au plus.",
  "objectif_atteint": { "verdict": "partiel", "justification": "..." },
  "constats": [
    {
      "titre": "Sortie du cadre pendant la démo",
      "detail": "...",
      "gravite": "attention",
      "preuve": { "source": "hors_cadre", "t_s": 140 }
    }
  ],
  "recommandations": [{ "id": "r1", "texte": "...", "priorite": 1 }],
  "checklist_suivante": [{ "id": "c1", "texte": "...", "fait": false }],
  "comparaison": {
    "avec": "2026-10-18-s00",
    "deltas": [{ "mesure": "duree_live_s", "avant": 410, "apres": 330 }]
  },
  "todo_detectes": [{ "texte": "...", "source": "extraits_texte" }],
  "incertitudes": ["La transcription est partielle entre 210 s et 240 s."]
}
```

- `verdict` : `oui`, `partiel`, `non`.
- `gravite` : `info`, `attention`, `bloquant`. `priorite` : 1 (haute) à 3.
- `preuve.source` : un champ de `timeline.json` ; `t_s` renvoie à une entrée qui
  existe : égal au `t_s` d'un repère ou d'un extrait, ou compris dans
  l'intervalle `debut_s` à `fin_s` d'une fenêtre, d'un silence ou d'une sortie
  hors cadre. Le code **rejette** un rapport dont une preuve ne correspond à rien.
- `comparaison` : `null` pour la première session. Les valeurs `avant` et
  `apres` sont lues dans les deux `timeline.json`, jamais écrites par le LLM.
- `todo_detectes` : incohérences ou tâches repérées dans le texte à l'écran
  (voir « Test de la session 1 »).

## Commandes

```
node src/cli.js new <titre>        crée sessions/<id>/ et un manifest.json à remplir
node src/cli.js start <id>         lance la capture (phase préparation)
node src/cli.js ready <id>         pose le repère « prêt » (début du live)
node src/cli.js mark <id> <type> [texte]   pose un repère
node src/cli.js stop <id>          arrête la capture
node src/cli.js report <id>        calcule la timeline, appelle le LLM, écrit le rapport
node src/cli.js serve              sert le dashboard (lecture de SESSIONS_DIR)
node src/cli.js next <id>          crée la session suivante, pré-remplie
```

`start` affiche l'objectif, rappelle ce qui sera capté (écran, audio oui ou non)
et exige une confirmation (`o`) avant de lancer.

## Étapes

Enchaîner les étapes sans demander de validation, avec au moins un commit par
étape. Les seuls points d'arrêt sont :

1. la fin de l'étape 0, pour la décision « instance dédiée ou instance
   existante » (un humain tranche) ;
2. le premier vrai `start` qui capte l'écran ou l'audio, pour le consentement ;
3. un blocage que l'agent ne peut pas lever seul.

Un critère de réussite non atteint n'est pas un point d'arrêt : corriger, puis
continuer. En fin de parcours, un compte rendu court (ce qui tourne, ce qui
manque).

### Étape 0 : explorer Screenpipe (1 h au plus)

À faire sur la machine réelle, en lecture seule. Produire `docs/NOTES_screenpipe.md`
(sans aucune donnée personnelle) qui répond à :

1. Version de Screenpipe, port, `GET /health`.
2. Obtention de la clé (`npx -y screenpipe@latest auth token`) et appel réussi
   de `/search` et de `/raw_sql`.
3. Schéma réel de la base (`.schema`) : tables et colonnes utiles (images,
   fenêtres, texte, audio, locuteurs).
4. Une instance dédiée (`screenpipe record --port 3035 --data-dir ...`) tourne-t-elle
   en parallèle de l'instance habituelle ? La clé change-t-elle ?
5. Décision proposée : **instance dédiée par session** ou **instance existante
   filtrée par plage horaire**. Écrire la proposition dans `docs/DECISIONS.md`
   en la marquant « proposée » : un humain tranche.

Critère de réussite : les cinq points sont documentés avec des commandes
reproductibles.

### Étape 1 : piloter la capture

Implémenter `new`, `start`, `ready`, `mark`, `stop` et le manifeste.

- `start` lance Screenpipe en processus enfant (`child_process.spawn`), attend
  `/health`, écrit `debut` et `statut: preparation`.
- `stop` arrête proprement le processus, même après un plantage du wrapper
  (fichier PID dans le dossier de la session).
- Repli si l'étape 0 conclut à l'instance existante : `start` et `stop` ne font
  que consigner les heures.

Critères : un cycle `new`, `start`, `ready`, `mark`, `stop` laisse un
`manifest.json` valide (zod) et aucun processus Screenpipe orphelin ; `stop`
fonctionne si `start` a été interrompu.

### Étape 2 : calculer la timeline

Implémenter `src/timeline.js` : une fonction pure, `calculerTimeline(manifest,
donnees)`, où `donnees` vient de l'API (fenêtres, texte, audio). Séparer
l'accès à l'API (`src/screenpipe.js`) du calcul, pour tester le calcul sur des
fixtures.

Critères : tests `node:test` sur des fixtures fictives couvrant au moins une
session avec audio, une sans audio, une fenêtre hors cadre et un silence ; les
sommes sont cohérentes (`temps_par_app` somme à `duree_s` à une seconde près) ;
`timeline.json` valide son schéma.

### Étape 3 : produire le rapport

Implémenter `src/report.js` et les prompts dans `prompts/`.

- Entrée du LLM : `manifest.json` (objectif, critères), `timeline.json`, et
  `report.json` de la session précédente si elle existe.
- Sortie : JSON validé par zod, sinon **une** nouvelle tentative avec le message
  d'erreur, puis échec explicite.
- Le prompt interdit de calculer ou d'arrondir un chiffre, impose une preuve par
  constat, et demande de ranger dans `incertitudes` tout ce qui repose sur une
  transcription partielle.
- Les « hésitations » sont présentées comme un indice, jamais comme un fait.

Critères : un rapport est produit sur les fixtures ; une preuve invalide est
rejetée ; la comparaison reprend exactement les valeurs des deux timelines.

### Étape 4 : dashboard

Page statique dans `web/`, servie par `serve`.

- En-tête : titre, objectif, verdict.
- Frise des fenêtres sur la durée (barres horizontales colorées par
  application, repères en surimpression).
- Temps par application (barres), indicateurs (durée live, changements de
  fenêtre, débit de parole, silences).
- Constats avec preuve cliquable (saute à l'instant sur la frise),
  recommandations triées par priorité, checklist suivante.
- Si une session précédente existe : tableau des deltas.

Critères : la page s'affiche sans erreur console sur les fixtures, sans réseau
hors CDN, lisible sur un écran partagé en visio.

### Étape 5 : boucler vers la session suivante

`next <id>` crée une nouvelle session dont `session_precedente` pointe vers
`<id>` et dont la `checklist` reprend `checklist_suivante` du rapport. Le
dashboard affiche la comparaison.

Critère : enchaîner session 1, rapport, `next`, session 2, rapport, et obtenir
une comparaison chiffrée sur au moins deux mesures.

## Test de la session 1 (démo)

La session 1 répète le pitch v1. Le deck porte « Take » en couverture alors que
le projet s'appelle « Pitch-Me » : c'est volontaire. Si `extraits_texte` montre
les deux noms (deck, dépôt, onglets), le rapport doit en tirer une entrée dans
`todo_detectes`. **Ne rien coder en dur pour cela** : c'est le LLM qui doit le
repérer à partir des extraits. Si ce n'est pas le cas, améliorer le prompt, pas
le code.

## Hors périmètre (hackathon)

Authentification des utilisateurs, base de données, déploiement, version mobile,
reconnaissance fine des locuteurs, traitement des vidéos. Pas de refactor
général avant que l'étape 5 ne tourne.

## Révisions

- 0.1 (2026-10-18) : première version.
- 0.2 (2026-10-18) : étapes enchaînées, trois points d'arrêt seulement.
