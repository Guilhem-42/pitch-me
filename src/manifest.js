import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestSchema } from './schemas.js';

/**
 * Génère un ID de session au format AAAA-MM-JJ-sNN
 * @param {string} sessionsDir - Répertoire des sessions
 * @returns {Promise<string>} ID de session
 */
export async function genererIdSession(sessionsDir) {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // AAAA-MM-JJ

  // Lire le dossier sessions pour trouver le prochain numéro
  try {
    const { readdir } = await import('node:fs/promises');
    const sessions = await readdir(sessionsDir);
    const sessionsDuJour = sessions.filter(s => s.startsWith(date));
    const numero = sessionsDuJour.length + 1;
    return `${date}-s${numero.toString().padStart(2, '0')}`;
  } catch (err) {
    // Si le dossier n'existe pas encore, c'est la première session
    return `${date}-s01`;
  }
}

/**
 * Crée un nouveau manifeste
 * @param {string} id - ID de session
 * @param {string} titre - Titre de la session
 * @returns {Object} Manifeste initial
 */
export function creerManifeste(id, titre) {
  return {
    id,
    titre,
    objectif: '',
    criteres: [],
    duree_cible_s: 300,
    fenetres_prevues: [],
    audio: true,
    session_precedente: null,
    checklist: [],
    reperes: [],
    debut: null,
    pret: null,
    fin: null,
    statut: 'preparation',
    guide: null
  };
}

/**
 * Lit un manifeste depuis le disque
 * @param {string} sessionDir - Répertoire de la session
 * @returns {Promise<Object>} Manifeste validé
 */
export async function lireManifeste(sessionDir) {
  const manifestPath = join(sessionDir, 'manifest.json');
  const content = await readFile(manifestPath, 'utf-8');
  const data = JSON.parse(content);
  return ManifestSchema.parse(data);
}

/**
 * Écrit un manifeste sur le disque
 * @param {string} sessionDir - Répertoire de la session
 * @param {Object} manifest - Manifeste à écrire
 */
export async function ecrireManifeste(sessionDir, manifest) {
  // Valider avant d'écrire
  const validated = ManifestSchema.parse(manifest);
  const manifestPath = join(sessionDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(validated, null, 2), 'utf-8');
}

/**
 * Ajoute un repère au manifeste
 * @param {Object} manifest - Manifeste
 * @param {string} type - Type de repère
 * @param {string} texte - Texte du repère
 * @returns {Object} Manifeste mis à jour
 */
export function ajouterRepere(manifest, type, texte = '') {
  const repere = {
    t: new Date().toISOString(),
    type,
    texte
  };
  return {
    ...manifest,
    reperes: [...manifest.reperes, repere]
  };
}

/**
 * Crée le répertoire de session
 * @param {string} sessionDir - Chemin du répertoire
 */
export async function creerDossierSession(sessionDir) {
  await mkdir(sessionDir, { recursive: true });
}
