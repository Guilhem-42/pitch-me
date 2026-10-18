import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { CONFIG } from './config.js';
import {
  genererIdSession,
  creerManifeste,
  creerDossierSession,
  lireManifeste,
  ecrireManifeste,
  ajouterRepere
} from './manifest.js';
import {
  lancerScreenpipe,
  ecrirePid,
  lirePid,
  arreterScreenpipe,
  supprimerPid,
  processusEnVie
} from './screenpipe-process.js';
import { recupererDonneesDepuisSqlite } from './screenpipe-sqlite.js';
import { calculerTimeline } from './timeline.js';
import { genererRapport } from './report.js';

/**
 * Types d'erreur métier
 */
export class ErreurSession extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const ERREUR = {
  INTROUVABLE: 'INTROUVABLE',
  ETAT_INVALIDE: 'ETAT_INVALIDE',
  CONSENTEMENT_REQUIS: 'CONSENTEMENT_REQUIS',
  CONFIG_MANQUANTE: 'CONFIG_MANQUANTE',
  SESSION_ACTIVE: 'SESSION_ACTIVE'
};

/**
 * Résout le dossier d'une session. Refuse tout identifiant qui n'est pas un
 * nom de session simple (pas de séparateur ni de « .. »).
 * @param {string} id - ID de session
 * @returns {string} Chemin du dossier
 */
export function dossierSession(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ErreurSession(ERREUR.INTROUVABLE, 'Identifiant de session invalide');
  }
  return join(CONFIG.SESSIONS_DIR, id);
}

/**
 * Crée une nouvelle session
 * @param {string} titre - Titre de la session
 * @returns {Promise<Object>} Session créée avec id, sessionDir, manifest
 */
export async function creerSession(titre) {
  const id = await genererIdSession(CONFIG.SESSIONS_DIR);
  const sessionDir = dossierSession(id);

  await creerDossierSession(sessionDir);
  await creerDossierSession(join(sessionDir, 'screenpipe'));

  const manifest = creerManifeste(id, titre);
  await ecrireManifeste(sessionDir, manifest);

  return { id, sessionDir, manifest };
}

/**
 * Duplique une session existante
 * @param {string} idSource - ID de la session à dupliquer
 * @returns {Promise<Object>} Nouvelle session créée
 */
export async function dupliquerSession(idSource) {
  const sessionDirSource = dossierSession(idSource);
  const manifestSource = await lireManifeste(sessionDirSource);

  // Créer la nouvelle session
  const titre = `${manifestSource.titre} (copie)`;
  const id = await genererIdSession(CONFIG.SESSIONS_DIR);
  const sessionDir = dossierSession(id);

  await creerDossierSession(sessionDir);
  await creerDossierSession(join(sessionDir, 'screenpipe'));

  // Créer le manifeste en copiant les champs appropriés
  const manifest = {
    ...creerManifeste(id, titre),
    objectif: manifestSource.objectif,
    criteres: manifestSource.criteres,
    duree_cible_s: manifestSource.duree_cible_s,
    fenetres_prevues: manifestSource.fenetres_prevues,
    audio: manifestSource.audio,
    session_precedente: manifestSource.session_precedente,
    guide: manifestSource.guide,
    contexte: manifestSource.contexte ? {
      ...manifestSource.contexte,
      date_prevue: null
    } : null,
    // Checklist avec tous les rappels décochés
    checklist: manifestSource.checklist.map(item => ({
      ...item,
      fait: false
    }))
  };

  await ecrireManifeste(sessionDir, manifest);

  return { id, sessionDir, manifest };
}

/**
 * Met à jour le champ contexte du manifeste
 * @param {string} id - ID de session
 * @param {Object} contexte - Contexte à écrire
 * @returns {Promise<Object>} Manifeste mis à jour
 */
export async function majFiche(id, contexte) {
  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  manifest.contexte = contexte;
  await ecrireManifeste(sessionDir, manifest);

  return manifest;
}

/**
 * Met à jour le guide du manifeste
 * @param {string} id - ID de session
 * @param {Object} guide - Guide à écrire
 * @returns {Promise<Object>} Manifeste mis à jour
 */
export async function majGuide(id, guide) {
  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut !== 'preparation') {
    throw new ErreurSession(
      ERREUR.ETAT_INVALIDE,
      'Le guide ne peut être modifié qu\'en préparation'
    );
  }

  manifest.guide = guide;
  await ecrireManifeste(sessionDir, manifest);

  return manifest;
}

/**
 * Coche un élément de checklist
 * @param {string} id - ID de session
 * @param {number} index - Index de l'élément dans la checklist
 * @returns {Promise<Object>} Manifeste mis à jour
 */
