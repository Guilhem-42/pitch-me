import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

/**
 * Récupère les données d'une session directement depuis SQLite
 * (lecture seule, sans relancer Screenpipe)
 * @param {string} sessionDir - Chemin vers le dossier de session
 * @param {string} debut - Début (ISO 8601)
 * @param {string} fin - Fin (ISO 8601)
 * @returns {Promise<Object>} Données {frames, audio}
 */
export async function recupererDonneesDepuisSqlite(sessionDir, debut, fin) {
  const dbPath = join(sessionDir, 'screenpipe', 'db.sqlite');

  // Ouvrir en lecture seule
  const db = new DatabaseSync(dbPath, { readOnly: true });

  try {
    // Frames (OCR)
    const framesStmt = db.prepare(`
      SELECT
        timestamp,
        app_name,
        window_name,
        text
      FROM frames
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    const framesRows = framesStmt.all(debut, fin);
    const frames = framesRows.map(row => ({
      content: {
        timestamp: row.timestamp,
        app_name: row.app_name,
        window_name: row.window_name,
        text: row.text || ''
      }
    }));

    // Audio (transcriptions)
    const audioStmt = db.prepare(`
      SELECT
        timestamp,
        transcription
      FROM audio_transcriptions
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    const audioRows = audioStmt.all(debut, fin);
    const audio = audioRows.map(row => ({
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
