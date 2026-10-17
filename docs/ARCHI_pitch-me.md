---
titre: Architecture de Pitch-Me
version: 0.1
maj: 2026-10-18
statut: brouillon
---

# Architecture de Pitch-Me

## Principe

Le code calcule les chiffres, le LLM les interprète. Le wrapper pilote la
capture pendant une session cadrée, construit une timeline compacte à partir de
l'historique Screenpipe, puis le LLM produit le bilan.

## Cycle d'une session

1. **Manifeste** : objectif, critère de réussite, durée cible, fenêtres prévues,
   audio oui ou non.
2. **Préparation** : la capture démarre dès la mise en place des outils
   (connexion, onglets, slides). Un bouton « Prêt » marque la fin.
3. **Live** : pitch ou démo. Des repères posés par le wrapper (« je bloque »,
   « ça marche ») sont stockés dans le manifeste.
4. **Fin** : arrêt de la capture, extraction, rapport.
5. **Session suivante** : pré-remplie avec les recommandations et la checklist.

## Briques

- **Wrapper** (Node) : lance et arrête `screenpipe record` (dossier de données et
  port dédiés), appelle l'API locale, calcule `timeline.json`.
- **LLM** : lit la timeline, produit `report.json` (sortie validée par schéma).
- **Dashboard** : page web servie par le wrapper.
- **Stockage** : fichiers JSON par session (manifeste, timeline, rapport),
  dans `sessions/` (non versionné).

## API Screenpipe utilisée (d'après la documentation)

`/search` (filtres `start_time`, `end_time`, `content_type`, `app_name`,
`window_name`), `/raw_sql` (lecture seule), `/activity-summary`,
`/frames/{id}/context`, `/elements`, `/health`. Authentification : en-tête
`Authorization: Bearer <clé>` plus `X-Screenpipe-Client: api`. Clé obtenue avec
`npx -y screenpipe@latest auth token`.

## Points à valider

1. Instance Screenpipe existante (plage horaire seulement) ou instance dédiée
   par session (démarrage et arrêt réels).
2. Noms exacts des colonnes de la base (`.schema`) avant d'écrire les requêtes.
3. Qualité de la transcription et des locuteurs sur l'audio mixé en visio.
4. La clé d'API change-t-elle avec un dossier de données séparé ?
5. Les « hésitations » sont une interprétation : à présenter comme indice.

## Révisions

- 0.1 (2026-10-18) : première version, issue de la conception initiale.
