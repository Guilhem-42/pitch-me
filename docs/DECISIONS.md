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
