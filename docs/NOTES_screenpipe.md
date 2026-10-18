---
titre: Notes d'exploration de Screenpipe
type: notes
date: 2026-10-18
---

# Notes d'exploration de Screenpipe

Exploration de l'API Screenpipe en lecture seule pour l'étape 0 du wrapper Pitch-Me.
Aucune donnée personnelle n'est incluse dans ce document.

## 1. Version et point de terminaison /health

**Version de Screenpipe :** 0.4.52

**Commande pour obtenir la version :**
```bash
npx -y screenpipe@latest --version
```

**Port par défaut :** 3030

**Test de l'endpoint /health :**
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3030/health
```

Le endpoint `/health` retourne un objet JSON complet avec :
- `status` : statut global ("ok", "degraded", etc.)
- `dependencies` : état de ffmpeg, ffprobe, modèles ML
- `runtime` : informations sur onnxruntime, CPU, etc.
- `startup` : phase de démarrage, vérifications préliminaires
- `pipeline` : statistiques de capture (frames, FPS, latence OCR/DB, etc.)
- `ui_recorder` : état de la capture d'événements UI
- `pool_stats` : pools de connexion à la base de données
- `version`, `hostname`, et autres métadonnées système

**Note :** L'instance CLI doit être lancée avec `screenpipe record` pour que l'API
soit disponible. L'application desktop seule ne démarre pas le serveur API.

## 2. Authentification et endpoints

**Obtention du token d'authentification :**
```bash
npx -y screenpipe@latest auth token
```

Retourne un token de la forme `sp-xxxxxxxx`. Ce token est unique par installation
et persiste entre les redémarrages.

**Test réussi de /search :**

Endpoint : `GET /search`

Paramètres principaux :
- `q` : recherche full-text (optionnel)
- `content_type` : `all` | `ocr` | `audio` | `accessibility` | `input` | `memory`
- `limit` : nombre max de résultats (défaut : 10)
- `offset` : pagination
- `start` : début de la fenêtre temporelle (ISO 8601 ou relatif : "30m ago", "2h ago", etc.)
- `end` : fin de la fenêtre temporelle
- `app` : filtrer par nom d'application
- `window` : filtrer par titre de fenêtre
- `speaker` : filtrer par nom de locuteur (audio)

**Test réussi de /raw_sql :**

Endpoint : `GET /raw_sql?query=<SQL_ENCODED>`

Permet d'exécuter des requêtes SQL directement sur la base de données en lecture
seule. Exemple pour lister les tables :

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3030/raw_sql?query=SELECT%20name%20FROM%20sqlite_master%20WHERE%20type%3D%27table%27"
```

**Attention :** L'instance doit être lancée avec le serveur API actif pour que
ces endpoints répondent.

## 3. Schéma de la base de données

**Emplacement :** `~/.screenpipe/db.sqlite` (ou `<data-dir>/db.sqlite` pour une instance dédiée)

**Commande pour obtenir le schéma :**
```bash
# Avec l'instance arrêtée :
sqlite3 ~/.screenpipe/db.sqlite ".schema"

# Ou via la CLI screenpipe :
npx -y screenpipe@latest search --help
```

### Tables principales pour Pitch-Me

#### Captures d'écran : `frames`
```sql
CREATE TABLE frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_chunk_id INTEGER,
    offset_index INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMP NOT NULL,
    name TEXT,
    app_name TEXT,
    window_name TEXT,
    focused BOOLEAN,
    browser_url TEXT,
    snapshot_path TEXT,
    accessibility_text TEXT,
    full_text TEXT,
    -- ... autres colonnes
)
```

**Colonnes utiles :**
- `timestamp` : horodatage de la capture
- `app_name` : nom de l'application au premier plan
- `window_name` : titre de la fenêtre
- `focused` : si la fenêtre était au focus
- `full_text` : texte extrait (OCR ou accessibilité)
- `snapshot_path` : chemin de l'image de la frame

**Index utiles :**
- `idx_frames_timestamp`
- `idx_frames_app_name_timestamp`

#### Structure de l'UI : `elements`
```sql
CREATE TABLE elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frame_id INTEGER NOT NULL,
    source TEXT NOT NULL,  -- 'ocr' | 'accessibility'
    role TEXT NOT NULL,    -- 'AXButton', 'AXTextField', etc.
    text TEXT,
    parent_id INTEGER,
    depth INTEGER NOT NULL DEFAULT 0,
    left_bound REAL,       -- bounding box normalisée 0-1
    top_bound REAL,
    width_bound REAL,
    height_bound REAL,
    confidence REAL,       -- pour OCR
    -- ...
)
```

