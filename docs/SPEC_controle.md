# SPEC — Panneau de contrôle et fiche de préparation

**Version :** 0.3 — **Date :** 2026-10-18
**Statut :** proposée. L'implémentation attend la validation de l'entrée
« Panneau de contrôle web en fenêtre popup », puis de l'entrée « Coque
Electron flottante et guide live » (qui l'amende), dans `DECISIONS.md`.
**Complète :** `SPEC_wrapper.md` (v0.2). Ce document ajoute une façade au CLI et
un champ optionnel `contexte` au manifeste ; il ne modifie pas le reste.

## 1. Problème

Piloter une session depuis zsh (`start`, `ready`, `mark`, `stop`) et éditer
`manifest.json` à la main n'est pas praticable quand on prépare puis qu'on
présente : il faut quitter la fenêtre de présentation, taper des commandes et
se souvenir de ce qu'il faut mettre en place.

Besoin : une petite fenêtre détachable qui porte les commandes, rappelle ce qui
reste à mettre en place avant de lancer la capture, et qui s'appuie sur une
**fiche de préparation** remplie avant la présentation (navigateur, visio, date,
durée…).

## 2. Principes

- Le CLI reste. Le panneau est une seconde façade sur **les mêmes opérations**
  (une seule logique, voir §7).
- L'état vit sur disque (manifeste + fichier PID). Fermer le panneau, le rouvrir
  ou alterner CLI et panneau ne change rien. **Fermer le panneau ne coupe jamais
  la capture.**
- Le panneau n'affiche que le manifeste et l'état du processus. Il ne lit jamais
  les captures (`sessions/*/screenpipe/`).
- Le code dérive les rappels de la fiche ; le LLM n'intervient pas avant le
  rapport.

## 3. Forme retenue : page web dans une coque flottante

Le panneau est une **page web** (`web/controle.html`, servie par `serve`) affichée
dans une **petite fenêtre Electron flottante** : une coque mince de quelques
dizaines de lignes (`electron/main.js`), sans logique métier. La page reste
utilisable dans un onglet de navigateur (développement, secours), mais l'usage
normal est la fenêtre flottante.

Pourquoi : jongler entre deux navigateurs ou perdre la présentation dans un
onglet n'est pas praticable. La coque donne une vraie fenêtre déplaçable, sans
refaire le panneau.

Exigences de la coque :

- fenêtre d'environ 360 × 520 px, déplaçable (zone de titre), redimensionnable,
  légèrement transparente (opacité réglable, 0,9 par défaut) ;
- toujours au premier plan, y compris au-dessus d'une application en plein écran
  (`setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces` avec
  `visibleOnFullScreen`) ;
- **ne vole pas le focus** à la présentation : type `panel`, activation seulement
  au clic dans un champ de saisie. Un clic sur un bouton ne doit pas empêcher de
  changer de diapositive au clavier ;
- titre de fenêtre commençant par le marqueur du §4 ;
- lancement par `node src/cli.js panneau` (démarre le serveur s'il ne tourne pas,
  puis ouvre la fenêtre ; le jeton du §5 est transmis à la coque, pas affiché) ;
- `electron` en `devDependency` ; aucune autre dépendance.

Limites : installation d'Electron (téléchargement d'environ 100 Mo) ; si elle
échoue, repli sur la page dans un onglet. Écartés : Tauri (chaîne Rust à
installer), application macOS native, extension de navigateur, Document
Picture-in-Picture (Chromium seulement).

## 4. Piège : le panneau est lui-même capturé

La fenêtre du panneau apparaît dans les captures. Sans traitement, elle serait
comptée « hors cadre » et son texte (checklist, objectif) entrerait dans
`extraits_texte`, ce qui fausserait le rapport.

- Le titre de la page commence toujours par `Pitch-Me · Contrôle`. Ce marqueur
  est une constante de `config.js` (`MARQUEUR_PANNEAU`).
- `timeline.js` écarte **avant tout calcul** les frames dont le titre de fenêtre
  contient le marqueur : ni fenêtre, ni hors cadre, ni extrait de texte, ni
  changement de fenêtre. Le temps où le panneau a le focus est attribué à la
  fenêtre précédente.
- La coque active `setContentProtection(true)` : sous macOS, la fenêtre est
  exclue des captures d'écran et du partage d'écran, donc invisible pour les
  participants de la visio. **Efficacité à vérifier** sur la version de macOS et
  avec la capture de Screenpipe (des versions récentes de macOS contournent cette
  protection pour certaines API de capture). Le marqueur reste le filet de
  sécurité dans tous les cas.
- Test unitaire avec une fixture contenant une frame du panneau.

