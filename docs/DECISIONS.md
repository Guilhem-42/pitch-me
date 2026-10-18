# Décisions

Une entrée par décision, jamais réécrite. Une décision qui en remplace une
autre le dit.

## 2026-10-18 — Dépôt à la racine du dossier de l'événement

**Contexte :** le travail de l'équipe (4 personnes) se fait dans un seul dossier
pour tout l'événement.
**Décision :** ce dossier est le dépôt git. Le sous-dossier `preparation/` est
exclu par `.gitignore` (à revoir plus tard : publier ou non). Les fichiers
système, les secrets et les données de capture sont aussi exclus.
**Conséquences :** pas de dépôt imbriqué dans ce dossier ; tout ajout de contenu
sensible passe d'abord par le `.gitignore`.

## 2026-10-18 — Commits directement sur `main`

**Contexte :** équipe de 4 personnes, hackathon de 48 h, un dépôt privé. Le
risque principal est le conflit de fusion, pas la régression en production.
**Décision :** tout le monde commite sur `main`, sans branche protégée ni
revue obligatoire. Faire `git pull --rebase` avant chaque push. Chacun travaille
dans son périmètre (`src/`, `web/`, `prompts/`, `pitch/`) pour limiter les
conflits. Une branche courte et une PR restent possibles pour un changement
risqué ou partagé.
**Conséquences :** à revoir au passage du dépôt en public (protection de
`main`, revue des PR). `README.md` : la ligne « Branches » est mise à jour.

## 2026-10-18 — Instance Screenpipe dédiée par session (proposée)

**Contexte :** chaque session d'entraînement doit capturer l'écran et
éventuellement l'audio pendant une durée limitée. Deux approches sont possibles :
(1) lancer une instance dédiée de Screenpipe avec son propre `data-dir`, ou
(2) utiliser l'instance existante de l'utilisateur et filtrer les données par
plage horaire.

**Décision proposée :** une instance dédiée par session.

**Justification :**
- Isolation complète : chaque session a sa propre base de données, aucun risque
  de mélange avec les captures personnelles de l'utilisateur.
- Contrôle du cycle de vie : démarrage et arrêt au moment précis de la session,
  pas de capture avant ou après.
- Configuration spécifique : possibilité de désactiver l'audio, sélectionner
  des écrans, ajuster le FPS, etc., sans affecter l'instance habituelle.
- Nettoyage facile : supprimer le `data-dir` après analyse pour libérer
  l'espace disque.
- Confidentialité renforcée : aucune requête SQL ou API ne peut exposer par
  erreur des données personnelles hors session.

**Conséquences :**
- Le wrapper doit gérer le processus enfant : lancer `screenpipe record` avec
  `child_process.spawn`, écrire le PID dans `sessions/<id>/screenpipe.pid`,
  attendre `/health`, et arrêter proprement avec SIGTERM.
- Démarrage plus lent : quelques secondes pour initialiser l'instance (acceptable
  pour une session cadrée).
- Gestion des plantages : vérifier que le processus tourne, redémarrer ou
  signaler l'échec si nécessaire.
- Espace disque temporaire : chaque session crée sa base, mais elle est supprimée
  après analyse.

**Statut :** Proposée — en attente de validation par un humain de l'équipe.

## 2026-10-18 — Instance dédiée par session : validée

**Contexte :** la décision du même jour « Instance Screenpipe dédiée par
session », proposée à l'issue de l'étape 0, attendait la validation d'un humain.
**Décision :** validée par Guilhem, avec une modification : le `data-dir` d'une
session est **conservé jusqu'à la fin du hackathon** et supprimé seulement sur
demande explicite d'un humain. Cette modification remplace la suppression
automatique après analyse prévue dans la proposition.
**Conséquences :** le wrapper ne supprime jamais un `data-dir`. L'audio n'ayant
pas été testé en instance dédiée, ce test ouvre l'étape 1 ; en cas de conflit
sur le micro, repli : instance dédiée avec audio, instance de l'application
desktop arrêtée pendant la session.

## 2026-10-18 — Panneau de contrôle web en fenêtre popup (proposée)

**Contexte :** piloter une session depuis le terminal (`start`, `ready`, `mark`,
`stop`) et éditer le manifeste à la main n'est pas ergonomique pendant une
présentation. Il faut une fenêtre détachable avec les commandes, les rappels de
mise en place et une fiche de préparation (navigateur, visio, date, durée).
**Proposition :** page `web/controle.html` servie par `serve`, ouverte dans une
fenêtre séparée, qui appelle des routes d'écriture de `server.js`. Le CLI et le
serveur partagent un même module de service. Détail dans `SPEC_controle.md`.
**Alternatives écartées :** Electron ou Tauri (toujours au premier plan, mais
build et dépendances trop lourds pour 48 h), application macOS native,
extension de navigateur. Limite acceptée : sous Firefox, la fenêtre ne reste pas
au premier plan.
**Conséquences :**
- Les routes d'écriture lancent une capture : jeton par lancement, contrôle du
  `Host`, `Content-Type` JSON obligatoire, consentement explicite dans le corps
  de `start`.
- Le panneau est capturé par Screenpipe : son titre porte un marqueur et
  `timeline.js` écarte ses frames avant tout calcul.
- Le manifeste gagne un champ optionnel `contexte`, sans casser les sessions
  existantes.
- Livraison par lots A à D ; seul le lot A est indispensable.
**Statut :** Proposée — en attente de validation par un humain de l'équipe.