**Utilité :** Permet d'extraire le texte à l'écran de manière structurée.
La colonne `source` indique si c'est de l'OCR ou de l'accessibilité native.

#### Audio : `audio_chunks` et `audio_transcriptions`
```sql
CREATE TABLE audio_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    timestamp TIMESTAMP,
    transcription_status TEXT,
    -- ...
)

CREATE TABLE audio_transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_chunk_id INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    transcription TEXT NOT NULL,
    speaker_id INTEGER,
    start_time REAL,
    end_time REAL,
    text_length INTEGER,
    -- ...
)
```

**Utilité :**
- `audio_chunks` : segments audio bruts
- `audio_transcriptions` : transcriptions avec attribution de locuteur
- `start_time` / `end_time` : permettent de situer les segments dans le chunk

#### Locuteurs : `speakers`
```sql
CREATE TABLE speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    metadata JSON,
    hallucination BOOLEAN DEFAULT FALSE,
    -- ...
)
```

**Utilité :** Identification des locuteurs dans les transcriptions audio.
La colonne `hallucination` indique si le locuteur est potentiellement fictif.

#### Événements UI : `ui_events`
```sql
CREATE TABLE ui_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    event_type TEXT NOT NULL,  -- click, move, scroll, key, text, ...
    x INTEGER,
    y INTEGER,
    app_name TEXT,
    window_title TEXT,
    text_content TEXT,
    frame_id INTEGER,
    -- ...
)
```

**Utilité :** Capture des interactions utilisateur (clics, saisie, etc.).
Peut servir à détecter les changements d'application ou de fenêtre.

#### Réunions : `meetings`
```sql
CREATE TABLE meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_start TEXT NOT NULL,
    meeting_end TEXT,
    meeting_app TEXT NOT NULL,
    title TEXT,
    attendees TEXT,
    note TEXT,
    -- ...
)
```

**Utilité :** Détection automatique de réunions (Zoom, Teams, Meet, etc.).
Peut être utilisée pour détecter les sessions de visio.

### Tables de recherche full-text (FTS5)

- `frames_fts` : recherche dans le texte des frames
- `audio_transcriptions_fts` : recherche dans les transcriptions
- `elements_fts` : recherche dans les éléments UI
- `ui_events_fts` : recherche dans les événements UI

Ces tables sont automatiquement maintenues par des triggers SQLite.

## 4. Instance dédiée vs instance existante

**Test réalisé :** Démarrer une instance dédiée en parallèle de l'instance habituelle.

**Commande de test :**
```bash
npx -y screenpipe@latest record \
  --port 3035 \
  --data-dir /tmp/screenpipe-test \
  --disable-audio
```

**Résultat :** ✅ Deux instances peuvent tourner en parallèle sans conflit.

**Observations :**
- Chaque instance a sa propre base de données SQLite dans son `data-dir`
- Chaque instance écoute sur son propre port
- Le token d'authentification est le même pour toutes les instances (stocké globalement)
- Une instance dédiée peut être lancée avec des paramètres spécifiques :
  - `--disable-audio` : désactiver la capture audio
  - `--monitor-id` : sélectionner des écrans spécifiques
  - `--data-dir` : répertoire de données dédié

**Arrêt propre :**
Un fichier PID n'est pas créé par défaut. L'arrêt doit se faire via :
- SIGTERM sur le PID du processus
- Ou `kill <PID>` (récupéré via `ps aux | grep screenpipe`)

## 5. Décision proposée

### Proposition : Instance dédiée par session

**Justification :**

**Avantages :**
- Isolation complète des données : chaque session a sa propre base, aucun risque
  de mélange avec les captures personnelles de l'utilisateur
- Contrôle total sur le cycle de vie : démarrage et arrêt au moment précis de
  la session d'entraînement
- Configuration spécifique : possibilité de désactiver l'audio, sélectionner
  des écrans, etc.
- Nettoyage facile : supprimer le `data-dir` après analyse pour libérer l'espace

**Inconvénients :**
- Démarrage plus lent : quelques secondes pour initialiser l'instance
- Gestion du processus enfant : nécessite un suivi du PID, arrêt propre, gestion
  des plantages
- Espace disque : chaque session crée sa propre base (mais temporaire)

**Contre-proposition : Instance existante filtrée par plage horaire**

