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
