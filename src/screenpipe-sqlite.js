import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
export function compterFrames(sessionDir, debut, fin) {
  const dbPath = join(sessionDir, 'screenpipe', 'db.sqlite');
  if (!debut || !fin || !existsSync(dbPath)) return 0;
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const ligne = db.prepare(
      'SELECT COUNT(*) AS n FROM frames WHERE julianday(timestamp) >= julianday(?) - 1.0 / 86400 AND julianday(timestamp) <= julianday(?) + 1.0 / 86400'
    ).get(debut, fin);
    return Number(ligne.n);
  } catch {
    return 0;
  } finally {
    db?.close();
  }
}
