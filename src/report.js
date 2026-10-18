import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReportSchema } from './schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Charge le prompt système
 * @returns {Promise<string>} Contenu du prompt
 */
async function chargerPromptSysteme() {
  const path = join(__dirname, '..', 'prompts', 'analyste.md');
  return readFile(path, 'utf-8');
}

/**
 * Charge le rapport de la session précédente si elle existe
 * @param {string|null} sessionPrecedente - ID de la session précédente
 * @param {string} sessionsDir - Répertoire des sessions
 * @returns {Promise<Object|null>} Rapport précédent ou null
 */
async function chargerRapportPrecedent(sessionPrecedente, sessionsDir) {
  if (!sessionPrecedente) {
    return null;
  }

  try {
    const reportPath = join(sessionsDir, sessionPrecedente, 'report.json');
    const content = await readFile(reportPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Pas de rapport précédent disponible
    return null;
  }
}

/**
 * Charge la timeline de la session précédente si elle existe
 * @param {string|null} sessionPrecedente - ID de la session précédente
 * @param {string} sessionsDir - Répertoire des sessions
 * @returns {Promise<Object|null>} Timeline précédente ou null
 */
async function chargerTimelinePrecedente(sessionPrecedente, sessionsDir) {
  if (!sessionPrecedente) {
    return null;
  }

  try {
    const timelinePath = join(sessionsDir, sessionPrecedente, 'timeline.json');
    const content = await readFile(timelinePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Construit le prompt utilisateur
 * @param {Object} manifest - Manifeste de session
 * @param {Object} timeline - Timeline calculée
 * @param {Object|null} rapportPrecedent - Rapport de la session précédente
 * @param {Object|null} timelinePrecedente - Timeline de la session précédente
 * @returns {string} Prompt utilisateur
 */
function construirePromptUtilisateur(manifest, timeline, rapportPrecedent, timelinePrecedente) {
  let prompt = '# Données de la session\n\n';

  prompt += '## manifest.json\n\n```json\n';
  prompt += JSON.stringify(manifest, null, 2);
  prompt += '\n```\n\n';

  prompt += '## timeline.json\n\n```json\n';
  prompt += JSON.stringify(timeline, null, 2);
  prompt += '\n```\n\n';

  if (rapportPrecedent && timelinePrecedente) {
    prompt += '## Session précédente\n\n';
    prompt += '### timeline_precedente.json\n\n```json\n';
    prompt += JSON.stringify(timelinePrecedente, null, 2);
    prompt += '\n```\n\n';
    prompt += '### report_precedent.json\n\n```json\n';
    prompt += JSON.stringify(rapportPrecedent, null, 2);
    prompt += '\n```\n\n';
  }

  prompt += '# Ta tâche\n\n';
  prompt += 'Produis le rapport de cette session au format JSON, en respectant toutes les règles.\n';

  return prompt;
}

/**
 * Valide les preuves dans le rapport
 * @param {Object} rapport - Rapport à valider
 * @param {Object} timeline - Timeline de référence
 * @returns {Array<string>} Liste des erreurs de preuve
 */
function validerPreuves(rapport, timeline) {
  const erreurs = [];

  for (const constat of rapport.constats) {
    const { source, t_s } = constat.preuve;

    // Vérifier que la source existe dans timeline
    if (!timeline[source]) {
      erreurs.push(`Preuve invalide pour "${constat.titre}": la source "${source}" n'existe pas dans timeline.json`);
      continue;
    }

    // Vérifier que le timestamp existe dans la source
    const sourceData = timeline[source];
    let found = false;

    if (Array.isArray(sourceData)) {
      // Chercher dans le tableau
      for (const item of sourceData) {
        // Vérifier les champs possibles de timestamp
        if (item.t_s === t_s || item.debut_s === t_s || Math.abs(item.debut_s - t_s) < 5) {
          found = true;
          break;
        }
      }
    } else if (typeof sourceData === 'object' && sourceData !== null) {
      // Pour les objets simples, vérifier si t_s est cohérent
      found = true;
    }

    if (!found) {
      erreurs.push(`Preuve invalide pour "${constat.titre}": aucune entrée trouvée dans "${source}" à t_s=${t_s}`);
    }
  }

  return erreurs;
}

/**
 * Appelle le LLM pour générer le rapport
 * @param {Object} manifest - Manifeste de session
 * @param {Object} timeline - Timeline calculée
 * @param {string} sessionsDir - Répertoire des sessions
 * @param {string} apiKey - Clé API Anthropic
 * @param {string} model - Modèle à utiliser
 * @returns {Promise<Object>} Rapport généré
 */
export async function genererRapport(manifest, timeline, sessionsDir, apiKey, model) {
  const client = new Anthropic({ apiKey });

  // Charger le prompt système
  const systeme = await chargerPromptSysteme();

  // Charger la session précédente si elle existe
  const rapportPrecedent = await chargerRapportPrecedent(manifest.session_precedente, sessionsDir);
  const timelinePrecedente = await chargerTimelinePrecedente(manifest.session_precedente, sessionsDir);

  // Construire le prompt utilisateur
  const promptUtilisateur = construirePromptUtilisateur(manifest, timeline, rapportPrecedent, timelinePrecedente);

  let tentative = 0;
  const maxTentatives = 2;

  while (tentative < maxTentatives) {
    tentative++;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systeme,
        messages: [
          {
            role: 'user',
            content: promptUtilisateur
          }
        ]
      });

      // Extraire le JSON de la réponse
      const content = response.content[0].text;
      let jsonText = content;

      // Essayer d'extraire le JSON si c'est dans un code block
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      // Parser le JSON
      const rapport = JSON.parse(jsonText);

      // Valider avec zod
      const validated = ReportSchema.parse(rapport);

      // Valider les preuves
      const erreursPreuves = validerPreuves(validated, timeline);
      if (erreursPreuves.length > 0) {
        if (tentative < maxTentatives) {
          // Relancer avec les erreurs
          const erreurMsg = erreursPreuves.join('\n');
          promptUtilisateur += `\n\n## Erreurs dans le rapport précédent\n\n${erreurMsg}\n\nCorrige ces erreurs et renvoie le rapport.`;
          continue;
        } else {
          throw new Error(`Preuves invalides après ${maxTentatives} tentatives:\n${erreursPreuves.join('\n')}`);
        }
      }

      return validated;
    } catch (err) {
      if (tentative < maxTentatives) {
        // Relancer avec l'erreur
        promptUtilisateur += `\n\n## Erreur dans le rapport précédent\n\n${err.message}\n\nCorrige l'erreur et renvoie le rapport.`;
      } else {
        throw new Error(`Échec de la génération du rapport après ${maxTentatives} tentatives: ${err.message}`);
      }
    }
  }

  throw new Error('Échec de la génération du rapport');
}
