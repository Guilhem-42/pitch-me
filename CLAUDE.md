# Pitch-Me — hackathon Screenpipe 2026

Dépôt d'équipe (4 personnes) pour un hackathon de 48 h. Wrapper Node qui pilote
Screenpipe pour des sessions d'entraînement cadrées, puis produit un bilan par
un LLM. Voir `README.md` et `docs/ARCHI_pitch-me.md`.

## Conventions

- Échanges, commits et documents en français.
- Commits : `[portée] type: résumé`, à l'infinitif, 72 caractères au plus.
- Documents dans `docs/`, nommés `TYPE_sujet.md` (`ARCHI`, `SPEC`, `GUIDE`,
  `REF`, `NOTES`). Version et date dans l'en-tête, jamais dans le nom.
- Décisions dans `docs/DECISIONS.md` : une entrée par décision, jamais
  réécrite. Un agent propose, un humain de l'équipe tranche.
- Pas de version ni de CHANGELOG (hackathon).

## Garde-fous

- Ne jamais lire, afficher ni committer le contenu de `sessions/` ou de
  `.screenpipe/` : ce sont des captures d'écran et d'audio.
- Ne jamais committer de clé ni de `.env`.
- Ne pas supprimer de dossier ou de dépôt sans validation explicite.
- Pas de chemin absolu en dur dans un fichier versionné.
- `preparation/` est ignoré par git : ne pas y renvoyer depuis les fichiers
  versionnés.
