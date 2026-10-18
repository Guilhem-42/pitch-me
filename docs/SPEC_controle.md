# SPEC — Panneau de contrôle et fiche de préparation

**Version :** 0.1 — **Date :** 2026-10-18
**Statut :** proposée. L'implémentation attend la validation de l'entrée
« Panneau de contrôle web en fenêtre popup » dans `DECISIONS.md`.
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

## 3. Forme retenue : fenêtre popup web

Page `web/controle.html`, servie par `serve`, ouverte dans une fenêtre séparée
(`window.open(url, 'pitchme-controle', 'popup,width=380,height=560')`) depuis le
dashboard, ou directement par son URL. Aucune dépendance nouvelle.

Limite connue : sous Firefox, la fenêtre ne peut pas rester au premier plan
(l'API Document Picture-in-Picture n'existe que sous Chromium). Contournements :
la placer sur un second écran ou dans un coin, et utiliser le mode compact du
live (§9).

Écartés : Electron/Tauri (build et dépendances, trop lourd pour 48 h),
application macOS native, extension de navigateur. Piste ultérieure : lot D.

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
- Recommandation affichée dans la checklist : ouvrir le panneau dans une autre
  application que celle de la présentation. Le marqueur reste le filet de
  sécurité.
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
| `POST /api/session/:id/start` | lance la capture | consentement requis ; 409 si une autre session est `live` |
| `POST /api/session/:id/ready` | pose le repère « prêt » | |
| `POST /api/session/:id/mark` | repère `blocage`, `ok` ou `note` + texte | |
| `POST /api/session/:id/stop` | arrête la capture | |
| `POST /api/session/:id/report` | lance le rapport | répond 202 ; progression via `/etat` |

`:id` suit déjà l'expression `^[A-Za-z0-9_-]+$`. Un corps invalide renvoie 400
avec le détail Zod.

## 7. Service partagé

Extraire de `cli.js` un module `src/session-service.js` :
`creerSession`, `majFiche`, `cocherRappel`, `demarrer`, `pret`, `repere`,
`arreter`, `etat`, `lancerRapport`. `cli.js` devient une façade (arguments,
question `o/N`, affichage) ; `server.js` en est une autre. Plus aucun
`process.exit` dans le service.

- Erreurs typées `ErreurSession(code, message)` avec les codes `INTROUVABLE`,
  `ETAT_INVALIDE`, `CONSENTEMENT_REQUIS`, `CONFIG_MANQUANTE`, `SESSION_ACTIVE`,
  traduits en statuts HTTP par le serveur.
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
| `termine` | bouton « Générer le rapport », progression, lien vers le dashboard |

Les raccourcis clavier ne valent que lorsque le panneau a le focus (aucun
raccourci global). Une erreur s'affiche dans un bandeau avec le message du
serveur ; le panneau relit `/etat` toutes les 2 s.

## 10. Lots

Dernier jour du hackathon : on livre par lots utilisables séparément.

- **A — indispensable :** service partagé, API et sécurité, panneau sans fiche
  (les rappels sont la checklist déjà présente dans le manifeste), filtre du
  marqueur dans `timeline.js`, tests.
- **B :** fiche en cartes, `contexte`, dérivation, `next` mis à jour.
- **C :** rapport lancé depuis le panneau avec progression, bouton d'ouverture
  du panneau dans le dashboard.
- **D (après le hackathon) :** Document Picture-in-Picture sous Chromium ou
  application Electron/Tauri toujours au premier plan.

## 11. Tests

- Service : transitions de statut, `SESSION_ACTIVE`, consentement requis,
  écriture atomique.
- Serveur (service factice injecté) : 401 sans jeton, 403 avec un `Host`
  étranger, 415 sans `application/json`, 409 sur état invalide, 404, cas nominal
  de chaque route.
- `fiche.js` : dérivation et fusion.
- `timeline.js` : frames du panneau ignorées.
- Aucun test ne lance un vrai Screenpipe ni n'appelle le LLM.

## 12. Points d'arrêt pour l'agent

Mêmes règles que `SPEC_wrapper.md`, avec en plus : s'arrêter si l'entrée de
validation de la décision est absente de `DECISIONS.md`. Ne jamais lire
`sessions/` ni `.screenpipe/`.

## 13. Hors périmètre

Modification du manifeste après le démarrage, accès à distance, plusieurs
utilisateurs, authentification autre que le jeton, raccourcis clavier globaux.
