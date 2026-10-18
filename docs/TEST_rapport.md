# Test de génération de rapport

## État actuel

Le wrapper est entièrement implémenté (étapes 1 à 5) mais ne peut pas être testé sans :

1. **Session réelle terminée** : une session créée avec `new`, lancée avec `start`, marquée avec `ready`, et arrêtée avec `stop`
2. **Configuration .env** :
   - `ANTHROPIC_API_KEY` : clé API Claude
   - `ANTHROPIC_MODEL` : identifiant du modèle (ex: `claude-sonnet-4-5-20250929`)
   - `SCREENPIPE_API_KEY` : clé Screenpipe

## Test avec fixtures

Un script `src/test-report.js` permet de tester la génération de rapport avec des données fictives sans lancer Screenpipe.

**Prérequis :** fichier `.env` configuré avec les clés API.

```bash
node src/test-report.js
```

Ce script :
- Charge les fixtures `manifest-session1.json` et `donnees-session1.json`
- Calcule la timeline
- Génère le rapport via LLM
- Affiche le résumé, verdict, constats, recommandations, TODOs détectés

## Amélioration du prompt

Le prompt `prompts/analyste.md` a été amélioré pour mieux détecter l'incohérence "Take" vs "Pitch-Me" :

### Section TODOs détectés (améliorée)

```markdown
### TODOs détectés

- **Examine attentivement tous les `extraits_texte` de timeline.json**
- Cherche des incohérences entre :
  - Le titre du projet dans le manifeste
  - Les noms, titres ou références dans les extraits de texte à l'écran
  - Les fenêtres d'applications (titres, contenu visible)
- **Exemple critique** : si le projet s'appelle "Pitch-Me" dans le manifeste
  mais que les extraits montrent "Take" ou un autre nom dans le deck ou les
  documents, c'est une incohérence majeure à signaler
- Chaque incohérence détectée doit avoir :
  - Un texte clair expliquant l'incohérence
  - La source exacte : `"extraits_texte"`
- **Sois proactif** : même une seule occurrence d'un nom différent dans les
  extraits mérite d'être signalée
```

## Extraits de texte dans les fixtures

Les fixtures de test contiennent l'incohérence volontaire :

```
130s [Google Chrome]: Take — Build Agents That Remember
```

Alors que le manifeste indique :
```json
{
  "id": "2026-10-18-s01",
  "titre": "Pitch v1 en visio"
}
```

Le LLM devrait détecter cette incohérence et la signaler dans `todo_detectes`.

## Test réel

Pour tester avec une vraie session :

1. Configurer `.env` :
   ```bash
   cp .env.example .env
   # Éditer .env et renseigner les clés
   ```

2. Créer et exécuter une session :
   ```bash
   # Créer
   node src/cli.js new "Test pitch"

   # Éditer sessions/<id>/manifest.json pour renseigner objectif, critères, etc.

   # Lancer (confirmation demandée)
   node src/cli.js start <id>

   # Marquer le début du live
   node src/cli.js ready <id>

   # Faire le pitch/démo...

   # Arrêter
   node src/cli.js stop <id>
   ```

3. Générer le rapport :
   ```bash
   node src/cli.js report <id>
   ```

4. Consulter le dashboard :
   ```bash
   node src/cli.js serve
   # Ouvrir http://localhost:3000
   ```

## Résultat attendu

Avec le prompt amélioré, le rapport devrait inclure dans `todo_detectes` :

```json
{
  "todo_detectes": [
    {
      "texte": "Incohérence détectée : le deck affiche 'Take — Build Agents That Remember' alors que le projet s'appelle 'Pitch-Me'",
      "source": "extraits_texte"
    }
  ]
}
```

## Verdict, constats et recommandations attendus

Basé sur les fixtures :

**Verdict :** `partiel`
- Durée live : 330s (dans la cible de 300s ± 60s)
- Mais sorties du cadre détectées (Slack)

**Constats :**
- Sortie du cadre vers Slack pendant 12s
- Visual Studio Code en début de session (préparation)

**Recommandations :**
- Fermer Slack avant la session
- Désactiver les notifications
- Préparer le deck à l'avance (éviter VS Code pendant la session)
