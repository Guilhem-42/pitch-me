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
| `docs/`          | Architecture (`ARCHI_*`), décisions (`DECISIONS.md`)         |
| `presentation/`  | Deck de présentation (PDF)                                   |
| `preparation/`   | Notes de préparation, **non versionné** (dossier voisin `../preparation/`) |
| `sessions/`      | Données de capture, **jamais versionnées**                   |

## Liens

| | |
|---|---|
| **Deck** | [`presentation/Pitch-Me-UP_slides_v1_18-10-2026.pdf`](presentation/Pitch-Me-UP_slides_v1_18-10-2026.pdf) (6 pages) |
| **Vidéo de démo** | `Pitch-Me-UP_presentation-video_v1_18-10-2026.mp4` (27 Mo, non versionnée) ; lien en ligne à ajouter |
| **Soumission** | lien à ajouter |

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
- Branches : commits directement sur `main`, avec `git pull --rebase` avant chaque
  push (voir `docs/DECISIONS.md`).

## Démarrer

### Installation

1. Installer Node 20+
2. Installer Screenpipe : voir [screenpipe.ai](https://screenpipe.ai)
3. Installer les dépendances :
   ```bash
   npm install
   ```
4. Copier `.env.example` en `.env` et renseigner :
   ```bash
   cp .env.example .env
   ```
   - `ANTHROPIC_API_KEY` : clé API Claude (pour le rapport LLM)
   - `SCREENPIPE_API_KEY` : clé Screenpipe (`npx -y screenpipe@latest auth token`)
   - `SCREENPIPE_PORT` : port de l'instance dédiée (3035 par défaut)

### Utilisation

#### Créer une session

```bash
node src/cli.js new "Pitch v1 en visio"
```

Éditer `sessions/<id>/manifest.json` pour renseigner :
- `objectif` : ce que vous voulez atteindre
- `criteres` : critères de réussite
- `fenetres_prevues` : applications autorisées
- `audio` : `true` ou `false`

#### Lancer la capture

```bash
node src/cli.js start <id>
```

Confirmation demandée avant de lancer la capture.

#### Marquer le début du live

Quand vous êtes prêt à commencer :

```bash
node src/cli.js ready <id>
```

#### Poser des repères pendant le live

```bash
node src/cli.js mark <id> blocage "je n'arrive pas à..."
node src/cli.js mark <id> ok "ça fonctionne"
```

#### Arrêter la capture

```bash
node src/cli.js stop <id>
```

#### Générer le rapport

Calcule la timeline et génère le rapport via LLM :

```bash
node src/cli.js report <id>
```

#### Consulter le dashboard

```bash
node src/cli.js serve
```

Ouvrir http://localhost:3000 dans le navigateur.

#### Créer la session suivante

Reprend la checklist et compare avec la session précédente :

```bash
node src/cli.js next <id>
```

### Tests

```bash
npm test
```