export async function cocherRappel(id, index) {
  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  if (!manifest.checklist || !manifest.checklist[index]) {
    throw new ErreurSession(ERREUR.INTROUVABLE, `Élément de checklist ${index} introuvable`);
  }

  manifest.checklist[index].fait = true;
  await ecrireManifeste(sessionDir, manifest);

  return manifest;
}

/**
 * Démarre la capture (phase préparation)
 * @param {string} id - ID de session
 * @param {boolean} consentement - Consentement explicite
 * @returns {Promise<Object>} Résultat avec pid, manifest
 */
export async function demarrer(id, consentement = false) {
  if (!consentement) {
    throw new ErreurSession(ERREUR.CONSENTEMENT_REQUIS, 'Consentement explicite requis');
  }

  if (!CONFIG.SCREENPIPE_API_KEY) {
    throw new ErreurSession(ERREUR.CONFIG_MANQUANTE, 'SCREENPIPE_API_KEY manquante');
  }

  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut !== 'preparation') {
    throw new ErreurSession(
      ERREUR.ETAT_INVALIDE,
      `État invalide: ${manifest.statut} (attendu: preparation)`
    );
  }

  // Vérifier qu'aucune session n'est active
  const sessions = await listerSessions();
  const active = sessions.find(s => s.statut === 'live');
  if (active) {
    throw new ErreurSession(ERREUR.SESSION_ACTIVE, `Session ${active.id} déjà active`);
  }

  // Lancer Screenpipe
  const dataDir = join(sessionDir, 'screenpipe');
  const pid = await lancerScreenpipe(
    dataDir,
    CONFIG.SCREENPIPE_PORT,
    CONFIG.SCREENPIPE_API_KEY,
    !manifest.audio
  );

  await ecrirePid(sessionDir, pid);

  // Mettre à jour le manifeste
  manifest.debut = new Date().toISOString();
  manifest.statut = 'live';
  await ecrireManifeste(sessionDir, manifest);

  return { pid, manifest };
}

/**
 * Pose le repère "prêt" (début du live)
 * @param {string} id - ID de session
 * @returns {Promise<Object>} Manifeste mis à jour
 */
export async function pret(id) {
  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut !== 'live' || manifest.pret !== null) {
    throw new ErreurSession(
      ERREUR.ETAT_INVALIDE,
      'La session doit être en cours et sans repère "prêt"'
    );
  }

  manifest.pret = new Date().toISOString();
  await ecrireManifeste(sessionDir, manifest);

  return manifest;
}

/**
 * Pose un repère
 * @param {string} id - ID de session
 * @param {string} type - Type de repère (blocage, ok, note, point)
 * @param {string} texte - Texte du repère
 * @returns {Promise<Object>} Manifeste mis à jour
 */
export async function repere(id, type, texte = '') {
  const types = ['pret', 'blocage', 'ok', 'note', 'point'];
  if (!types.includes(type)) {
    throw new ErreurSession(ERREUR.ETAT_INVALIDE, `Type invalide: ${type}`);
  }

  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  const updated = ajouterRepere(manifest, type, texte);
  await ecrireManifeste(sessionDir, updated);

  return updated;
}

/**
 * Arrête la capture
 * @param {string} id - ID de session
 * @returns {Promise<Object>} Manifeste mis à jour
 */
export async function arreter(id) {
  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut === 'termine') {
    throw new ErreurSession(ERREUR.ETAT_INVALIDE, 'Session déjà terminée');
  }

  // Lire le PID et arrêter le processus
  const pid = await lirePid(sessionDir);
  if (pid && processusEnVie(pid)) {
    await arreterScreenpipe(pid);
  }
  if (pid) {
    await supprimerPid(sessionDir);
  }

  // Mettre à jour le manifeste
  manifest.fin = new Date().toISOString();
  manifest.statut = 'termine';
  await ecrireManifeste(sessionDir, manifest);

  return manifest;
}

/**
 * Supprime une session en la déplaçant dans `sessions/_corbeille/` (récupérable).
 * Refuse une session en cours de capture.
 * @param {string} id - ID de session
 * @returns {Promise<{id: string, corbeille: string}>}
 */
export async function supprimerSession(id) {
  const sessionDir = dossierSession(id);
  const { rename, mkdir } = await import('node:fs/promises');
  const manifest = await lireManifeste(sessionDir).catch(() => {
    throw new ErreurSession(ERREUR.INTROUVABLE, `Session introuvable : ${id}`);
  });
  const pid = await lirePid(sessionDir);
  if (manifest.statut === 'live' || (pid && processusEnVie(pid))) {
    throw new ErreurSession(ERREUR.ETAT_INVALIDE, 'Session en cours : arrêtez-la avant de la supprimer');
  }
  const corbeille = join(CONFIG.SESSIONS_DIR, '_corbeille');
  await mkdir(corbeille, { recursive: true });
  const cible = join(corbeille, `${id}-${Date.now()}`);
  await rename(sessionDir, cible);
  return { id, corbeille: '_corbeille' };
}

