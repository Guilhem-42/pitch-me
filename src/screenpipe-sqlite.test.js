import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recupererDonneesDepuisSqlite } from './screenpipe-sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('recupererDonneesDepuisSqlite', () => {
  test('lit les frames et audio depuis SQLite', async () => {
    const sessionDir = join(__dirname, '__fixtures__', 'session-test');

    const donnees = await recupererDonneesDepuisSqlite(
      sessionDir,
      '2026-10-18T14:00:00Z',
      '2026-10-18T14:05:00Z'
    );

    // Vérifier frames
    assert.ok(Array.isArray(donnees.frames));
    assert.ok(donnees.frames.length > 0);

    const frame = donnees.frames[0];
    assert.ok(frame.content);
    assert.ok(frame.content.timestamp);
    assert.ok(frame.content.app_name);
    assert.equal(frame.content.app_name, 'Google Chrome');

    // Vérifier audio
    assert.ok(Array.isArray(donnees.audio));
    assert.ok(donnees.audio.length > 0);

    const audio = donnees.audio[0];
    assert.ok(audio.content);
    assert.ok(audio.content.timestamp);
    assert.ok(audio.content.transcription);
  });

  test('filtre par plage horaire', async () => {
    const sessionDir = join(__dirname, '__fixtures__', 'session-test');

    const donnees = await recupererDonneesDepuisSqlite(
      sessionDir,
      '2026-10-18T14:03:00Z',
      '2026-10-18T14:05:00Z'
    );

    // Ne devrait avoir que les frames >= 14:03:00
    const timestamps = donnees.frames.map(f => f.content.timestamp);
    for (const ts of timestamps) {
      assert.ok(ts >= '2026-10-18T14:03:00Z');
    }
  });

  test('retourne des tableaux vides si aucune donnée', async () => {
    const sessionDir = join(__dirname, '__fixtures__', 'session-test');

    const donnees = await recupererDonneesDepuisSqlite(
      sessionDir,
      '2026-10-18T15:00:00Z',
      '2026-10-18T16:00:00Z'
    );

    assert.equal(donnees.frames.length, 0);
    assert.equal(donnees.audio.length, 0);
  });
});
