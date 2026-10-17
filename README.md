# Pitch-Me — hackathon Screenpipe 2026

Dépôt de l'équipe pour le hackathon « Build Agents That Remember »
(Screenpipe × 42Entrepreneurs, École 42 Paris, 16–18 octobre 2026).

## Le projet

Un wrapper qui pilote Screenpipe pour des **sessions d'entraînement cadrées** :
prise → bilan → prise suivante. Chaque session a un objectif, une capture limitée
à la durée de la session, puis un bilan (timeline, analyse, recommandations,
mini dashboard) qui prépare la session suivante. Cas d'usage de la démo : la
répétition de notre propre pitch, en plusieurs itérations.

## Organisation du dépôt

| Dossier          | Contenu                                                      |
|------------------|--------------------------------------------------------------|
| `src/`           | Wrapper : pilotage de Screenpipe, extraction, rapport        |
| `web/`           | Mini dashboard du bilan                                      |
| `prompts/`       | Manifeste de session et prompts du bilan                     |
| `pitch/`         | Pitch deck (versions v1, v2, v3 exportées)                   |
| `docs/`          | Architecture (`ARCHI_*`), décisions (`DECISIONS.md`)         |
| `preparation/`   | Notes de préparation, **non versionné** (voir `.gitignore`)  |
| `sessions/`      | Données de capture, **jamais versionnées**                   |

## Équipe

- Guilhem-42
- DaliDev-IA
- Yihuan
- Alyosha

## Règles

- **Aucune donnée de capture dans git** : les captures d'écran, l'audio et les
  bases Screenpipe restent en local (`sessions/`, `.screenpipe/`).
- **Aucun secret** : variables dans `.env` (non versionné), modèle dans
  `.env.example`.
- Consentement explicite avant d'enregistrer l'audio ou l'écran d'une autre
  personne.
- Commits : `[portée] type: résumé`, en français, à l'infinitif, 72 caractères
  au plus. Types : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
  Exemple : `[web] feat: afficher la frise des fenêtres`.
- Branches : [à confirmer — voir `docs/DECISIONS.md`].

## Démarrer

[À compléter dès que le wrapper tourne.]