/**
 * Retourne l'état d'une session
 * @param {string} id - ID de session
 * @returns {Promise<Object>} État de la session
 */
export async function etat(id) {
  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  let pidVivant = false;
  const pid = await lirePid(sessionDir);
  if (pid) {
    pidVivant = processusEnVie(pid);
  }

  return {
    id: manifest.id,
    titre: manifest.titre,
    statut: manifest.statut,
    debut: manifest.debut,
    pret: manifest.pret,
    fin: manifest.fin,
    pid,
    pidVivant
  };
}

/**
 * Lance le calcul de timeline et génération du rapport
 * @param {string} id - ID de session
 * @returns {Promise<Object>} Rapport généré
 */
export async function lancerRapport(id) {
  if (!CONFIG.ANTHROPIC_API_KEY || !CONFIG.ANTHROPIC_MODEL) {
    throw new ErreurSession(ERREUR.CONFIG_MANQUANTE, 'ANTHROPIC_API_KEY ou ANTHROPIC_MODEL manquante');
  }

  const sessionDir = dossierSession(id);
  const manifest = await lireManifeste(sessionDir);

  if (manifest.statut !== 'termine') {
    throw new ErreurSession(ERREUR.ETAT_INVALIDE, 'La session doit être terminée');
  }

  // Récupérer les données directement depuis SQLite (lecture seule)
  const donnees = await recupererDonneesDepuisSqlite(
    sessionDir,
    manifest.debut,
    manifest.fin
  );

  // Calculer la timeline
  const timeline = calculerTimeline(manifest, donnees);

  // Écrire timeline.json
  const timelinePath = join(sessionDir, 'timeline.json');
  await writeFile(timelinePath, JSON.stringify(timeline, null, 2), 'utf-8');

  // Générer le rapport
  const rapport = await genererRapport(
    manifest,
    timeline,
    CONFIG.SESSIONS_DIR,
    CONFIG.ANTHROPIC_API_KEY,
    CONFIG.ANTHROPIC_MODEL
  );

  // Écrire report.json
  const reportPath = join(sessionDir, 'report.json');
  await writeFile(reportPath, JSON.stringify(rapport, null, 2), 'utf-8');

  // Mettre à jour le statut
  manifest.statut = 'analyse';
  await ecrireManifeste(sessionDir, manifest);

  return rapport;
}

/**
 * Crée la session suivante depuis une session terminée
 * @param {string} idPrecedent - ID de la session précédente
 * @returns {Promise<Object>} Nouvelle session créée
 */
export async function creerSessionSuivante(idPrecedent) {
  const sessionDirPrecedente = dossierSession(idPrecedent);

  // Lire le rapport de la session précédente
  let reportPrecedent;
  try {
    const reportPath = join(sessionDirPrecedente, 'report.json');
    const content = await readFile(reportPath, 'utf-8');
    reportPrecedent = JSON.parse(content);
  } catch {
    throw new ErreurSession(ERREUR.INTROUVABLE, 'Rapport de la session précédente introuvable');
  }

  // Lire le manifeste précédent
  const manifestPrecedent = await lireManifeste(sessionDirPrecedente);

  // Générer un nouveau titre
  const titre = `${manifestPrecedent.titre} (suite)`;

  // Créer la nouvelle session
  const id = await genererIdSession(CONFIG.SESSIONS_DIR);
  const sessionDir = dossierSession(id);

  await creerDossierSession(sessionDir);
  await creerDossierSession(join(sessionDir, 'screenpipe'));

  // Créer le manifeste en reprenant la checklist du rapport précédent
  const manifest = {
    ...creerManifeste(id, titre),
    objectif: manifestPrecedent.objectif,
    criteres: manifestPrecedent.criteres,
    duree_cible_s: manifestPrecedent.duree_cible_s,
    fenetres_prevues: manifestPrecedent.fenetres_prevues,
    audio: manifestPrecedent.audio,
    session_precedente: idPrecedent,
    checklist: reportPrecedent.checklist_suivante
  };

  await ecrireManifeste(sessionDir, manifest);

  return { id, sessionDir, manifest, checklist: reportPrecedent.checklist_suivante };
}

/**
 * Liste toutes les sessions
 * @returns {Promise<Array>} Liste des sessions
 */
async function listerSessions() {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(CONFIG.SESSIONS_DIR, { withFileTypes: true });

  const sessions = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const sessionDir = join(CONFIG.SESSIONS_DIR, entry.name);
        const manifest = await lireManifeste(sessionDir);
        sessions.push(manifest);
      } catch {
        // Ignorer les dossiers sans manifeste valide
      }
    }
  }

  return sessions;
}