## 5. Sécurité (obligatoire)

Les routes d'écriture lancent et arrêtent une capture d'écran et d'audio. Le
serveur écoute déjà sur `127.0.0.1`, mais une page web quelconque ouverte dans le
navigateur peut viser `localhost`.

- **Jeton** de 32 octets aléatoires (hex), généré à chaque lancement de `serve`,
  affiché dans l'URL imprimée au démarrage (`http://127.0.0.1:3000/#token=…`).
  Le fragment n'est pas envoyé au serveur. La page le lit, retire le fragment de
  l'URL (`history.replaceState`) et le garde en mémoire (et en `sessionStorage`,
  dans un `try/catch`, pour survivre à un rechargement).
- Toute requête `POST`/`PATCH` exige `Authorization: Bearer <jeton>`
  (comparaison à temps constant) et `Content-Type: application/json` : 401 puis
  415 sinon. Aucun en-tête CORS n'est émis.
- Toute requête, y compris `GET`, exige un `Host` égal à `127.0.0.1:<port>` ou
  `localhost:<port>` (anti DNS rebinding) : 403 sinon.
- Le jeton n'est ni écrit sur disque, ni journalisé, ni versionné.
- **Consentement :** `start` exige `{ "consentement": true }` dans le corps. Le
  panneau l'envoie seulement après un récapitulatif explicite (objectif, écran,
  audio) et un clic sur « Démarrer la capture ». Si `audio` est vrai et qu'une
  visio est prévue, la case « Les participants savent que leur voix est
  enregistrée » est obligatoire (`contexte.participants_prevenus`).

## 6. API

JSON partout. Erreurs : `{ "erreur": "message", "code": "ETAT_INVALIDE" }`.

| Méthode et route | Rôle | Remarques |
|---|---|---|
| `GET /api/sessions` | liste | existe |
| `GET /api/session/:id` | manifeste, timeline, rapport | existe |
| `GET /api/session/:id/etat` | état vivant | statut, `chrono_s`, `pid_vivant`, `screenpipe_ok` (appel `/health` avec délai de 1 s), `rapport` |
| `POST /api/sessions` | crée une session | corps : `titre` + `fiche` optionnelle ; renvoie le manifeste |
| `PATCH /api/session/:id/fiche` | modifie objectif, critères, `contexte`, checklist | seulement si `statut = preparation` |
| `PATCH /api/session/:id/checklist/:itemId` | coche ou décoche un rappel | autorisé en `preparation` et `live` |
| `POST /api/session/:id/dupliquer` | copie la session en préparation | voir §7 ; renvoie le nouveau manifeste |
| `POST /api/session/:id/start` | lance la capture | consentement requis ; 409 si une autre session est `live` |
| `POST /api/session/:id/ready` | pose le repère « prêt » | |
| `POST /api/session/:id/mark` | repère `blocage`, `ok` ou `note` + texte | |
| `POST /api/session/:id/stop` | arrête la capture | |
| `POST /api/session/:id/report` | lance le rapport | répond 202 ; progression via `/etat` |

`:id` suit déjà l'expression `^[A-Za-z0-9_-]+$`. Un corps invalide renvoie 400
avec le détail Zod.

## 7. Service partagé

Extraire de `cli.js` un module `src/session-service.js` :
`creerSession`, `dupliquerSession`, `majFiche`, `cocherRappel`, `demarrer`, `pret`, `repere`,
`arreter`, `etat`, `lancerRapport`. `cli.js` devient une façade (arguments,
question `o/N`, affichage) ; `server.js` en est une autre. Plus aucun
`process.exit` dans le service.

- Erreurs typées `ErreurSession(code, message)` avec les codes `INTROUVABLE`,
  `ETAT_INVALIDE`, `CONSENTEMENT_REQUIS`, `CONFIG_MANQUANTE`, `SESSION_ACTIVE`,
  traduits en statuts HTTP par le serveur.
