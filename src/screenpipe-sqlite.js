import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TRAVAILLEUR = join(dirname(fileURLToPath(import.meta.url)), 'sqlite-worker.js');

/**
 * Charge node:sqlite. Indisponible dans le Node embarqué d'Electron : on renvoie
 * alors null et l'appelant délègue à un processus `node` système (voir deleguer).
 */
async function chargerSqlite() {
  try {
    return (await import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
}

/** Exécute l'opération dans un processus `node` système et renvoie son JSON. */
function deleguer(operation, args) {
  if (process.env.PITCHME_TRAVAILLEUR === '1') {
    return Promise.reject(new Error('node:sqlite indisponible : Node 22.5 ou plus requis'));
  }
  return new Promise((resolve, reject) => {
    execFile(
      process.env.PITCHME_NODE || 'node',
      ['--no-warnings', TRAVAILLEUR, operation, ...args],
      { maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PITCHME_TRAVAILLEUR: '1' } },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message).trim().split('\n').pop()));
          return;
        }
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Réponse illisible du processus node')); }
      }
    );
  });
}

/**
 * Récupère les données d'une session directement depuis SQLite
 * (lecture seule, sans relancer Screenpipe).
 *
 * Schéma réel de Screenpipe : `frames` (timestamp, app_name, window_name,
 * full_text pour l'OCR, accessibility_text en repli) et
 * `audio_transcriptions` (timestamp, transcription). Les horodatages sont au
 * format `2026-10-18T06:07:09.526123+00:00` : on les compare en dates, pas en
 * texte, avec une marge d'une seconde côté SQL puis un filtre exact en JS.
 *
 * @param {string} sessionDir - Chemin vers le dossier de session
 * @param {string} debut - Début (ISO 8601)
 * @param {string} fin - Fin (ISO 8601)
 * @returns {Promise<Object>} Données {frames, audio}
 */
export async function recupererDonneesDepuisSqlite(sessionDir, debut, fin) {
  const dbPath = join(sessionDir, 'screenpipe', 'db.sqlite');
  if (!existsSync(dbPath)) {
    throw new Error(`Base Screenpipe introuvable : ${dbPath}`);
  }

  const DatabaseSync = await chargerSqlite();
  if (!DatabaseSync) {
    return deleguer('donnees', [sessionDir, debut, fin]);
  }

  const debutMs = Date.parse(debut);
  const finMs = Date.parse(fin);
  const dansLaPlage = ts => {
    const t = Date.parse(ts);
    return t >= debutMs && t <= finMs;
  };

  const db = new DatabaseSync(dbPath, { readOnly: true });

  try {
    const framesRows = db.prepare(`
      SELECT
        timestamp,
        app_name,
        window_name,
        COALESCE(NULLIF(full_text, ''), NULLIF(accessibility_text, ''), '') AS text
      FROM frames
      WHERE julianday(timestamp) >= julianday(?) - 1.0 / 86400
        AND julianday(timestamp) <= julianday(?) + 1.0 / 86400
      ORDER BY timestamp ASC
    `).all(debut, fin);

    const frames = framesRows
      .filter(row => dansLaPlage(row.timestamp))
      .map(row => ({
        content: {
          timestamp: row.timestamp,
          app_name: row.app_name,
          window_name: row.window_name,
          text: row.text || ''
        }
      }));

    const audioRows = db.prepare(`
      SELECT
        timestamp,
        transcription
      FROM audio_transcriptions
      WHERE julianday(timestamp) >= julianday(?) - 1.0 / 86400
        AND julianday(timestamp) <= julianday(?) + 1.0 / 86400
      ORDER BY timestamp ASC
    `).all(debut, fin);

    const audio = audioRows
      .filter(row => dansLaPlage(row.timestamp))
      .map(row => ({
        content: {
          timestamp: row.timestamp,
          transcription: row.transcription || ''
        }
      }));

    return { frames, audio };
  } finally {
    db.close();
  }
}

/**
 * Compte les frames capturées dans l'intervalle (aucun contenu lu).
 * @returns {number} 0 si la base est absente ou illisible
 */
export async function compterFrames(sessionDir, debut, fin) {
  const dbPath = join(sessionDir, 'screenpipe', 'db.sqlite');
  if (!debut || !fin || !existsSync(dbPath)) return 0;
  const DatabaseSync = await chargerSqlite();
  if (!DatabaseSync) {
    return deleguer('compter', [sessionDir, debut, fin]).catch(() => 0);
  }
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const lignes = db.prepare(
      'SELECT timestamp FROM frames WHERE julianday(timestamp) >= julianday(?) - 1.0 / 86400 AND julianday(timestamp) <= julianday(?) + 1.0 / 86400'
    ).all(debut, fin);
    const d = Date.parse(debut);
    const f = Date.parse(fin);
    return lignes.filter(l => Date.parse(l.timestamp) >= d && Date.parse(l.timestamp) <= f).length;
  } catch {
    return 0;
  } finally {
    db?.close();
  }
}