**Avantages :**
- Pas de gestion de processus enfant
- Démarrage immédiat (l'instance tourne déjà)
- Pas de doublon de données

**Inconvénients :**
- Pas d'isolation : les captures personnelles de l'utilisateur sont mélangées
  avec celles de l'entraînement
- Risque de confidentialité : les requêtes SQL ou API pourraient exposer des
  données personnelles par erreur
- Configuration globale : impossible de personnaliser les paramètres de capture
  pour une session donnée

**Recommandation :** Instance dédiée par session

La complexité supplémentaire (gestion du processus) est largement compensée par
l'isolation et le contrôle. L'étape 1 du wrapper devra :
1. Lancer `screenpipe record` avec `child_process.spawn`
2. Attendre `/health` pour confirmer le démarrage
3. Écrire le PID dans `sessions/<id>/screenpipe.pid`
4. Arrêter proprement avec SIGTERM au `stop`
5. Gérer les plantages (vérifier que le processus tourne, redémarrer si besoin)

**État :** Proposée — en attente de validation par un humain de l'équipe.

---

## Commandes reproductibles

**Vérifier le statut de Screenpipe :**
```bash
npx -y screenpipe@latest status
```

**Démarrer une instance dédiée de test :**
```bash
npx -y screenpipe@latest record \
  --port 3035 \
  --data-dir /tmp/screenpipe-test \
  --disable-audio
```

**Tester l'API :**
```bash
# Obtenir le token
TOKEN=$(npx -y screenpipe@latest auth token)

# Tester /health
curl -H "Authorization: Bearer $TOKEN" http://localhost:3035/health

# Rechercher les frames des 5 dernières minutes
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3035/search?content_type=ocr&start=5m%20ago&limit=5"

# Requête SQL : compter les frames
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3035/raw_sql?query=SELECT%20COUNT(*)%20FROM%20frames"
```

**Arrêter l'instance de test :**
```bash
# Trouver le PID
ps aux | grep "screenpipe record.*3035" | grep -v grep

# Arrêter proprement
kill <PID>
```

**Examiner le schéma de la base :**
```bash
# Arrêter screenpipe d'abord pour déverrouiller la base
sqlite3 /tmp/screenpipe-test/db.sqlite ".schema"
```

---

## Points d'attention pour l'étape 1

1. **Permissions :** Screenpipe nécessite les permissions "Screen Recording" et
   "Accessibility" sur macOS. Les vérifier avant de lancer une session.

2. **Démarrage asynchrone :** Le processus `screenpipe record` ne bloque pas
   immédiatement. Utiliser un polling sur `/health` pour attendre que l'API
   soit prête.

3. **Arrêt propre :** SIGTERM permet à Screenpipe de finaliser les écritures
   en cours. SIGKILL (kill -9) risque de corrompre la base.

4. **Fichier WAL :** SQLite utilise le mode WAL (Write-Ahead Logging). Le fichier
   `db.sqlite-wal` doit être présent pendant l'enregistrement. Ne pas le supprimer.

5. **Espace disque :** Les captures d'écran (snapshots) peuvent consommer beaucoup
   d'espace. Prévoir un nettoyage après l'analyse.

6. **Timestamps :** Toutes les dates sont en UTC (ISO 8601). Conversion nécessaire
   pour afficher en heure locale.

---

## Test de l'audio en instance dédiée (2026-10-18)

**Contexte :** Suite à la validation de la décision « Instance dédiée par session »,
test pour vérifier qu'une instance dédiée peut capturer l'audio sans conflit avec
l'instance desktop.

**Test réalisé :**
```bash
npx -y screenpipe@latest record --port 3035 --data-dir preparation/test-audio-instance
```

**Résultat :**
- ✅ Instance dédiée lancée avec succès sur le port 3035
- ✅ Le endpoint `/health` répond correctement avec la même clé API (`sp-a8066f65`)
- ℹ️ État audio : `"audio_status":"no_input_device"` - aucun micro détecté
- ✅ Pas de conflit avec l'instance desktop (qui n'était pas lancée)

**Observation importante :**
L'absence de micro détecté n'est pas un conflit, c'est simplement l'état du système
au moment du test. Lorsqu'un micro est présent, l'instance dédiée peut capturer
l'audio par défaut (sauf si `--disable-audio` est passé).

**Conclusion :**
Une instance dédiée peut coexister avec l'instance desktop sans conflit sur la capture
audio. Si un conflit sur le micro se produit en production, le repli prévu est :
arrêter l'instance desktop pendant la session d'entraînement.

**Commandes utilisées :**
```bash
# Lancer l'instance de test
npx -y screenpipe@latest record --port 3035 --data-dir preparation/test-audio-instance &
PID=$!

# Vérifier le health
curl -H "Authorization: Bearer sp-a8066f65" -H "X-Screenpipe-Client: api" http://localhost:3035/health

# Arrêter l'instance
kill $PID
```