- **Duplication** (`dupliquerSession`, commande `dupliquer <id>` du CLI, bouton
  « Dupliquer cette session » du panneau) : crée une nouvelle session en
  `preparation`, à partir de n'importe quel statut. Copiés : objectif, critères,
  durée cible, fenêtres prévues, audio, `guide`, `contexte` (avec `date_prevue`
  remise à `null`), `session_precedente` (la copie prend la même place dans la
  chaîne que l'originale) et la checklist avec tous les rappels décochés. Non
  copiés : repères, horodatages, statut, dossier `screenpipe/`. La session source
  n'est jamais modifiée et son `data-dir` n'est jamais touché. Titre : celui de
  l'originale suivi de « (copie) ».
- Le numéro d'une nouvelle session est le plus grand numéro existant du jour plus
  un (et non le nombre de dossiers), pour ne jamais réattribuer un identifiant
  existant, même si des dossiers ont été déplacés.
- Une seule session `live` à la fois (port unique) : `demarrer` refuse si une
  autre session est `live` avec un PID en vie.
- Écriture du manifeste atomique (fichier temporaire puis `rename`) : le CLI et
  le panneau peuvent écrire presque en même temps.
- Rapport asynchrone : l'état (`en_cours`, `ok`, `erreur` + message) est tenu en
  mémoire par le serveur ; le statut du manifeste passe à `analyse` à la fin,
  comme avec le CLI.
- Les dépendances (Screenpipe, LLM) sont injectables pour les tests.

## 8. Fiche de préparation (cartes)

Le manifeste reçoit un champ **optionnel** `contexte` (`.nullable().default(null)`
dans `ManifestSchema`, donc les sessions existantes restent valides) :

| Clé | Question posée | Type |
|---|---|---|
| `navigateur` | Quel navigateur affichera le deck et les pages web pendant la session ? | Firefox, Chrome, Safari, Arc, autre |
| `supports` | Quels supports montrerez-vous ? (deck, démo…) | liste de `{ nom }` |
| `pages_web` | Quelles pages web resteront ouvertes ? | liste de `{ libelle }` |
| `visio` | Quelle application de visio utiliserez-vous ? | `{ outil, dans_navigateur }` ; outils : Google Meet, Zoom, Teams, autre, aucune |
| `public` | Devant qui présentez-vous ? | texte |
| `date_prevue` | Quand ? | date et heure, nullable |
| `duree_cible_min` | Durée visée, en minutes ? | nombre > 0 |
| `audio` | Enregistrer la voix ? | booléen |
| `participants_prevenus` | Les participants sont-ils prévenus ? | booléen, requis si `audio` et visio ≠ aucune |
| `notes` | Autre chose à prévoir ? | texte libre |

**Dérivation** : fonction pure `deriverDepuisFiche(contexte)` dans
`src/fiche.js`, testée sans disque :

- `duree_cible_s` = `duree_cible_min × 60` ; `audio` repris tel quel.
- `fenetres_prevues` : le navigateur (motif « supports et pages web ») ; si la
  visio est dans le navigateur, son outil s'ajoute au motif ; sinon l'outil de
  visio devient une application prévue distincte.
- `checklist` (rappels, identifiants stables préfixés `prep-`) : ouvrir chaque
  support dans le navigateur ; ouvrir chaque page web ; ouvrir la visio et
  rejoindre l'appel ; fermer les notifications et fenêtres sensibles ;
  placer le panneau hors de la fenêtre de présentation ; prévenir les
  participants que la voix est enregistrée (si `audio` et visio).
- Fusion par identifiant : une modification de la fiche n'écrase ni les rappels
  déjà cochés ni les rappels ajoutés à la main.
- L'objectif et les critères restent saisis par l'humain (champs de la fiche).

**Guide live.** Le manifeste reçoit un second champ optionnel `guide` (même
compatibilité que `contexte`) :

| Clé | Contenu |
|---|---|
| `points` | liste de `{ id, titre, t_cible_s, important }` : les points à aborder et l'instant visé (en secondes depuis « prêt ») |
| `rappels_fin` | liste de textes à dire dans les dernières secondes (appel à l'action, adresse du dépôt…) |
| `alerte_fin_s` | durée de la fenêtre finale, 10 par défaut |

La fiche demande donc aussi : « Quels sont les points à aborder, dans quel ordre,
et à quel moment environ ? » et « Qu'est-ce qui doit être dit dans les
10 dernières secondes ? ». Ces champs sont facultatifs : sans `guide`, le panneau
n'affiche que le chrono.

**Noms d'application.** `fenetres_prevues[].app` doit être égal au nom que
Screenpipe rapporte. Une table `APP_NAMES` (navigateur → nom attendu) vit dans
`fiche.js` ; son contenu est à vérifier lors du premier test réel et à consigner
dans `NOTES_screenpipe.md`.

`next` recopie `contexte` dans la session suivante, avec `date_prevue` remise à
`null`. Le contexte part tel quel dans le prompt du rapport (le manifeste y est
déjà inséré en entier) ; `prompts/analyste.md` précise qu'il décrit le dispositif
prévu, sans y introduire de nom de projet.

## 9. Interface du panneau

Largeur d'environ 380 px. Titre de page : `Pitch-Me · Contrôle`. Sans
framework : HTML, CSS et JS natifs, comme le dashboard.

| État | Contenu |
|---|---|
| Aucune session choisie | sessions en préparation ; bouton « Nouvelle session » qui ouvre la fiche |
| Fiche | une question par carte, boutons Précédent et Suivant, récapitulatif final, bouton « Créer la session » |
| `preparation` | objectif, durée, fenêtres prévues ; **rappels cochables** ; indicateurs bloquants (clé API ou modèle manquants) ; bouton « Démarrer la capture » (récapitulatif de consentement) |
| `live`, avant « prêt » | rappels restants ; indicateur Screenpipe ; bouton « Je suis prêt — lancer le live » |
| `live`, après « prêt » | **mode compact** : chrono et durée cible, boutons Blocage, OK, Note (champ court), Terminer |
| `termine` | bouton « Générer le rapport », progression, lien vers le dashboard ; bouton « Dupliquer cette session » |

**Guide discret pendant le live.** Tout est calculé par une fonction pure
`etatGuide(manifeste, repereDepuis, maintenant)` dans `src/guide.js` (importée par
la page, testable sans navigateur), sans LLM :

- temps écoulé et **temps restant** par rapport à `duree_cible_s`, avec une barre
  de progression fine ;
- le **point attendu** à cet instant (le premier non fait dont `t_cible_s` est
  atteint), et les **points en retard** (`t_cible_s` dépassé, non faits), signalés
  par une couleur sobre, sans clignotement ni son ;
- les **points importants non évoqués** restent listés tant qu'ils ne sont pas
  faits, même après leur instant cible ;
- à `alerte_fin_s` secondes de la fin, le panneau affiche en grand les
  `rappels_fin` ; après la durée cible, le chrono continue en négatif ;
- marquer un point comme fait : clic sur le point ou touche Entrée quand le
  panneau a le focus. Cela pose un repère de type `point` (texte = identifiant du
  point) ; `RepereSchema` gagne ce type et `timeline.json` ajoute
  `plan_realise: [{ id, titre, t_cible_s, t_reel_s | null }]`, calculé par le code,
  que le rapport peut commenter (écart au plan par point).

Le mode compact reste lisible d'un coup d'œil : chrono et reste en gros, un seul
point attendu, le reste replié. Détection automatique des points abordés à
partir de la transcription : hors périmètre du hackathon (lot E).

Les raccourcis clavier ne valent que lorsque le panneau a le focus (aucun
raccourci global). Une erreur s'affiche dans un bandeau avec le message du
serveur ; le panneau relit `/etat` toutes les 2 s.

## 10. Lots

Dernier jour du hackathon : on livre par lots utilisables séparément.

- **A — indispensable :** service partagé, API et sécurité, filtre du marqueur
  dans `timeline.js`, tests.
- **B — fenêtre :** page du panneau (préparation, rappels cochables, démarrer,
  prêt, repères, terminer) et coque Electron flottante, sans fiche (les rappels
  sont la checklist déjà présente dans le manifeste).
- **C — fiche et duplication :** numérotation par numéro maximum, bouton et route
  « Dupliquer cette session » (affiché aussi en préparation, à côté de « Démarrer »),
  `contexte` et `guide` dans le schéma, cartes de la fiche,
  dérivation, `next` mis à jour.
- **D — guide live :** `guide.js`, affichage du chrono et des points, repère
  `point`, `plan_realise` dans la timeline, prompt du rapport.
- **E (après le hackathon) :** rapport lancé depuis le panneau, détection
  automatique des points abordés par la transcription, réglage de l'opacité et
  raccourcis globaux.

## 11. Tests

- Service : transitions de statut, `SESSION_ACTIVE`, consentement requis,
  écriture atomique.
- Serveur (service factice injecté) : 401 sans jeton, 403 avec un `Host`
  étranger, 415 sans `application/json`, 409 sur état invalide, 404, cas nominal
  de chaque route.
- `fiche.js` : dérivation et fusion.
- `guide.js` : point attendu, points en retard, fenêtre finale, dépassement de la
  durée cible, session sans `guide`.
- `timeline.js` : `plan_realise` calculé à partir des repères `point`.
- `timeline.js` : frames du panneau ignorées.
- Aucun test ne lance un vrai Screenpipe ni n'appelle le LLM.

## 12. Points d'arrêt pour l'agent

Mêmes règles que `SPEC_wrapper.md`, avec en plus : s'arrêter si l'entrée de
validation de la décision est absente de `DECISIONS.md`. Ne jamais lire
`sessions/` ni `.screenpipe/`.

## 13. Hors périmètre

Modification du manifeste après le démarrage, accès à distance, plusieurs
utilisateurs, authentification autre que le jeton, raccourcis clavier globaux,
signature ou distribution de la coque Electron (usage local uniquement).
