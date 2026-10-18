import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { recupererDonneesDepuisSqlite } from './screenpipe-sqlite.js';

// Base construite avec les colonnes et le format d'horodatage réels de Screenpipe.
let racine;

before(async () => {
  racine = await mkdtemp(join(tmpdir(), 'pitch-me-sqlite-'));
  await mkdir(join(racine, 'screenpipe'));
  const db = new DatabaseSync(join(racine, 'screenpipe', 'db.sqlite'));
  db.exec(`
    CREATE TABLE frames (
      id INTEGER PRIMARY KEY, timestamp TIMESTAMP NOT NULL, app_name TEXT, window_name TEXT,
      accessibility_text TEXT, full_text TEXT
    );
    CREATE TABLE audio_transcriptions (
      id INTEGER PRIMARY KEY, timestamp TIMESTAMP NOT NULL, transcription TEXT NOT NULL
    );
  `);
  const f = db.prepare('INSERT INTO frames (timestamp, app_name, window_name, accessibility_text, full_text) VALUES (?, ?, ?, ?, ?)');
  f.run('2026-10-18T06:07:08.900000+00:00', 'Firefox', 'Avant', null, 'avant le début');
  f.run('2026-10-18T06:07:09.526123+00:00', 'Firefox', 'Deck', null, 'texte OCR du deck');
  f.run('2026-10-18T06:07:20.000000+00:00', 'Firefox', 'Page', 'texte accessibilité', '');
  f.run('2026-10-18T06:07:28.912000+00:00', 'Firefox', 'Fin', null, 'dernière frame');
  f.run('2026-10-18T06:07:30.000000+00:00', 'Firefox', 'Après', null, 'après la fin');
  const a = db.prepare('INSERT INTO audio_transcriptions (timestamp, transcription) VALUES (?, ?)');
  a.run('2026-10-18T06:07:12.000000+00:00', 'bonjour');
  a.run('2026-10-18T06:09:00.000000+00:00', 'hors plage');
  db.close();
});

after(async () => {
  await rm(racine, { recursive: true, force: true });
});

describe('recupererDonneesDepuisSqlite', () => {
  test('lit frames et audio avec les colonnes réelles et inclut les bornes à la microseconde', async () => {
    const d = await recupererDonneesDepuisSqlite(racine, '2026-10-18T06:07:09.526Z', '2026-10-18T06:07:28.912Z');
    assert.deepEqual(d.frames.map(f => f.content.window_name), ['Deck', 'Page', 'Fin']);
    assert.equal(d.frames[0].content.app_name, 'Firefox');
    assert.equal(d.audio.length, 1);
    assert.equal(d.audio[0].content.transcription, 'bonjour');
  });

  test('prend full_text, puis accessibility_text en repli', async () => {
    const d = await recupererDonneesDepuisSqlite(racine, '2026-10-18T06:07:09.526Z', '2026-10-18T06:07:28.912Z');
    assert.equal(d.frames[0].content.text, 'texte OCR du deck');
    assert.equal(d.frames[1].content.text, 'texte accessibilité');
  });

  test('retourne des tableaux vides hors de la plage', async () => {
    const d = await recupererDonneesDepuisSqlite(racine, '2026-10-18T15:00:00Z', '2026-10-18T16:00:00Z');
    assert.equal(d.frames.length, 0);
    assert.equal(d.audio.length, 0);
  });

  test('message clair si la base est absente', async () => {
    await assert.rejects(
      () => recupererDonneesDepuisSqlite(join(racine, 'inexistant'), '2026-10-18T06:00:00Z', '2026-10-18T07:00:00Z'),
      /Base Screenpipe introuvable/
    );
  });
});
